// Run from web with tsx and an installed Playwright Chromium.
// The server receives generated PDFs only. This experiment is outside the app bundle.
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { gzipSync } = require("node:zlib");
const { readFile } = require("node:fs/promises");
const { dirname, join } = require("node:path");
const { build } = require("esbuild");
const { chromium } = require(process.env.CLOVER_BENCH_PLAYWRIGHT_MODULE ?? "playwright");
const { readUploadedFileText } = require("../lib/import-file-text.server.ts");
const { parseImportText } = require("../lib/import-parser.ts");

const maxBytes = 512 * 1024;
const maxPages = 3;
const timeoutMs = 750;
const runs = Number(process.argv[2] ?? "8");
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const expectedRows = [
  ["2026-10-02", "income", 25.50],
  ["2026-10-03", "expense", 15.25],
  ["2026-10-03", "expense", 15.25],
];

function makePdf(pageCount, padding) {
  const header = ["Example Bank", "Statement of Account", "Account Number: 7000012345",
    "Currency: PHP", "Statement Period: 2026-10-01 to 2026-10-31", "Opening Balance 1000.00",
    "Date Description Amount Balance"];
  const rows = ["2026-10-02 Payroll PHP +25.50 CR 1025.50", "2026-10-03 Blue Cafe PHP -15.25 DR 1010.25",
    "2026-10-03 Blue Cafe PHP -15.25 DR 995.00"];
  const pages = Array.from({ length: pageCount }, (_, i) => [
    ...(i === 0 ? header : []),
    ...(pageCount === 1 ? rows : rows.slice(i, i + 1)),
    ...(i === pageCount - 1 ? ["Closing Balance 995.00"] : []),
    `Page ${i + 1} of ${pageCount}`,
  ]);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pageCount} /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...pages.flatMap((lines, i) => {
      const stream = " ".repeat(i === 0 ? padding : 0) +
        `BT /F1 11 Tf 50 750 Td 18 TL ${lines.map(line => `(${line}) Tj T*`).join("\n")} ET`;
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      ];
    }),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return String(offset).padStart(10, "0") + " 00000 n \n";
  });
  return Buffer.from(pdf + `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n` + offsets.join("") +
    `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${pdf.length}\n%%EOF\n`);
}

const workerSource = `
  import { getDocument, PDFWorker, PasswordResponses } from "/pdf.mjs";
  self.onmessage = async ({data: {file, maxPages}}) => {
    const port = new Worker("/pdf.worker.mjs", { type: "module" });
    const worker = new PDFWorker({ port });
    const task = getDocument({
      worker, data: new Uint8Array(await file.arrayBuffer()), stopAtErrors: true,
      disableFontFace: true, standardFontDataUrl: self.location.origin + "/standard_fonts/",
    });
    try {
      const document = await task.promise;
      if (document.numPages > maxPages) return self.postMessage({ outcome: "page_limit" });
      let textItems = 0;
      let transactionLines = 0;
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const { items } = await page.getTextContent();
        textItems += items.filter(item => item.str?.trim()).length;
        transactionLines += items.filter(item => /^2026-10-0[23] /.test(item.str ?? "")).length;
      }
      self.postMessage({ outcome: textItems ? "text_present" : "no_text", textItems, transactionLines });
    } catch (error) {
      const locked = error?.code === PasswordResponses.NEED_PASSWORD || error?.code === PasswordResponses.INCORRECT_PASSWORD;
      self.postMessage({ outcome: locked ? "locked" : "unavailable" });
    } finally {
      await task.destroy().catch(() => {});
      worker.destroy();
      port.terminate();
    }
  };
`;

async function main() {
  assert(Number.isInteger(runs) && runs > 0);
  const fixtures = { short: makePdf(1, 24 * 1024), larger: makePdf(3, 320 * 1024), pages: makePdf(4, 0), bytes: makePdf(1, 520 * 1024) };
  const assets = new Map(await Promise.all(["pdf.mjs", "pdf.worker.mjs"].map(async name =>
    [`/${name}`, gzipSync(await readFile(join(pdfjsRoot, "build", name.replace(".mjs", ".min.mjs"))))])));
  const { outputFiles: [uploadCode] } = await build({
    stdin: { contents: 'export { postFileWithProgress } from "../lib/import-file-post";', resolveDir: __dirname },
    bundle: true, format: "iife", globalName: "CloverUpload", write: false,
  });
  async function verify(file) {
    const text = await readUploadedFileText(file, undefined, { importMode: "statement" });
    const rows = parseImportText(text, file.name, file.type);
    assert.deepEqual(rows.map(row => [
      new Date(row.date).toISOString().slice(0, 10), row.type, Math.abs(Number(row.amount)),
    ]), expectedRows);
    assert(rows.every(row => row.currency === "PHP"));
  }
  for (const name of ["short", "larger"]) {
    await verify(new File([fixtures[name]], "fixture.pdf", { type: "application/pdf" }));
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (req.method === "POST" && url.pathname === "/upload") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = await new Request("http://localhost", { method: "POST", headers: {
          "Content-Type": req.headers["content-type"],
        }, body: Buffer.concat(chunks) }).formData();
        assert.deepEqual([...body.keys()], ["file"], "Server must receive only the original PDF");
        const file = body.get("file");
        const fixture = fixtures[url.searchParams.get("fixture")];
        assert(Buffer.from(await file.arrayBuffer()).equals(fixture), "Original bytes must be preserved");
        await verify(file);
        res.end("verified");
      } else if (assets.has(url.pathname)) {
        res.setHeader("Content-Type", "text/javascript");
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.setHeader("Content-Encoding", "gzip");
        res.end(assets.get(url.pathname));
      } else if (url.pathname === "/local-text.mjs") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(workerSource);
      } else if (url.pathname.startsWith("/standard_fonts/")) {
        res.end(await readFile(join(pdfjsRoot, "standard_fonts", url.pathname.split("/").pop())));
      } else {
        res.setHeader("Content-Type", "text/html");
        res.end("<!doctype html><title>Clover PDF extraction benchmark</title>");
      }
    } catch (error) {
      console.error(error);
      res.writeHead(500).end("verification failed");
    }
  });
  const browser = await chromium.launch({ executablePath: process.env.CLOVER_BENCH_CHROMIUM_PATH });
  const samples = [];
  try {
    await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    for (const mobile of [false, true]) {
      for (const network of [
        { name: "8Mbps", latency: 20, uploadThroughput: 1_000_000, downloadThroughput: 1_000_000 },
        { name: "1.5Mbps", latency: 120, uploadThroughput: 187_500, downloadThroughput: 375_000 },
      ]) {
        const context = await browser.newContext(mobile
          ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
          : { viewport: { width: 1440, height: 900 } });
        try {
          const page = await context.newPage();
          await page.goto(url);
          await page.addScriptTag({ content: uploadCode.text });
          const cdp = await context.newCDPSession(page);
          const { name, ...conditions } = network;
          await cdp.send("Network.enable");
          await cdp.send("Network.emulateNetworkConditions", { offline: false, ...conditions });
          let localRuns = 0;
          for (let run = 0; run <= runs + 1; run++) {
            // Cache the reader assets outside measured uploads. Without this
            // step a cold timeout can abort the asset fetch on every retry.
            if (run === 1) {
              await page.evaluate(() => Promise.all(["/pdf.mjs", "/pdf.worker.mjs"].map(async path => {
                const response = await fetch(path);
                if (!response.ok) throw Error("Unable to cache the browser reader");
                await response.arrayBuffer();
              })));
            }
            const boundsCheck = run === runs + 1;
            for (const fixture of boundsCheck ? ["pages", "bytes"] : run === 0 ? ["short"] : ["short", "larger"]) {
              for (const shadow of boundsCheck ? [true] : run % 2 ? [true, false] : [false, true]) {
                const result = await page.evaluate(async ({ base64, fixture, shadow, maxBytes, maxPages, timeoutMs }) => {
                  const file = new File([Uint8Array.from(atob(base64), byte => byte.charCodeAt(0))],
                    "fixture.pdf", { type: "application/pdf" });
                  const start = performance.now();
                  let uploadedAt = null;
                  const upload = CloverUpload.postFileWithProgress(`/upload?fixture=${fixture}`, file, {}, undefined, {
                    onUploadComplete: () => { uploadedAt = performance.now() - start; },
                  }).then(async response => {
                    if (!response.ok || await response.text() !== "verified") throw Error("Server verification failed");
                    return performance.now() - start;
                  });
                  let reader;
                  let timer;
                  const local = shadow && file.size <= maxBytes && typeof Worker === "function"
                    ? new Promise(resolve => {
                        const began = performance.now();
                        const finish = result => resolve({ ...result, elapsedMs: performance.now() - began });
                        try {
                          reader = new Worker("/local-text.mjs", { type: "module" });
                          timer = setTimeout(() => finish({ outcome: "timeout" }), timeoutMs);
                          reader.onmessage = event => {
                            if (typeof event.data?.outcome === "string") finish(event.data);
                          };
                          reader.onerror = event => { event.preventDefault(); finish({ outcome: "unavailable" }); };
                          reader.postMessage({ file, maxPages });
                        } catch { finish({ outcome: "unavailable" }); }
                      }).finally(() => { clearTimeout(timer); reader?.terminate(); })
                    : Promise.resolve({ outcome: shadow ? "ineligible" : "disabled" });
                  const serverMs = await upload;
                  return { serverMs, uploadMs: uploadedAt, local: await local };
                }, { base64: fixtures[fixture].toString("base64"), fixture, shadow, maxBytes, maxPages, timeoutMs: boundsCheck ? 3_000 : timeoutMs });
                if (result.local.outcome === "text_present") assert.equal(result.local.transactionLines, 3);
                if (boundsCheck) {
                  assert.equal(result.local.outcome, fixture === "pages" ? "page_limit" : "ineligible");
                  continue;
                }
                const workerAttempt = shadow ? localRuns++ : null;
                samples.push({ workerAttempt, assetCache: run ? "warm" : "cold", surface: mobile ? "mobile-web viewport" : "desktop", network: name, run, fixture, shadow, ...result });
              }
            }
          }
        } finally { await context.close(); }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  assert(samples.some(sample => sample.local.outcome === "text_present"), "Browser reader never completed");
  console.log(JSON.stringify({ compressedAssetBytes: [...assets.values()].reduce((total, asset) => total + asset.length, 0), limits: { maxBytes, maxPages, timeoutMs }, samples }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
