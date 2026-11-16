// Run with Playwright chromium installed. Use `10 native-protocol` for the resumable transport in Chromium.
const { createServer } = require("node:http");
const { stat } = require("node:fs/promises");
const { join } = require("node:path");
const { homedir } = require("node:os");
const { build } = require("esbuild");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.CLOVER_BENCH_PLAYWRIGHT_MODULE ?? "playwright");
const { cases } = require("./fixtures/original-pdf-statements/manifest.json");
const fixtureRoot = process.env.CLOVER_STATEMENT_SAMPLES_ROOT ?? join(homedir(), "Documents", "Bank Statements");
const selected = cases.filter(fixture => ["bdo-hybrid-ledger", "dbs-scanned-incomplete"].includes(fixture.id));
const profiles = [
  { name: "lab_8mbps_up_20ms", latency: 20, uploadThroughput: 1_000_000 },
  { name: "lab_1.5mbps_up_120ms", latency: 120, uploadThroughput: 187_500 },
];
async function main() {
  const runs = Number(process.argv[2] ?? "10");
  assert(Number.isInteger(runs) && runs > 0);
  const mode = process.argv[3] ?? "web";
  assert(mode === "web" || mode === "native-protocol");
  // Use the original file sizes only. The server receives synthetic bytes.
  const data = await Promise.all(selected.map(async ({ id, source, pages, tags }) => ({
    fixture: id, pages, pdfType: tags[0], size: (await stat(join(fixtureRoot, source))).size,
  })));
  const { outputFiles: [bundle] } = await build({
    stdin: {
      contents: 'export { postFileWithProgress } from "../lib/import-file-post"; export { uploadInParts } from "../../mobile/src/offline/resumable-upload";',
      resolveDir: __dirname, loader: "ts",
    },
    bundle: true, format: "iife", globalName: "CloverUpload", write: false, tsconfigRaw: {},
  });
  const browser = await chromium.launch({ executablePath: process.env.CLOVER_BENCH_CHROMIUM_PATH });
  const server = createServer((req, res) => {
    if (req.method === "POST") {
      let length = 0;
      req.on("data", chunk => {length += chunk.length;});
      req.on("end", () => {
        assert(length > 0);
        res.setHeader("Content-Type", "application/json");
        if (req.url?.startsWith("/uploads/")) {
          const state = req.url.includes("/start?") ? { parts: [], state: "uploading" }
            : req.url.includes("/complete?") ? { canonicalImportFileId: "synthetic-import" } : {};
          res.end(JSON.stringify(state));
        } else {
          res.end(JSON.stringify({ length }));
        }
      });
      return;
    }
    res.end("<html><body>Local upload benchmark</body></html>");
  });
  try {
    await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const samples = [];
    for (const mobile of mode === "web" ? [false, true] : [true]) {
      const context = await browser.newContext(mobile
        ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.goto(url);
      await page.addScriptTag({ content: bundle.text });
      const session = await context.newCDPSession(page);
      await session.send("Network.enable");
      for (const { name, ...conditions } of profiles) {
        await session.send("Network.emulateNetworkConditions", { offline: false, downloadThroughput: 5_000_000, ...conditions });
        for (const { size, ...fixture } of data) for (let run = 0; run < runs; run++) {
          const ms = await page.evaluate(async ({ size, mode }) => {
            if (mode === "native-protocol") {
              const base64 = btoa("\0".repeat(size));
              const file = { id: "synthetic", workspaceId: "qa", name: "synthetic.pdf", mimeType: "application/pdf", size };
              const request = async (path, options) => {
                const response = await fetch("/" + path, options);
                if (!response.ok) throw new Error("Resumable upload failed");
                return response.json();
              };
              const started = performance.now();
              const result = await CloverUpload.uploadInParts(request, file, base64, {
                signal: new AbortController().signal, progress: async () => {},
              });
              if (result.canonicalId !== "synthetic-import") throw new Error("Missing completion acknowledgement");
              return performance.now() - started;
            }
            const file = new File([new Uint8Array(size)], "synthetic.pdf", { type: "application/pdf" });
            const started = performance.now();
            const result = await CloverUpload.postFileWithProgress("/upload", file);
            const payload = await result.json();
            if (!result.ok || payload.length < size) throw new Error("Incomplete multipart body");
            return performance.now() - started;
          }, { size, mode });
          const platform = mode === "native-protocol" ? "native_protocol_chromium_lab"
            : mobile ? "mobile_web_chromium_lab" : "desktop_web_chromium_lab";
          samples.push({
            id: `${platform}:${name}:${fixture.fixture}:${run}`, ...fixture, platform,
            network: name, processing: "not_applicable",
            boundary: mode === "native-protocol" ? "resumable_upload_to_ack" : "multipart_upload_to_ack",
            outcome: "reached", ms,
          });
        }
        console.error("Completed", mode === "native-protocol" ? mode : mobile ? "mobile web" : "desktop web", name);
      }
      await context.close();
    }
    console.log(JSON.stringify({ version: 1, browser: browser.version(), profiles, samples }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
