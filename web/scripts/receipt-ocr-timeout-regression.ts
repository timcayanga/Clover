import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
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
      let calls = 0;
      require("node:worker_threads").parentPort.on("message", () => {
        calls++;
        setTimeout(() => {
          require("node:fs").writeFileSync(${JSON.stringify(marker)}, "done");
          require("node:worker_threads").parentPort.postMessage({ ok: true, result: { text: "scan " + calls } });
        }, calls === 2 ? 0 : 150);
      });`,
    );
    process.chdir(root);
    global.setTimeout = ((fn, ms, ...args) => realTimer(fn, ms === 25000 ? 10 : ms, ...args)) as typeof setTimeout;
    const image = { data: Buffer.alloc(3), width: 1, height: 1 };
    assert.equal(await readLocalReceiptImage(image), null);
    await assert.rejects(readFile(marker), { code: "ENOENT" });
    assert.equal(await readLocalReceiptImage(image), null);
    global.setTimeout = realTimer;
    let next: string | null = null;
    for (let i = 0; i < 100 && !next; i++) {
      await delay(25);
      next = await readLocalReceiptImage(image);
    }
    assert.ok(next?.endsWith("scan 2"), "A late reply must not replace the next scan");
    await rm(marker);
    global.setTimeout = ((fn, ms, ...args) => realTimer(fn, ms === 25000 ? 10 : ms, ...args)) as typeof setTimeout;
    assert.equal(await readLocalReceiptImage(image), null);
    await Promise.all([shutdownLocalReceiptOcr(), shutdownLocalReceiptOcr()]);
    assert.equal(await readFile(marker, "utf8"), "done");
    console.log("PASS timeout returned fallback before recognition finished, reused the healthy worker after its late reply, then waited for shutdown");
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
