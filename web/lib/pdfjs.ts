import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

// Keep the browser worker aligned with the bundled PDF.js version so deploys do
// not accidentally reuse a stale cached worker from a previous release.
pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjs.version}`;

export const pdfjsStandardFontDataUrl = "/pdfjs/standard_fonts/";

export { pdfjs };
