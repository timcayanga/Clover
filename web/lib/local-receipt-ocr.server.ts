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
let cooldownUntil = 0;
export async function shutdownLocalReceiptOcr() {
  const current = worker;
  worker = null;
  if (current) await current.terminate();
}
/** Bounded, CPU-only recognition. Failure retains the existing OCR/backup path. */
export async function readLocalReceiptImage(
  preview: ImagePreview,
  timings?: LocalReceiptOcrTimings,
): Promise<string | null> {
  if (busy || Date.now() < cooldownUntil) return null;
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
    return await new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (text: string | null, runtimeFailed = true) => {
        if (settled) return;
        settled = true;
        console.info("[receipt-local-ocr]", {
          engine: "ppocr-v5-local",
          outcome: text ? "review_preview" : "fallback",
          elapsedMs: Date.now() - startedAt,
        });
        clearTimeout(timer);
        current.removeListener("message", onMessage);
        current.removeListener("error", onError);
        current.removeListener("exit", onExit);
        if (runtimeFailed) {
          // Do not loop on unavailable models or a broken native runtime.
          cooldownUntil = Date.now() + 60000;
          void shutdownLocalReceiptOcr();
        } else current.unref();
        resolve(text);
      };
      const onMessage = (message: {
        ok?: boolean;
        timings?: LocalReceiptOcrTimings;
        result?: { text: string; [key: string]: unknown };
      }) => {
        if (timings && message.timings) Object.assign(timings, message.timings);
        finish(
          message.ok && message.result?.text.trim()
            ? encodeLocalReceiptOcr(message.result)
            : null,
          !message.ok,
        );
      };
      const onError = () => finish(null);
      const onExit = () => finish(null);
      const timer = setTimeout(() => finish(null), 25000);
      current.once("message", onMessage);
      current.once("error", onError);
      current.once("exit", onExit);
      current.ref();
      current.postMessage({ preview, measure: Boolean(timings) });
    });
  } catch {
    cooldownUntil = Date.now() + 60000;
    await shutdownLocalReceiptOcr();
    return null;
  } finally {
    busy = false;
  }
}
