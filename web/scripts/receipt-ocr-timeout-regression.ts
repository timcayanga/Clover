import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLocalReceiptImage, shutdownLocalReceiptOcr } from "../lib/local-receipt-ocr.server";

async function verify() {
  const root = await mkdtemp(join(tmpdir(), "clover-ocr-timeout-"));
  const cwd = process.cwd();
  const realTimer = global.setTimeout;
  try {
    await mkdir(join(root, "lib"));
    await symlink(join(cwd, "node_modules"), join(root, "node_modules"), "dir");
    const marker = join(root, "finished");
    await writeFile(
      join(root, "lib", "receipt-ocr-worker.cjs"),
      `
      require("node:worker_threads").parentPort.on("message", () => setTimeout(() => {
        require("node:fs").writeFileSync(${JSON.stringify(marker)}, "done");
        require("node:worker_threads").parentPort.postMessage({ ok: true, result: { text: "late result" } });
      }, 150));`,
    );
    process.chdir(root);
    global.setTimeout = ((fn, ms, ...args) => realTimer(fn, ms === 25000 ? 10 : ms, ...args)) as typeof setTimeout;
    const image = { data: Buffer.alloc(3), width: 1, height: 1 };
    assert.equal(await readLocalReceiptImage(image), null);
    await assert.rejects(readFile(marker), { code: "ENOENT" });
    assert.equal(await readLocalReceiptImage(image), null);
    await Promise.all([shutdownLocalReceiptOcr(), shutdownLocalReceiptOcr()]);
    assert.equal(await readFile(marker, "utf8"), "done");
    console.log("PASS timeout returned fallback before recognition finished, then shutdown waited for the worker");
  } finally {
    global.setTimeout = realTimer;
    process.chdir(cwd);
    await shutdownLocalReceiptOcr();
    await rm(root, { recursive: true, force: true });
  }
}
void verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
