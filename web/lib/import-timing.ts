// Timing-only telemetry: never include filenames, extracted text, or financial values.
// Durations use one process's monotonic clock. Wall times are correlation anchors,
// not a license to subtract clocks from different hosts or the browser.
export function startImportTiming(importFileId: string, stage: string) {
  const spanId = crypto.randomUUID();
  const startedAt = Date.now();
  const started = performance.now();
  let finished = false;
  const emit = (event: string, extra: Record<string, unknown> = {}) => {
    console.info("[import-timing]", JSON.stringify({
      version: 1, importFileId, spanId, stage, event, startedAt, ...extra,
    }));
  };
  emit("started");
  return (outcome: "completed" | "failed" | "skipped" = "completed") => {
    if (finished) return;
    finished = true;
    emit("finished", { outcome, endedAt: Date.now(), durationMs: performance.now() - started });
  };
}

export async function measureImportTiming<T>(importFileId: string, stage: string, run: () => Promise<T>): Promise<T> {
  const finish = startImportTiming(importFileId, stage);
  try {
    const value = await run();
    finish();
    return value;
  } catch (error) {
    finish("failed");
    throw error;
  }
}
