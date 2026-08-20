import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const layout = fs.readFileSync(path.join(root, "app/layout.tsx"), "utf8");
const nextConfig = fs.readFileSync(path.join(root, "next.config.mjs"), "utf8");
const bootstrap = fs.readFileSync(path.join(root, "lib/chunk-error-bootstrap.ts"), "utf8");
const clientRecovery = fs.readFileSync(path.join(root, "lib/chunk-error-recovery.ts"), "utf8");

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

assert(layout.includes('id="clover-chunk-recovery"'), "Root layout must install chunk recovery.");
assert(layout.includes("dangerouslySetInnerHTML"), "Chunk recovery must be emitted as an inline bootstrap.");
assert(nextConfig.includes("VERCEL_DEPLOYMENT_ID"), "Vercel assets must be pinned to their deployment.");
assert(!bootstrap.includes('"use client"'), "Bootstrap generator must remain server-safe.");
assert(bootstrap.includes('window.addEventListener("error"'), "Script errors must be observed.");
assert(bootstrap.includes('window.addEventListener("unhandledrejection"'), "Chunk promise failures must be observed.");
assert(bootstrap.includes("chunkUrlPattern") && bootstrap.includes("sourceUrl"), "Failed chunk script URLs must trigger recovery.");
assert(bootstrap.includes("window.location.replace"), "Recovery must request a fresh document.");
assert(clientRecovery.includes("CHUNK_RECOVERY_QUERY_KEY"), "Client fallback must share the recovery query key.");

console.log("Chunk error recovery regression checks passed.");
