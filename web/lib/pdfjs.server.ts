import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const pdfjsPackageJsonPath = require.resolve("pdfjs-dist/package.json");

pdfjs.GlobalWorkerOptions.workerSrc =
  pathToFileURL(join(dirname(pdfjsPackageJsonPath), "legacy", "build", "pdf.worker.min.mjs")).toString();

export const pdfjsStandardFontDataUrl = "/pdfjs/standard_fonts/";

export { pdfjs };
