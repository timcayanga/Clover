import { reportImportReaderEvent } from "./import-timing";

const PAGE_CONCURRENCY = 2;

export async function runPdfPageBatch<Page, Result>(
  stage: string,
  pages: readonly Page[],
  read: (page: Page) => Promise<Result | null>,
  isFatal?: (error: unknown) => boolean,
) {
  if (!pages.length) return [];
  const started = performance.now();
  const results: Array<Result | null> = Array(pages.length).fill(null);
  const durations: number[] = [];
  let nextPage = 0;
  let failures = 0;
  let fatal: { error: unknown } | undefined;

  await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, pages.length) }, async () => {
    while (!fatal && nextPage < pages.length) {
      const index = nextPage++;
      const pageStarted = performance.now();
      try {
        results[index] = await read(pages[index]);
        if (results[index] === null) failures++;
      } catch (error) {
        failures++;
        if (isFatal?.(error)) fatal = { error };
      } finally {
        durations.push(performance.now() - pageStarted);
      }
    }
  }));

  durations.sort((left, right) => left - right);
  reportImportReaderEvent("[pdf-page-batch]", {
    stage,
    pages: pages.length,
    attemptedPages: durations.length,
    failedPages: failures,
    outcome: fatal || failures === pages.length ? "failed" : failures ? "partial" : "completed",
    concurrency: Math.min(PAGE_CONCURRENCY, pages.length),
    durationMs: performance.now() - started,
    pageP90Ms: durations[Math.ceil(durations.length * .9) - 1],
    slowestPageMs: durations.at(-1),
    modelTokens: 0, // These batches use local readers only.
  });
  if (fatal) throw fatal.error;
  return results;
}
