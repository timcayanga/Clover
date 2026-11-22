import assert from "node:assert/strict";
import { normalizeDeviceTextEvidence } from "../../shared/device-text-evidence";
import { encodeLocalReceiptOcr, readLocalReceiptOcrText } from "../lib/local-receipt-ocr-envelope";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, isAbsolute, join, relative, sep } from "node:path";

const core = ["merchant", "date", "currency", "total"] as const;
const itemFields = ["description", "quantity", "unitPrice", "lineAmount"] as const;
type Field<T extends string> = Record<T, string | null>;
type Fact = { state: string; value?: string };
type Label = {
  id: string; sourcePath: string; sha256: string;
  itemCoverage: string; items: Record<typeof itemFields[number], Fact>[];
} & Record<typeof core[number], Fact>;
type Prediction = {
  id: string; route: string; outcome: "extracted" | "review" | "rejected" | "failed" | "unavailable";
  elapsedMs?: number;
  core?: Field<typeof core[number]>;
  reviewReasons?: Array<"optical_preview_policy" | "missing_merchant" | "missing_date" | "missing_total" | "currency_conflict" | "parser_review">;
  items?: Field<typeof itemFields[number]>[];
};
type Count = { exact: number; labeled: number };
const normalize = (value: string | null | undefined) => value?.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase() || null;
function amount(value: string | null | undefined) {
  if (!value || !/^-?\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return `${whole.startsWith("-") && BigInt(whole) === 0n && /[1-9]/.test(fraction) ? "-0" : BigInt(whole)}${fraction.replace(/0+$/, "") ? "." + fraction.replace(/0+$/, "") : ""}`;
}
const normalizeField = (field: string, value: string | null | undefined) =>
  ["total", "quantity", "unitPrice", "lineAmount"].includes(field) ? amount(value) : normalize(value);

function consume(counts: Map<string, number>, key: string) {
  const remaining = counts.get(key) ?? 0;
  if (remaining) counts.set(key, remaining - 1);
  return remaining > 0;
}
function add(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
function score(labels: Label[], predictions: Prediction[]) {
  const ids = new Set(labels.map(label => label.id));
  assert.equal(ids.size, labels.length);
  const routes = new Map<string, Map<string, Prediction>>();
  for (const prediction of predictions) {
    assert(ids.has(prediction.id), "Unknown photo ID");
    assert(prediction.route && ["extracted", "review", "rejected", "failed", "unavailable"].includes(prediction.outcome));
    const route = routes.get(prediction.route) ?? new Map();
    assert(!route.has(prediction.id), "Duplicate route/photo result");
    route.set(prediction.id, prediction);
    routes.set(prediction.route, route);
  }
  assert(routes.size, "No route results");
  return [...routes].map(([route, results]) => {
    const fields = Object.fromEntries(core.map(field => [field, { exact: 0, labeled: 0, suppliedForUnobservable: 0 }])) as
      Record<typeof core[number], Count & { suppliedForUnobservable: number }>;
    const itemExactness = Object.fromEntries(itemFields.map(field => [field, { exact: 0, labeled: 0 }])) as
      Record<typeof itemFields[number], Count>;
    const caseSummary: Array<{ photo: number; discrepancies: string[]; matchedItems: number; labeledItems: number; unmatchedOutputItems: number }> = [];
    let automaticCoreExact = 0;
    const allCore = { exact: 0, labeled: 0 }, allObservableCore = { exact: 0, labeled: 0 };
    const items = { matchedDescriptions: 0, labeled: 0, extraOnCompletePhotos: 0, excessRowCount: 0, missingRowCount: 0, completePhotos: 0, allItemsExact: 0 };
    const reviewReasons: Record<string, number> = {};
    const outcomes = { extracted: 0, review: 0, rejected: 0, failed: 0, unavailable: 0 };
    for (const label of labels) {
      const result = results.get(label.id);
      const outcome = result?.outcome ?? "unavailable";
      outcomes[outcome]++;
      if (outcome === "review") for (const reason of new Set(result?.reviewReasons)) {
        reviewReasons[reason] = (reviewReasons[reason] ?? 0) + 1;
      }
      if (outcome === "unavailable") continue;
      const hasOutput = outcome === "extracted" || outcome === "review";
      const got = hasOutput ? result?.core : undefined;
      const discrepancies: string[] = [];
      let checked = 0, correct = 0;
      for (const field of core) {
        const observed = normalizeField(field, got?.[field]);
        if (label[field].state !== "observed") {
          if (observed) {
            fields[field].suppliedForUnobservable++;
            discrepancies.push(field + " supplied without an observable label");
          }
          continue;
        }
        checked++;
        fields[field].labeled++;
        if (observed !== null && observed === normalizeField(field, label[field].value)) {
          fields[field].exact++;
          correct++;
        } else {
          discrepancies.push(field + (observed === null ? " missing" : " mismatch"));
        }
      }
      if (checked === core.length) {
        allCore.labeled++;
        if (correct === checked) {
          allCore.exact++;
          if (outcome === "extracted") automaticCoreExact++;
        }
      }
      if (checked) {
        allObservableCore.labeled++;
        if (correct === checked) allObservableCore.exact++;
      }
      const actualItems = hasOutput ? result?.items ?? [] : [];
      const occurrences = new Map<string, number>();
      const values = new Map<string, number>();
      for (const item of actualItems) {
        const name = normalize(item.description);
        if (!name) continue;
        add(occurrences, name);
        for (const field of itemFields) {
          const value = normalizeField(field, item[field]);
          if (value !== null) add(values, JSON.stringify([name, field, value]));
        }
      }
      let matched = 0;
      // Count exact full occurrences separately from partial field matches.
      const remaining = actualItems.slice();
      let exactItems = 0;
      for (const item of label.items) {
        if (item.description.state !== "observed") continue;
        const name = normalize(item.description.value)!;
        items.labeled++;
        if (consume(occurrences, name)) matched++;
        const index = remaining.findIndex(candidate => itemFields.every(field =>
          item[field].state !== "observed" || normalizeField(field, candidate[field]) === normalizeField(field, item[field].value)
        ));
        if (index >= 0) {
          remaining.splice(index, 1);
          exactItems++;
        }
        for (const field of itemFields) {
          if (item[field].state !== "observed") continue;
          itemExactness[field].labeled++;
          if (consume(values, JSON.stringify([name, field, normalizeField(field, item[field].value)]))) itemExactness[field].exact++;
        }
      }
      if (process.argv.includes("--case-summary")) {
        caseSummary.push({ photo: labels.indexOf(label) + 1, discrepancies, matchedItems: matched,
          labeledItems: label.items.filter(item => item.description.state === "observed").length,
          unmatchedOutputItems: actualItems.length - matched });
      }
      items.matchedDescriptions += matched;
      if (label.itemCoverage === "complete") {
        items.completePhotos++;
        // The historical metric counts unmatched spellings as well as spurious rows.
        items.extraOnCompletePhotos += actualItems.length - matched;
        items.excessRowCount += Math.max(0, actualItems.length - label.items.length);
        items.missingRowCount += Math.max(0, label.items.length - actualItems.length);
        if (exactItems === label.items.length && actualItems.length === label.items.length) items.allItemsExact++;
      }
    }
    const attempted = labels.length - outcomes.unavailable;
    const durations = [...results.values()].flatMap(p => p.elapsedMs === undefined ? [] : [p.elapsedMs]).sort((a,b) => a-b);
    return {
      ...(durations.length ? { timingMs: { samples: durations.length, median: durations[Math.ceil(durations.length / 2) - 1], max: durations.at(-1) } } : {}),
      ...(caseSummary.length ? { caseSummary } : {}),
      route, photos: labels.length, attempted, outcomes, reviewReasons, fields, allCore, automaticCoreExact, allObservableCore, itemExactness,
      items: { ...items, completeness: items.labeled ? items.matchedDescriptions / items.labeled : null },
      reviewRate: attempted ? outcomes.review / attempted : null,
    };
  });
}

async function runOcrProbe(executable: string, bytes: Uint8Array) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executable, [], { stdio: ["pipe", "pipe", "ignore"], timeout: 30_000 });
    let text = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => { text += chunk; });
    child.on("error", reject);
    child.stdin.on("error", reject);
    child.on("close", code => code === 0 ? resolve(text) : reject(new Error("Local OCR probe failed")));
    child.stdin.end(bytes);
  });
}

async function main() {
  const manifestPath = process.env.CLOVER_RECEIPT_LABELS ??
    join(homedir(), "Documents", "Clover File Organization", "Receipt Photo QA", "original-receipt-labels.json");
  const { cases: labels } = JSON.parse(await readFile(manifestPath, "utf8")) as { cases: Label[] };
  if (process.argv[2] === "--claim") {
    const [diagnosticPath, exposurePath, runPath] = process.argv.slice(3);
    assert(process.env.CLOVER_RECEIPT_LABELS && diagnosticPath && exposurePath && runPath,
      "Set CLOVER_RECEIPT_LABELS to the private blind manifest and supply diagnostic, exposure inventory, and run files");
    const verifier = new URL("./fixtures/original-receipt-photos/verify.mjs", import.meta.url);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [decodeURIComponent(verifier.pathname), manifestPath, diagnosticPath, exposurePath], { stdio: ["ignore", "ignore", "inherit"] });
      child.on("error", reject);
      child.on("close", code => code === 0 ? resolve() : reject(new Error("Blind corpus verification failed")));
    });
    const run = JSON.parse(await readFile(runPath, "utf8")) as {
      release: string; manifestSha256: string; routes: string[]; predictions: Prediction[];
    };
    assert(typeof run.release === "string" && run.release.trim(), "Record the evaluated release");
    assert.equal(run.manifestSha256, createHash("sha256").update(await readFile(manifestPath)).digest("hex"), "Results must reference the frozen blind manifest");
    const routeScores = score(labels, run.predictions);
    assert(Array.isArray(run.routes) && run.routes.length > 0, "Declare the routes covered by the claim");
    assert.deepEqual(routeScores.map(report => report.route).sort(), [...run.routes].sort(), "Run must cover all declared routes");
    const reports = routeScores.map(report => {
      assert.equal(report.outcomes.unavailable, 0, "Every blind photo must have an outcome for each claimed route");
      const { automaticCoreExact, allCore, ...metrics } = report;
      assert(allCore.labeled > 0, "The blind set needs photos with all core fields labeled");
      const n = allCore.labeled;
      const p = automaticCoreExact / n;
      const z = 1.96;
      const lower95 = Math.max(0, (p + z*z/(2*n) - z*Math.sqrt((p*(1-p)+z*z/(4*n))/n)) / (1+z*z/n));
      return { ...metrics, allCore, automaticCore: { exact: automaticCoreExact, eligible: n, rate: p, lower95 } };
    });
    console.log(JSON.stringify({ release: run.release, manifestSha256: run.manifestSha256, reports }, null, 2));
    return;
  }
  if (process.argv[2] === "--score") {
    const inputs = await Promise.all(process.argv.slice(3).map(async path => JSON.parse(await readFile(path, "utf8")) as Prediction[]));
    console.log(JSON.stringify(score(labels, inputs.flat()), null, 2));
    return;
  }
  const visionOnly = process.argv[2] === "--vision-only";
  assert(visionOnly || process.argv[2] === "--local", "Use --local, --vision-only, or --score");
  const root = await realpath(process.env.CLOVER_RECEIPT_SAMPLES_ROOT ?? join(homedir(), "Documents", "Receipt Samples"));
  const sources = await Promise.all(labels.map(async label => {
    const path = await realpath(join(root, label.sourcePath));
    const scoped = relative(root, path);
    assert(!isAbsolute(scoped) && ["Actual Receipts", "Organized Samples"].some(folder => scoped.startsWith(folder + sep)));
    const bytes = await readFile(path);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), label.sha256);
    return { id: label.id, bytes: Uint8Array.from(bytes), extension: extname(path).toLowerCase() };
  }));
  globalThis.fetch = async () => { throw new Error("Receipt corpus evaluation runs locally"); };
  const { readUploadedFileText, shutdownImportOcrWorkers } = await import("../lib/import-file-text.server");
  const { parseReceiptPhotoText } = await import("../lib/split-bill");
  const { getBoundedImportImagePreview } = await import("../lib/import-image-validation.server");
  const { readLocalReceiptImage } = await import("../lib/local-receipt-ocr.server");
  const results: Prediction[] = [];
  const vision = process.env.CLOVER_RECEIPT_VISION_PROBE;
  assert(!visionOnly || vision, "Set CLOVER_RECEIPT_VISION_PROBE to an executable");
  const probeRoutes = { ios_simulator: "ios_simulator_vision_probe", android_emulator: "android_emulator_ml_kit_probe" } as const;
  const probePlatform = process.env.CLOVER_RECEIPT_VISION_PLATFORM;
  const visionRoute = probePlatform === "ios_simulator" || probePlatform === "android_emulator"
    ? probeRoutes[probePlatform] : "macos_vision_probe";
  const unavailable = ["ios_vision", "android_ml_kit", "backup_visual"];
  try {
    for (const source of sources) {
      const type = source.extension === ".webp" ? "image/webp" : "image/jpeg";
      const file = new File([source.bytes], "photo" + source.extension, { type });
      const routes: Record<string, () => Promise<string | null>> = {};
      if (vision) {
        const structured = process.argv.includes("--structured-probe");
        routes[structured ? visionRoute + "_structured" : visionRoute] = async () => {
          const output = await runOcrProbe(vision, source.bytes);
          if (!structured) return output;
          const evidence = normalizeDeviceTextEvidence(JSON.parse(output));
          assert(evidence?.complete && evidence.pagesRead === 1 && evidence.totalPages === 1, "Incomplete device OCR evidence");
          assert(probePlatform !== "android_emulator" || evidence.source === "google_mlkit");
          assert(probePlatform !== "ios_simulator" || evidence.source === "apple_vision");
          return encodeLocalReceiptOcr(evidence);
        };
      }
      if (!visionOnly) {
        routes.server_receipt_reader = () => readUploadedFileText(file, undefined, { importMode: "receipt", sourceBytes: source.bytes });
        routes.server_local_ppocr = async () => {
          const preview = await getBoundedImportImagePreview(source.bytes);
          return preview ? readLocalReceiptImage(preview) : null;
        };
      }
      for (const [route, extract] of Object.entries(routes)) {
        try {
          const started = performance.now();
          const text = await extract();
          if (!text?.trim()) {
            results.push({ id: source.id, route, outcome: route === "server_local_ppocr" ? "unavailable" : "failed" });
            continue;
          }
          const parsed = parseReceiptPhotoText(text);
          const reviewReasons: NonNullable<Prediction["reviewReasons"]> = [];
          if (readLocalReceiptOcrText(text) !== null) reviewReasons.push("optical_preview_policy");
          else if (parsed.requiresReview) reviewReasons.push("parser_review");
          if (!parsed.merchantName) reviewReasons.push("missing_merchant");
          if (!parsed.billDate) reviewReasons.push("missing_date");
          if (!parsed.total) reviewReasons.push("missing_total");
          if (parsed.currency === "MIXED") reviewReasons.push("currency_conflict");
          results.push({
            id: source.id, route, reviewReasons, elapsedMs: Math.round(performance.now() - started),
            outcome: reviewReasons.length ? "review" : "extracted",
            core: { merchant: parsed.merchantName, date: parsed.billDate?.slice(0, 10) ?? null, total: parsed.total, currency: parsed.currency === "MIXED" ? null : parsed.currency },
            items: parsed.items.map(item => ({ description: item.description, quantity: item.quantity == null ? null : String(item.quantity), unitPrice: item.unitPrice ?? null, lineAmount: item.amount })),
          });
        } catch (error) {
          const rejected = error instanceof Error && error.name === "NonFinancialUploadError";
          results.push({ id: source.id, route, outcome: rejected ? "rejected" : "failed" });
        }
      }
      if (!visionOnly) for (const route of unavailable) results.push({ id: source.id, route, outcome: "unavailable" });
    }
  } finally {
    await shutdownImportOcrWorkers();
  }
  console.log("RECEIPT_ROUTE_ACCURACY " + JSON.stringify(score(labels, results)));
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : "Receipt accuracy evaluation failed");
  process.exitCode = 1;
});
