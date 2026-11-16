// Run from web/ with tsx, then open the printed address on one client at a time.
// Set ?platform=desktop_chrome, mobile_web_chrome, ios_safari, or android_chrome.
// Android can reach the loopback listener through adb reverse on the selected port.
// This measures the shared server path from each browser, independent of native OCR.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { assessFinancialUploadScope } from "../lib/financial-upload-scope";
import { getBoundedImportImagePreview } from "../lib/import-image-validation.server";
import { readLocalReceiptImage, shutdownLocalReceiptOcr } from "../lib/local-receipt-ocr.server";
import manifest from "./fixtures/financial-photo-scope/manifest.json";

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) ids.push("telecom-official-receipt", "faded-long-pos-receipt", "itinerary-template-example-prices");
  const rounds = Number(process.env.CLOVER_VERDICT_ROUNDS ?? 3);
  assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 20, "Choose 1–20 trials per scenario.");
  const fixtures = await Promise.all(ids.map(async id => {
    const sample = manifest.cases.find(item => item.id === id && item.source === "receipt_samples");
    assert.ok(sample, `Unknown receipt fixture ${id}`);
    const bytes = await readFile(join(process.env.CLOVER_RECEIPT_SAMPLES_ROOT ?? join(homedir(), "Documents", "Receipt Samples"), sample.path));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), sample.sha256);
    return { id, expected: sample.expected.verdict, bytes, type: sample.format === "JPEG" ? "image/jpeg" : `image/${sample.format.toLowerCase()}` };
  }));

  let busy = false;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/fixture") {
      const fixture = fixtures.find(item => item.id === url.searchParams.get("id"));
      if (!fixture) return response.writeHead(404).end();
      return response.writeHead(200, { "Content-Type": fixture.type, "Cache-Control": "no-store" }).end(fixture.bytes);
    }
    if (url.pathname === "/result" && request.method === "POST") {
      let data = "";
      for await (const part of request) {
        data += part;
        if (data.length > 8_192) return response.writeHead(413).end();
      }
      try {
        console.log("VERDICT_RESULT", JSON.stringify(JSON.parse(data)));
        return response.writeHead(204).end();
      } catch {
        return response.writeHead(400).end();
      }
    }
    if (url.pathname === "/verdict" && request.method === "POST") {
      if (busy) return response.writeHead(409).end();
      const fixture = fixtures.find(item => item.id === url.searchParams.get("id"));
      if (!fixture) return response.writeHead(404).end();
      busy = true;
      try {
        const chunks: Buffer[] = [];
        let length = 0;
        for await (const part of request) {
          length += part.length;
          if (length > fixture.bytes.length) return response.writeHead(413).end();
          chunks.push(part);
        }
        const bytes = Buffer.concat(chunks);
        if (!bytes.equals(fixture.bytes)) return response.writeHead(400).end();
        if (url.searchParams.get("cold") === "1") await shutdownLocalReceiptOcr();
        // Simulate 400ms RTT and 1 Mbit/s upload pacing uniformly across clients.
        if (url.searchParams.get("slow") === "1") await delay(200 + Math.ceil(length / 125));
        const started = performance.now();
        const preview = await getBoundedImportImagePreview(new Uint8Array(bytes));
        const decoded = performance.now();
        const text = await readLocalReceiptImage(preview);
        const recognized = performance.now();
        const verdict = text ? assessFinancialUploadScope({ text, fileType: fixture.type }).decision : null;
        const result = {
          verdict, expected: fixture.expected, bytes: length,
          outcome: verdict ? "verdict" : "ocr_unavailable",
          decodeMs: decoded - started, ocrMs: recognized - decoded,
          classificationMs: performance.now() - recognized,
        };
        if (url.searchParams.get("slow") === "1") await delay(200);
        response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
      } catch (error) {
        console.error("VERDICT_SERVER_ERROR", error instanceof Error ? error.message : String(error));
        response.writeHead(500).end();
      } finally {
        busy = false;
      }
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`
      <!doctype html><meta name="viewport" content="width=device-width"><pre id="result">Running verdict matrix…</pre>
      <script type="module">
      const params = new URLSearchParams(location.search);
      const fixtures = ${JSON.stringify(fixtures.map(({ id, expected }) => ({ id, expected })))};
      const rounds = ${rounds};
      const mode = params.get("platform") || "unspecified";
      const rows = [];
      for (const { id, expected } of fixtures) {
        let photo;
        try {
          const file = await fetch("/fixture?id=" + encodeURIComponent(id));
          if (!file.ok) throw Error("fixture unavailable");
          photo = await file.blob();
        } catch {
          photo = null;
        }
        for (const scenario of ["baseline", "slow_network", "memory_load", "slow_network_and_memory_load"]) {
          const slow = scenario.includes("slow_network");
          let priorVerdictAvailable = false;
          for (let repeat = 0; repeat < rounds; repeat++) {
            let ballast;
            let started = performance.now();
            let measurement;
            try {
              if (!photo) throw Error("fixture unavailable");
              if (scenario.includes("memory_load")) {
                ballast = new Uint8Array(64 * 1024 * 1024);
                ballast.fill(1);
              }
              started = performance.now();
              const response = await fetch("/verdict?id=" + encodeURIComponent(id) + "&slow=" + +slow + "&cold=" + +(repeat === 0),
                { method: "POST", body: photo, signal: AbortSignal.timeout(45000) });
              if (!response.ok) throw Error("HTTP " + response.status);
              measurement = await response.json();
              if (ballast && ballast[0] !== 1) throw Error("memory load lost");
            } catch (error) {
              measurement = { verdict: null, outcome: "request_failed", error: String(error) };
            }
            const row = { platform: mode, id, expected, scenario, run: repeat === 0 ? "cold_requested" : "warm_requested",
              priorVerdictAvailable, trial: repeat + 1, simulatedRttMs: slow ? 400 : 0,
              clientMemoryLoadMiB: scenario.includes("memory_load") ? 64 : 0,
              clientLatencyMs: Math.round(performance.now() - started), ...measurement };
            priorVerdictAvailable = measurement.verdict !== null;
            rows.push(row);
            document.querySelector("#result").textContent = JSON.stringify(rows, null, 2);
            await fetch("/result", { method: "POST", body: JSON.stringify(row) })
              .catch(() => console.error("Could not post trial result; retained on page", row));
          }
        }
      }
      document.body.dataset.complete = "true";
      </script>`);
  });
  server.listen(Number(process.env.CLOVER_VERDICT_PORT ?? 4318), process.env.CLOVER_VERDICT_HOST ?? "127.0.0.1", () => {
    console.log("Verdict matrix ready", server.address());
  });
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
