import assert from "node:assert/strict";
import { resolve } from "node:path";
import ts from "typescript";

// Shared source is consumed by two independently installed applications. It must
// not resolve packages through an unrelated repository/parent node_modules.
const sharedRoot = resolve(process.cwd(), "../shared");
const files = ts.sys.readDirectory(sharedRoot, [".ts", ".tsx"], undefined, ["**/*"]);
assert.ok(files.length > 0, "Shared source must be checked, not silently skipped.");
const options: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: true,
  types: [],
  skipLibCheck: true,
};
const host = ts.createCompilerHost(options);
host.resolveModuleNames = (names, containingFile) => names.map((name) =>
  name.startsWith(".")
    ? ts.resolveModuleName(name, containingFile, options, host).resolvedModule
    : undefined
);
const program = ts.createProgram(files, options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  }));
  process.exitCode = 1;
} else {
  console.log(`Shared boundary regression passed: ${files.length} files type-check without application or parent dependencies.`);
}
