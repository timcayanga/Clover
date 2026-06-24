import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
// @ts-expect-error pdfjs-dist does not publish types for the worker entrypoint.
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const pdfjsPackageJsonPath = require.resolve("pdfjs-dist/package.json");

// In Node, pdf.js bootstraps a fake worker by importing `GlobalWorkerOptions.workerSrc`.
// Pre-registering the worker module avoids workspace-specific resolution failures in dev.
(globalThis as typeof globalThis & { pdfjsWorker?: typeof pdfjsWorker }).pdfjsWorker ??= pdfjsWorker;

pdfjs.GlobalWorkerOptions.workerSrc =
  pathToFileURL(join(dirname(pdfjsPackageJsonPath), "legacy", "build", "pdf.worker.min.mjs")).toString();

export const pdfjsStandardFontDataUrl = "/pdfjs/standard_fonts/";

export { pdfjs };
