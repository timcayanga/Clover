import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, relative, isAbsolute, sep } from "node:path";

const rates = {
  "gpt-5.4-mini": { input: 0.75, cached: 0.075, output: 4.5 },
  "gpt-6-luna": { input: 0.10, cached: 0.01, output: 0.50 },
  "gpt-5.5": { input: 5, cached: 0.5, output: 30 },
};
type Model = keyof typeof rates;
const fields = ["merchant", "date", "currency", "total"] as const;
type Field = (typeof fields)[number];
type Label = {
  id: string; sourcePath: string; sha256: string; sourceType: string;
} & Record<Field, { state: string; value?: string }>;
type Attempt = { exact: Record<Field, boolean | null>; output: boolean; elapsedMs: number; usd: number | null };
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const percentile90 = (values: number[]) => values.slice().sort((a, b) => a - b)[Math.ceil(values.length * 0.9) - 1];
const compareText = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const key = process.env.OPENAI_API_KEY?.trim();
  assert(dryRun || (process.env.CLOVER_RECEIPT_PROVIDER_EVAL === "1" && key),
    "For a live run set CLOVER_RECEIPT_PROVIDER_EVAL=1 and supply an OpenAI evaluation key through OPENAI_API_KEY.");
  const rounds = Number(process.env.CLOVER_RECEIPT_BENCHMARK_ROUNDS ?? 3);
  assert(Number.isInteger(rounds) && rounds >= 1 && rounds <= 5);
  const manifest = await readFile(process.env.CLOVER_RECEIPT_LABELS ?? join(homedir(), "Documents", "Clover File Organization", "Receipt Photo QA", "original-receipt-labels.json"));
  const root = await realpath(process.env.CLOVER_RECEIPT_SAMPLES_ROOT ?? join(homedir(), "Documents", "Receipt Samples"));
  const { cases } = JSON.parse(manifest.toString()) as { cases: Label[] };
  const casesToRun = cases.filter(label => label.sourceType === "retained_public_sample");
  assert(casesToRun.length > 0 && casesToRun.length <= 20);
  const unique = new Set<string>();
  const photos = await Promise.all(casesToRun.map(async label => {
    const source = await realpath(join(root, label.sourcePath));
    const scoped = relative(root, source);
    assert(!isAbsolute(scoped) && scoped.startsWith("Organized Samples" + sep), "Expected public QA material");
    const bytes = await readFile(source);
    assert.equal(hash(bytes), label.sha256, "Label/image hash mismatch");
    assert(!unique.has(label.sha256), "Duplicate photo");
    unique.add(label.sha256);
    const extension = extname(source).toLowerCase();
    const mimeType = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[extension];
    assert(mimeType, "Unsupported fixture format");
    return { label, mimeType, extension, dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}` };
  }));

  const require = createRequire(import.meta.url);
  for (const [name, exports] of [
    ["../lib/ai-consent", { maySendToCloudAi: async () => true }],
    ["../lib/clover-token-usage", { mayUseImportCloudAi: async () => true, calculateModelCloverTokens: () => 0 }],
  ] as const) {
    const path = require.resolve(name);
    require.cache[path] = { id: path, filename: path, loaded: true, exports } as NodeModule;
  }
  if (dryRun) process.env.OPENAI_API_KEY = "qa-never-sent";
  const { parseImportTextWithOpenAIFallback } = await import("../lib/openai-import-parser");
  const baseFetch = globalThis.fetch;
  const models = Object.keys(rates) as Model[];
  const baseline = models[0];
  const attempts = new Map(models.map(model => [model, [] as Attempt[]]));
  let active: { model: Model; usd: number; missingUsage: boolean; requests: number; fixtureHash: string } | undefined;
  const firstPayloads = new Map<string, string>();
  globalThis.fetch = async (input, init) => {
    assert(active && String(input) === "https://api.openai.com/v1/responses", "Unexpected benchmark network request");
    const attempt = active;
    assert(attempt.requests < 4, "Provider request budget exceeded");
    const request = JSON.parse(String(init?.body));
    request.model = attempt.model;
    request.store = false;
    request.reasoning = { effort: "none" };
    if (attempt.requests++ === 0) {
      const fingerprint = hash(Buffer.from(JSON.stringify({ ...request, model: "paired" })));
      const prior = firstPayloads.get(attempt.fixtureHash);
      if (prior) assert.equal(fingerprint, prior, "Candidate first calls must use identical image and prompt");
      else firstPayloads.set(attempt.fixtureHash, fingerprint);
    }
    const response = dryRun
      ? new Response(JSON.stringify({ error: { code: "synthetic_smoke", message: "Simulated failure" } }), { status: 400 })
      : await baseFetch(input, { ...init, body: JSON.stringify(request) }).catch(error => {
        attempt.missingUsage = true;
        throw error;
      });
    const usage = (await response.clone().json().catch(() => null))?.usage;
    if (Number.isFinite(usage?.input_tokens) && Number.isFinite(usage?.output_tokens)) {
      const { input, cached, output } = rates[attempt.model];
      const cachedTokens = usage.input_tokens_details?.cached_tokens ?? 0;
      const cacheWrites = usage.input_tokens_details?.cache_write_tokens ?? 0;
      attempt.usd += ((usage.input_tokens - cachedTokens - cacheWrites) * input +
        cachedTokens * cached + cacheWrites * input * 1.25 + usage.output_tokens * output) / 1e6;
    } else if (response.ok || response.status >= 500) attempt.missingUsage = true;
    return response;
  };

  // Keep the public report aggregate even if the parser logs OCR details.
  const originalConsole = { info: console.info, warn: console.warn, log: console.log, error: console.error };
  console.info = console.warn = console.log = console.error = () => {};
  try {
    for (let round = 0; round < rounds; round++) {
      for (const [index, photo] of photos.entries()) {
        for (const offset of models.keys()) {
          const model = models[(round + index + offset) % models.length];
          active = { model, usd: 0, missingUsage: false, requests: 0, fixtureHash: photo.label.sha256 };
          const started = performance.now();
          const result = await parseImportTextWithOpenAIFallback({
            text: "", fileName: "receipt" + photo.extension, fileType: photo.mimeType, importMode: "receipt",
            pageImages: [{ page: 1, dataUrl: photo.dataUrl }], receiptCoreOnly: true,
            forceFallback: true, consentUserId: "receipt-benchmark", detectedMetadata: null, parsedRows: [],
          });
          const elapsedMs = Math.round(performance.now() - started);
          const details = result?.audit.schemaValidated && result.classificationVerdict?.documentType === "receipt"
            ? result.receiptDetails : null;
          const prediction = { merchant: details?.merchant_raw, date: details?.transaction_date, currency: details?.currency, total: details?.total };
          const exact = Object.fromEntries(fields.map(field => {
            const truth = photo.label[field];
            const got = prediction[field];
            return [field, truth.state !== "observed" ? null : got == null ? false :
              field === "total" ? Number(got) === Number(truth.value) : compareText(String(got)) === compareText(truth.value ?? "")];
          })) as Attempt["exact"];
          attempts.get(model)!.push({ exact, output: Boolean(details), elapsedMs, usd: active.missingUsage || !active.requests ? null : active.usd });
        }
      }
    }
  } finally {
    globalThis.fetch = baseFetch;
    Object.assign(console, originalConsole);
  }
  const results = models.map(model => {
    const rows = attempts.get(model)!;
    const allCore = rows.filter(row => fields.every(field => row.exact[field] !== null));
    const costs = rows.flatMap(row => row.usd === null ? [] : [row.usd]);
    return {
      model, attempts: rows.length, failedOrUnverified: rows.filter(row => !row.output).length,
      fields: Object.fromEntries(fields.map(field => [field, {
        exact: rows.filter(row => row.exact[field] === true).length,
        labeled: rows.filter(row => row.exact[field] !== null).length,
      }])),
      allCore: { exact: allCore.filter(row => fields.every(field => row.exact[field])).length, labeled: allCore.length },
      p90AttemptMs: percentile90(rows.map(row => row.elapsedMs)),
      pricedAttempts: costs.length,
      meanEstimatedUsdPerAttempt: costs.length === rows.length ? costs.reduce((sum, cost) => sum + cost, 0) / rows.length : null,
    };
  });
  console.log(JSON.stringify({ run: dryRun ? "synthetic_transport_smoke" : "public_diagnostic", photos: photos.length, rounds,
    manifestSha256: hash(manifest), allCoreLabeledPhotos: photos.filter(({ label }) => fields.every(field => label[field].state === "observed")).length,
    baseline, results }, null, 2));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Receipt benchmark failed"); process.exitCode = 1; });
