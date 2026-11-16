import assert from "node:assert/strict";
import { createServer, type Socket } from "node:net";
import { once } from "node:events";
import { sendContactInquiryEmail } from "../lib/contact-email";
import { sendNotificationMail } from "../lib/notification-mail.server";
import { MailDeliveryError } from "../lib/mail-delivery";

// Exercise the installed mail library and Clover's real mail functions. Every
// connection terminates at this loopback fixture; nothing leaves the machine.
const messages: Array<{ recipients: string[]; body: string }> = [];
const sockets = new Set<Socket>();
let fault: "auth" | "data_reject" | "lost_ack" | null = null;
const server = createServer((socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => socket.destroy());
  socket.setEncoding("utf8");
  socket.write("220 localhost Clover SMTP fixture\r\n");
  let buffer = "", body = "", inData = false;
  let recipients: string[] = [];
  socket.on("data", (chunk) => {
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf("\r\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (inData) {
        if (line === ".") {
          if (fault === "data_reject") { inData = false; socket.write("451 Explicit message rejection\r\n"); continue; }
          messages.push({ recipients: [...recipients], body });
          inData = false;
          if (fault === "lost_ack") { socket.destroy(); continue; }
          socket.write("250 Message accepted by local fixture\r\n");
        } else body += line.replace(/^\.\./, ".") + "\r\n";
      } else if (/^(?:EHLO|HELO) /i.test(line)) {
        socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
      } else if (/^AUTH PLAIN /i.test(line)) {
        socket.write(fault === "auth" ? "535 5.7.8 Authentication Failed\r\n" : "235 Authentication accepted\r\n");
      } else if (/^MAIL FROM:/i.test(line)) {
        recipients = [];
        body = "";
        socket.write("250 Sender accepted\r\n");
      } else if (/^RCPT TO:/i.test(line)) {
        if (line.includes("reject@example.invalid")) socket.write("550 Fixture recipient rejected\r\n");
        else {
          recipients.push(line);
          socket.write("250 Recipient accepted\r\n");
        }
      } else if (line === "DATA") {
        inData = true;
        socket.write("354 End with a dot\r\n");
      } else if (line === "QUIT") socket.end("221 Bye\r\n");
      else socket.write("250 OK\r\n");
    }
  });
});

async function main() {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const fixtureEnv = {
    ZOHO_SMTP_HOST: "127.0.0.1",
    ZOHO_SMTP_PORT: String(address.port),
    ZOHO_SMTP_USER: "sender@example.invalid",
    ZOHO_SMTP_PASSWORD: "local-fixture-only",
    CIRCLE_INVITATION_FROM: "notifications@example.invalid",
  };
  const original = Object.fromEntries(Object.keys(fixtureEnv).map((key) => [key, process.env[key]]));
  Object.assign(process.env, fixtureEnv);
  const timeout = setTimeout(() => {
    for (const socket of sockets) socket.destroy();
  }, 15_000);
  try {
    await sendContactInquiryEmail({
      name: "QA\r\nTester", email: " Reply@Example.Invalid ", message: "Receipt help",
      attachment: { name: "proof.txt", type: "text/plain", size: 5, dataUrl: "data:text/plain;base64,cHJvb2Y=" },
    });
    await sendNotificationMail(" User@Example.Invalid ", "Clover\r\nnotice", "Plain text notice", "<p>테스트 / Rupiah</p>");
    assert.equal(messages.length, 2);
    assert.deepEqual(messages[0]!.recipients, ["RCPT TO:<hello@clover.ph>"]);
    assert.match(messages[0]!.body, /Reply-To: reply@example\.invalid/i);
    assert.match(messages[0]!.body, /Subject: New Clover support request from QA Tester/);
    assert.match(messages[0]!.body, /filename=proof\.txt|filename="proof\.txt"/);
    assert.deepEqual(messages[1]!.recipients, ["RCPT TO:<user@example.invalid>"]);
    assert.match(messages[1]!.body, /From: Clover <notifications@example\.invalid>/);
    assert.match(messages[1]!.body, /Content-Type: multipart\/alternative/);
    assert.match(messages[1]!.body, /Content-Type: text\/html; charset=utf-8/);
    await assert.rejects(sendNotificationMail("reject@example.invalid", "Rejected", "Must fail"), /550|rejected/i);
    assert.equal(messages.length, 2, "Rejected recipients must not be reported as delivered");
    fault = "auth";
    await assert.rejects(sendNotificationMail("user@example.invalid", "Auth fixture", "Unsent"), error => error instanceof MailDeliveryError && error.outcome === "not_sent" && error.code === "authentication_failed");
    await assert.rejects(sendContactInquiryEmail({ name: "QA", email: "qa@example.invalid", message: "Unsent contact" }), error => error instanceof MailDeliveryError && error.outcome === "not_sent");
    assert.equal(messages.length, 2);
    fault = "data_reject";
    await assert.rejects(sendNotificationMail("user@example.invalid", "Rejected DATA", "Unsent"), error => error instanceof MailDeliveryError && error.outcome === "not_sent");
    assert.equal(messages.length, 2);
    fault = "lost_ack";
    await assert.rejects(sendNotificationMail("user@example.invalid", "Lost acknowledgement", "Accepted but no acknowledgement"), error => error instanceof MailDeliveryError && error.outcome === "unknown");
    assert.equal(messages.length, 3, "A post-DATA connection loss can hide an accepted message; never auto-retry it");
    console.log("SMTP compatibility passed: contact attachments, reply address, HTML, rejected recipient/auth/DATA and actual post-DATA lost acknowledgement, using loopback only.");
  } finally {
    clearTimeout(timeout);
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
