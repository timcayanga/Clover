import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export const pdfjsStandardFontDataUrl = "/pdfjs/standard_fonts/";

export { pdfjs };
