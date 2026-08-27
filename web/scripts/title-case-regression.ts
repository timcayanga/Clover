import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceExtensions = new Set([".css", ".ts", ".tsx"]);

const collectSourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      if (["node_modules", ".next", "test-results"].includes(entry.name)) return [];
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(fullPath);
      return sourceExtensions.has(path.extname(entry.name)) ? [fullPath] : [];
    })
  );
  return files.flat();
};

const main = async () => {
  const sourceFiles = await collectSourceFiles(root);
  const uppercaseTransforms: string[] = [];

  for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    if (/text-transform:\s*uppercase|textTransform\s*:\s*["']uppercase["']/.test(source)) {
      uppercaseTransforms.push(path.relative(root, file));
    }
  }

  assert.deepEqual(
    uppercaseTransforms,
    [],
    `Forced uppercase typography remains in: ${uppercaseTransforms.join(", ")}`
  );

  const [globalStyles, adminStyles, reportsSource] = await Promise.all([
    readFile(path.join(root, "app/globals.css"), "utf8"),
    readFile(path.join(root, "public/admin.css"), "utf8"),
    readFile(path.join(root, "app/reports/reports-page-content.tsx"), "utf8"),
  ]);

  assert.match(globalStyles, /\.eyebrow\s*\{[\s\S]*?text-transform:\s*capitalize;/);
  assert.match(adminStyles, /\.eyebrow\s*\{[\s\S]*?text-transform:\s*capitalize;/);
  for (const title of ["Cash Flow Map", "Main Drivers", "Next Steps", "Goal Check", "Spending Mix"]) {
    assert.ok(reportsSource.includes(title), `Expected Adviser title to use Title Case: ${title}`);
  }

  console.log(`Title Case regression passed across ${sourceFiles.length} source files.`);
};

void main();
