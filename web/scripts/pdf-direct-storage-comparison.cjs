// Loopback upload experiment. Uses synthetic bytes and ephemeral lab signing keys.
const assert = require("node:assert/strict");
const { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } = require("node:crypto");
const { createServer } = require("node:http");
const { mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { build } = require("esbuild");

const originFor = server => `http://127.0.0.1:${server.address().port}`;
const listen = server => new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const pdfType = "application/pdf";
const maxBytes = 4 * 1024 * 1024;
const profiles = [
  { name: "8 Mbps / 20 ms", uploadThroughput: 1_000_000, latency: 20 },
  { name: "1.5 Mbps / 120 ms", uploadThroughput: 187_500, latency: 120 },
];
const sizes = [550 * 1024, 3 * 1024 * 1024];
const storageHop = { bytesPerSecond: 6_250_000, latencyMs: 25 };

function fixtureBytes(size) {
  const bytes = Buffer.alloc(size, 73);
  bytes.write("%PDF-1.4\n");
  bytes.write("\n%%EOF\n", size - 7);
  return bytes;
}

function reply(response, code, payload = {}) {
  response.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function boundedBody(request, sizeLimit) {
  const reader = request[Symbol.asyncIterator]();
  const chunks = [];
  let length = 0;
  for (;;) {
    const next = await reader.next();
    if (next.done) return Buffer.concat(chunks, length);
    length += next.value.length;
    if (length > sizeLimit) {
      request.resume();
      return null;
    }
    chunks.push(next.value);
  }
}

function createLab(directory) {
  const secret = randomBytes(32);
  const tokens = new Map(["owner-a", "owner-b"].map(owner => [owner, randomBytes(24).toString("hex")]));
  const sessions = new Map();
  let clockOffset = 0;
  const now = () => Date.now() + clockOffset;
  const approved = new Set(sizes.map(size => digest(fixtureBytes(size))));
  let appOrigin;
  const pathFor = id => join(directory, id);
  const sign = (id, entry) => createHmac("sha256", secret)
    .update(JSON.stringify(["PUT", id, entry.owner, entry.workspace, entry.size, entry.sha256, entry.expiresAt, pdfType]))
    .digest();
  const verify = (entry, bytes) => bytes?.length === entry.size && digest(bytes) === entry.sha256 &&
    bytes.subarray(0, 5).toString() === "%PDF-" && bytes.subarray(-6).toString() === "%%EOF\n";

  const storage = createServer(async (request, response) => {
    try {
      if (request.headers.origin === appOrigin) {
        response.setHeader("Access-Control-Allow-Origin", appOrigin);
        response.setHeader("Vary", "Origin");
      }
      const url = new URL(request.url, originFor(storage));
      if (request.method === "OPTIONS") {
        if (request.headers.origin !== appOrigin) return reply(response, 403);
        response.setHeader("Access-Control-Allow-Methods", "PUT");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type");
        response.setHeader("Access-Control-Max-Age", "300");
        return reply(response, 204);
      }
      const id = url.pathname.slice(1);
      const entry = sessions.get(id);
      const token = url.searchParams.get("signature") ?? "";
      if (request.method !== "PUT" || !entry || !/^[a-f0-9]{64}$/.test(token) ||
          !timingSafeEqual(sign(id, entry), Buffer.from(token, "hex")) || now() >= entry.expiresAt)
        return reply(response, 403);
      if (request.headers["content-type"] !== pdfType || Number(request.headers["content-length"]) !== entry.size)
        return reply(response, 400);
      const bytes = await boundedBody(request, entry.size);
      if (!verify(entry, bytes)) return reply(response, 422);
      try {
        await writeFile(pathFor(id), bytes, { flag: "wx" });
      } catch (error) {
        if (error.code === "EEXIST") return reply(response, 412);
        throw error;
      }
      return reply(response, 200);
    } catch {
      reply(response, 500);
    }
  });

  const api = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, originFor(api));
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, { "Content-Type": "text/html" });
        return response.end("<!doctype html><title>Clover upload benchmark</title>");
      }
      if (request.method !== "POST") return reply(response, 405);
      const cookieToken = /(?:^|; )clover-upload-lab=([a-f0-9]{48})(?:;|$)/.exec(request.headers.cookie ?? "")?.[1];
      const token = request.headers["x-lab-token"] ?? cookieToken;
      const owner = [...tokens].find(([, authorizedToken]) => token === authorizedToken)?.[0];
      const workspace = request.headers["x-lab-workspace"] ?? (cookieToken && owner && owner + "-profile");
      if (!owner || workspace !== owner + "-profile") return reply(response, 403);
      if (url.pathname === "/issue") {
        const body = await boundedBody(request, 1024);
        const { size, sha256 } = JSON.parse(body ?? "{}");
        if (!sizes.includes(size) || !approved.has(sha256)) return reply(response, 400);
        const id = randomUUID();
        const entry = { owner, workspace, size, sha256, expiresAt: now() + 60_000 };
        sessions.set(id, entry);
        const putUrl = `${originFor(storage)}/${id}?signature=${sign(id, entry).toString("hex")}`;
        return reply(response, 200, { id, putUrl });
      }
      if (url.pathname === "/complete") {
        const body = await boundedBody(request, 1024);
        const { id } = JSON.parse(body ?? "{}");
        const entry = sessions.get(id);
        if (!entry || entry.owner !== owner || entry.workspace !== workspace) return reply(response, 404);
        if (entry.complete) return reply(response, 200, { sha256: entry.sha256 });
        if (now() >= entry.expiresAt) return reply(response, 410);
        const bytes = await readFile(pathFor(id)).catch(error => {
          if (error.code !== "ENOENT") throw error;
          return null;
        });
        if (!verify(entry, bytes)) return reply(response, 422);
        await delay(storageHop.latencyMs + entry.size / storageHop.bytesPerSecond * 1000);
        entry.complete = true;
        return reply(response, 200, { sha256: entry.sha256 });
      }
      if (url.pathname === "/multipart") {
        const body = await boundedBody(request, maxBytes + 4096);
        if (!body) return reply(response, 413);
        const form = await new Response(body, { headers: { "Content-Type": request.headers["content-type"] } }).formData();
        const file = form.get("file");
        if (!(file instanceof File) || file.type !== pdfType || !sizes.includes(file.size)) return reply(response, 400);
        const bytes = Buffer.from(await file.arrayBuffer());
        const sha256 = digest(bytes);
        if (!approved.has(sha256)) return reply(response, 422);
        const path = pathFor(randomUUID());
        await delay(storageHop.latencyMs + bytes.length / storageHop.bytesPerSecond * 1000);
        await writeFile(path, bytes, { flag: "wx" });
        await rm(path);
        return reply(response, 200, { sha256 });
      }
      return reply(response, 404);
    } catch {
      reply(response, 500);
    }
  });

  return {
    api, storage, pathFor, tokens,
    setOrigin: origin => { appOrigin = origin; },
    advanceClock: milliseconds => { clockOffset += milliseconds; },
  };
}

async function verifyLab(lab) {
  const origin = originFor(lab.api);
  const headersFor = owner => ({ "x-lab-token": lab.tokens.get(owner), "x-lab-workspace": owner + "-profile" });
  const call = (path, body, owner = "owner-a", headers = headersFor(owner)) => fetch(origin + path, {
    method: "POST", headers, body: JSON.stringify(body),
  });
  const bytes = fixtureBytes(sizes[0]);
  const sha256 = digest(bytes);
  const issue = () => call("/issue", { size: bytes.length, sha256 });
  assert.equal((await call("/issue", { size: bytes.length, sha256 }, "owner-a", {})).status, 403);
  assert.equal((await call("/issue", { size: bytes.length, sha256 }, "owner-a", {
    ...headersFor("owner-a"), "x-lab-workspace": "owner-b-profile",
  })).status, 403);
  const { id, putUrl } = await (await issue()).json();
  const put = (url, body, type = pdfType) => fetch(url, { method: "PUT", body, headers: { "Content-Type": type } });
  assert.equal((await call("/complete", { id }, "owner-b")).status, 404);
  assert.equal((await call("/complete", { id })).status, 422);
  assert.equal((await put(putUrl.replace(id, randomUUID()), bytes)).status, 403);
  assert.equal((await put(putUrl, bytes, "application/octet-stream")).status, 400);
  assert.equal((await put(putUrl, bytes.subarray(0, -1))).status, 400);
  const tampered = Buffer.from(bytes);
  tampered[20] ^= 1;
  assert.equal((await put(putUrl, tampered)).status, 422);
  assert.equal((await put(putUrl, bytes)).status, 200);
  assert.equal((await put(putUrl, bytes)).status, 412);
  assert.equal((await call("/complete", { id }, "owner-b")).status, 404);
  await writeFile(lab.pathFor(id), tampered); // Simulate corruption behind the storage boundary.
  assert.equal((await call("/complete", { id })).status, 422);
  await writeFile(lab.pathFor(id), bytes);
  assert.deepEqual(await (await call("/complete", { id })).json(), { sha256 });
  assert.deepEqual(await (await call("/complete", { id })).json(), { sha256 });
  const expired = await (await issue()).json();
  lab.advanceClock(60_001);
  try {
    assert.equal((await put(expired.putUrl, bytes)).status, 403);
    assert.equal((await call("/complete", { id: expired.id })).status, 410);
  } finally {
    lab.advanceClock(-60_001);
  }
}

async function main() {
  const runs = Number(process.argv[2] ?? 5);
  assert(Number.isInteger(runs) && runs >= 0);
  const directory = await mkdtemp(join(tmpdir(), "clover-direct-storage-qa-"));
  const lab = createLab(directory);
  let browser;
  try {
    await listen(lab.api);
    await listen(lab.storage);
    lab.setOrigin(originFor(lab.api));
    await verifyLab(lab);
    console.error("PASS owner scope, exact size, SHA-256, signed scope, no overwrite, expiry, and idempotent completion");
    if (!runs) return;

    const { chromium } = require(process.env.CLOVER_BENCH_PLAYWRIGHT_MODULE ?? "playwright");
    const { outputFiles: [bundle] } = await build({
      entryPoints: [join(__dirname, "../lib/import-file-post.ts")], bundle: true, format: "iife",
      globalName: "CloverUpload", write: false, tsconfigRaw: {},
    });
    browser = await chromium.launch({ executablePath: process.env.CLOVER_BENCH_CHROMIUM_PATH });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.context().addCookies([{ name: "clover-upload-lab", value: lab.tokens.get("owner-a"), url: originFor(lab.api) }]);
    await page.goto(originFor(lab.api));
    await page.addScriptTag({ content: bundle.text });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    const samples = [];
    for (const { name, ...network } of profiles) {
      await cdp.send("Network.emulateNetworkConditions", { offline: false, downloadThroughput: 5_000_000, ...network });
      for (const size of sizes) {
        const sha256 = digest(fixtureBytes(size));
        for (let run = 0; run < runs; run++) {
          for (const mode of run % 2 === 0 ? ["multipart", "direct"] : ["direct", "multipart"]) {
            const timing = await page.evaluate(async ({ size, mode, sha256 }) => {
              const bytes = new Uint8Array(size).fill(73);
              const encoder = new TextEncoder();
              bytes.set(encoder.encode("%PDF-1.4\n"));
              bytes.set(encoder.encode("\n%%EOF\n"), size - 7);
              const file = new File([bytes], "synthetic.pdf", { type: "application/pdf" });
              const post = async (path, payload) => {
                const response = await fetch(path, { method: "POST", body: JSON.stringify(payload) });
                if (!response.ok) throw new Error(`Lab API status ${response.status}`);
                return response.json();
              };
              const start = performance.now();
              if (mode === "multipart") {
                const response = await CloverUpload.postFileWithProgress("/multipart", file);
                if (!response.ok || (await response.json()).sha256 !== sha256) throw new Error("Multipart verification failed");
                return { totalMs: performance.now() - start };
              }
              const checksum = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())))
                .map(value => value.toString(16).padStart(2, "0")).join("");
              const issued = await post("/issue", { size, sha256: checksum });
              const putStart = performance.now();
              const result = await fetch(issued.putUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
              if (!result.ok) throw new Error(`Storage PUT status ${result.status}`);
              const verifyStart = performance.now();
              if ((await post("/complete", { id: issued.id })).sha256 !== sha256) throw new Error("Storage verification failed");
              const end = performance.now();
              return { totalMs: end - start, prepareMs: putStart - start, putMs: verifyStart - putStart, verifyMs: end - verifyStart };
            }, { size, mode, sha256 });
            samples.push({ mode, network: name, size, run, ...timing });
          }
          console.error(`${name} · ${size} bytes · pair ${run + 1}/${runs}`);
        }
      }
    }
    const cohorts = profiles.flatMap(({ name: network }) => sizes.flatMap(size => ["multipart", "direct"].map(mode => {
      const timings = samples.filter(sample => sample.network === network && sample.size === size && sample.mode === mode)
        .map(sample => sample.totalMs).sort((a, b) => a - b);
      return { network, size, mode, attempts: timings.length,
        p50Ms: Math.round(timings[Math.ceil(timings.length * 0.5) - 1]),
        p90Ms: Math.round(timings[Math.ceil(timings.length * 0.9) - 1]) };
    })));
    console.log(JSON.stringify({ browser: browser.version(), storageHop, profiles, samples, cohorts }, null, 2));
  } finally {
    await browser?.close();
    lab.api.close();
    lab.storage.close();
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
