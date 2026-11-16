import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const [, , ...packages] = process.argv;
const expectedKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const productionKey = "pk_live_" + Buffer.from("clerk.clover.ph$").toString("base64").replace(/=+$/, "");
if (packages.length === 0 || expectedKey !== productionKey) {
  console.error("Provide signed .ipa/.aab packages and the canonical Clover production publishable key.");
  process.exit(1);
}

const mobile = dirname(dirname(fileURLToPath(import.meta.url)));
const hermes = join(mobile, "node_modules/hermes-compiler/hermesc/osx-bin/hermesc");

async function verifyPackage(archive) {
  const entry = archive.endsWith(".ipa") ? "Payload/*.app/main.jsbundle"
    : archive.endsWith(".aab") ? "base/assets/index.android.bundle"
      : null;
  if (!entry) throw new Error("Expected an .ipa or .aab");
  const dir = mkdtempSync(join(tmpdir(), "clover-store-auth-"));
  try {
    const bundle = join(dir, "bundle.hbc");
    const fd = openSync(bundle, "w", 0o600);
    try {
      const extraction = spawnSync("unzip", ["-p", archive, entry], { stdio: ["ignore", fd, "ignore"] });
      if (extraction.status !== 0) throw new Error("Could not extract the packaged JavaScript bundle");
    } finally {
      closeSync(fd);
    }

    const disassembly = spawn(hermes, ["-b", "-dump-bytecode", bundle], { stdio: ["ignore", "pipe", "ignore"] });
    const finished = new Promise(resolve => {
      disassembly.on("error", () => resolve(false));
      disassembly.on("close", code => resolve(code === 0));
    });
    const keys = new Set();
    for await (const line of createInterface({ input: disassembly.stdout })) {
      // Hermes may pack separate strings contiguously. Inspect string-table
      // entries instead of scanning raw bytes or matching a valid key prefix.
      const entry = line.match(/^[si]\d+\[[^\]]+\]: (pk_(?:live|test)_.+)$/);
      if (entry) keys.add(entry[1]);
    }
    if (!await finished) throw new Error("Could not decode the Hermes string table");
    if (keys.size !== 1 || !keys.has(expectedKey)) {
      throw new Error("Package does not contain exactly the expected production Clerk publishable key");
    }
    console.log(`PASS ${archive}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const archive of packages) {
  try {
    await verifyPackage(archive);
  } catch (error) {
    console.error(`FAIL ${archive} — ${error.message}`);
    process.exitCode = 1;
  }
}
