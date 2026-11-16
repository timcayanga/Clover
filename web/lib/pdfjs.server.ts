import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
// @ts-expect-error pdfjs-dist does not publish types for the worker entrypoint.
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";

// In Node, pdf.js bootstraps a fake worker by importing `GlobalWorkerOptions.workerSrc`.
// Pre-registering the worker module avoids workspace-specific resolution failures in dev.
(globalThis as typeof globalThis & { pdfjsWorker?: typeof pdfjsWorker }).pdfjsWorker ??= pdfjsWorker;

export const pdfjsStandardFontDataUrl = "/pdfjs/standard_fonts/";

export { pdfjs };
