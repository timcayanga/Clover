import type { ImagePreview } from "./import-image-validation.server";
import { Worker } from "node:worker_threads";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { encodeLocalReceiptOcr } from "./local-receipt-ocr-envelope";

export type LocalReceiptOcrTimings = {
  runtimeInitMs?: number;
  modelInitMs?: number;
  localOcrMs?: number;
};

let worker: Worker | null = null;
let busy = false;
let inFlight: Promise<void> | null = null;
let retiring: Promise<void> | null = null;
let cooldownUntil = 0;
export async function shutdownLocalReceiptOcr() {
  if (retiring) return retiring;
  const current = worker;
  if (!current) return;
  worker = null;
  const finished = inFlight;
  retiring = (async () => {
    // ONNX can still be inside a native callback when the caller times out.
    // Terminate only after the worker acknowledges completion or exits.
    try {
      if (finished) await finished;
      await current.terminate();
    } finally {
      retiring = null;
    }
  })();
  return retiring;
}
/** Bounded, CPU-only recognition. Failure retains the existing OCR/backup path. */
export async function readLocalReceiptImage(
  preview: ImagePreview,
  timings?: LocalReceiptOcrTimings,
): Promise<string | null> {
  if (busy || retiring || Date.now() < cooldownUntil) return null;
  const paths = [
    join(process.cwd(), "lib/receipt-ocr-worker.cjs"),
    join(process.cwd(), "web/lib/receipt-ocr-worker.cjs"),
  ];
  const workerPath = paths.find(existsSync);
  if (!workerPath) return null;
  busy = true;
  const startedAt = Date.now();
  try {
    if (!worker) {
      const created = new Worker(workerPath, {
        resourceLimits: { maxOldGenerationSizeMb: 192 },
      });
      created.on("error", () => {
        if (worker === created) worker = null;
      });
      created.on("exit", () => {
        if (worker === created) worker = null;
      });
      worker = created;
    }
    const current = worker;
    let acknowledge!: () => void;
    inFlight = new Promise<void>(resolve => { acknowledge = resolve; });
    return await new Promise<string | null>((resolve) => {
      let returned = false;
      const finish = (text: string | null, failed: boolean) => {
        if (returned) return;
        returned = true;
        clearTimeout(timer);
        console.info("[receipt-local-ocr]", {
          engine: "ppocr-v5-local", outcome: text ? "review_preview" : "fallback", elapsedMs: Date.now() - startedAt,
        });
        if (failed) {
          cooldownUntil = Date.now() + 60000;
          void shutdownLocalReceiptOcr();
        } else current.unref();
        resolve(text);
      };
      const done = () => {
        current.removeListener("message", onMessage);
        current.removeListener("error", onError);
        current.removeListener("exit", onError);
        acknowledge();
        inFlight = null;
      };
      const onMessage = (message: {
        ok?: boolean;
        timings?: LocalReceiptOcrTimings;
        result?: { text: string; [key: string]: unknown };
      }) => {
        done();
        if (returned) return;
        if (timings && message.timings) Object.assign(timings, message.timings);
        finish(message.ok && message.result?.text.trim() ? encodeLocalReceiptOcr(message.result) : null, !message.ok);
      };
      const onError = () => {
        done();
        finish(null, true);
      };
      const timer = setTimeout(() => finish(null, true), 25000);
      current.once("message", onMessage);
      current.once("error", onError);
      current.once("exit", onError);
      current.ref();
      try {
        current.postMessage({ preview, measure: Boolean(timings) });
      } catch {
        onError();
      }
    });
  } catch {
    cooldownUntil = Date.now() + 60000;
    await shutdownLocalReceiptOcr();
    return null;
  } finally {
    busy = false;
  }
}
