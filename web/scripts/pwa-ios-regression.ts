import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

const manifest = read("app/manifest.ts");
const layout = read("app/layout.tsx");
const serviceWorker = read("public/sw.js");
const registration = read("components/pwa-service-worker.tsx");
const installPage = read("components/install-clover.tsx");

assert.match(manifest, /start_url:\s*["']\/continue\?source=pwa["']/, "PWA must resume through Clover's authenticated continue route");
assert.match(manifest, /display:\s*["']standalone["']/, "PWA must open without browser chrome");
assert.match(manifest, /icon-192-gradient\.png/);
assert.match(manifest, /icon-512-gradient\.png/);
assert.match(manifest, /icon-maskable-512-gradient\.png/);

assert.match(layout, /appleWebApp:\s*{/);
assert.match(layout, /viewportFit:\s*["']cover["']/);
assert.match(layout, /apple-touch-icon-gradient\.png/);
assert.match(layout, /<PwaServiceWorker\s*\/>/);

assert.match(registration, /navigator\.serviceWorker\.register\(["']\/sw\.js["']/);
assert.match(serviceWorker, /request\.mode\s*===\s*["']navigate["']/);
assert.match(serviceWorker, /request\.destination\s*===\s*["']document["']/);
assert.doesNotMatch(serviceWorker, /pathname\.startsWith\(["']\/_next\/static\//, "Service worker must never cache deployment-specific Next.js chunks");
assert.match(serviceWorker, /clover-static-/);
assert.match(serviceWorker, /key !== CACHE_NAME/, "Service worker activation must purge obsolete caches");
assert.doesNotMatch(serviceWorker, /pathname\.startsWith\(["']\/api\//, "Service worker must not opt API responses into caching");
assert.doesNotMatch(serviceWorker, /caches\.open\([^)]*financial|account|transaction/i, "Service worker must not create financial-data caches");

assert.match(installPage, /Add to Home Screen/);
assert.match(installPage, /Open as Web App/);
assert.match(installPage, /display-mode:\s*standalone/);
assert.match(installPage, /same synced account you use on desktop/);

for (const asset of [
  "public/pwa/apple-touch-icon-gradient.png",
  "public/pwa/icon-192-gradient.png",
  "public/pwa/icon-512-gradient.png",
  "public/pwa/icon-maskable-512-gradient.png",
]) {
  assert.ok(existsSync(path.join(root, asset)), `Missing PWA asset: ${asset}`);
}

console.log("iOS PWA regression checks passed.");
