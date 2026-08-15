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
assert.match(manifest, /icon-192\.png/);
assert.match(manifest, /icon-512\.png/);
assert.match(manifest, /icon-maskable-512\.png/);

assert.match(layout, /appleWebApp:\s*{/);
assert.match(layout, /viewportFit:\s*["']cover["']/);
assert.match(layout, /apple-touch-icon\.png/);
assert.match(layout, /<PwaServiceWorker\s*\/>/);

assert.match(registration, /navigator\.serviceWorker\.register\(["']\/sw\.js["']/);
assert.match(serviceWorker, /request\.mode\s*===\s*["']navigate["']/);
assert.match(serviceWorker, /request\.destination\s*===\s*["']document["']/);
assert.match(serviceWorker, /\/_next\/static\//);
assert.doesNotMatch(serviceWorker, /pathname\.startsWith\(["']\/api\//, "Service worker must not opt API responses into caching");
assert.doesNotMatch(serviceWorker, /caches\.open\([^)]*financial|account|transaction/i, "Service worker must not create financial-data caches");

assert.match(installPage, /Add to Home Screen/);
assert.match(installPage, /Open as Web App/);
assert.match(installPage, /display-mode:\s*standalone/);
assert.match(installPage, /same synced account you use on desktop/);

for (const asset of [
  "public/pwa/apple-touch-icon.png",
  "public/pwa/icon-192.png",
  "public/pwa/icon-512.png",
  "public/pwa/icon-maskable-512.png",
]) {
  assert.ok(existsSync(path.join(root, asset)), `Missing PWA asset: ${asset}`);
}

console.log("iOS PWA regression checks passed.");
