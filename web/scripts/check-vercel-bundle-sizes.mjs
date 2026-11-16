import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const traces = (await readdir(".next/server/app", { recursive: true }))
  .filter((name) => /(?:^|\/)(?:route|page)\.js\.nft\.json$/.test(name));
if (!traces.length) throw new Error("No Next.js function traces found. Run a production build first.");

const sizeCache = new Map();
function bytes(file) {
  if (!sizeCache.has(file)) sizeCache.set(file, stat(file).then((entry) => entry.size));
  return sizeCache.get(file);
}

const results = [];
for (const trace of traces) {
  const manifest = resolve(".next/server/app", trace);
  const { files } = JSON.parse(await readFile(manifest, "utf8"));
  const paths = new Set([
    manifest.replace(/\.nft\.json$/, ""),
    ...files.map((file) => resolve(dirname(manifest), file)),
  ]);
  const total = (await Promise.all([...paths].map(bytes))).reduce((sum, size) => sum + size, 0);
  results.push({ trace, total });
}

const mb = (bytes) => (bytes / 1024 ** 2).toFixed(2);
results.sort((a, b) => b.total - a.total);
// Vercel adds runtime files to the traced inputs. Leave space for that packaging.
const limit = 240 * 1024 ** 2;
console.log(`Largest Next.js function traces (${results.length} inspected, ${mb(limit)} MiB budget)`);
for (const { trace, total } of results.slice(0, 10)) console.log(`${mb(total)} MiB  ${trace}`);
if (results.some(({ total }) => total > limit)) {
  console.error("A function trace exceeds the Vercel bundle budget.");
  process.exitCode = 1;
}
