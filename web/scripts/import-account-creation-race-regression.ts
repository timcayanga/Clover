import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));

const main = async () => {
  const source = await readFile(join(scriptDir, "..", "workers", "import-processor.ts"), "utf8");

  assert.match(source, /const accountCreationLockKey = \[/);
  assert.match(source, /pg_advisory_xact_lock\(hashtextextended\(\$\{accountCreationLockKey\}, 0\)\)/);
  assert.match(
    source,
    /const concurrentCandidates = await tx\.account\.findMany\([\s\S]{0,1200}const existingConcurrentAccount = concurrentCandidates\.find/,
    "Account creation must re-check matching uploaded accounts after acquiring its identity lock."
  );
  assert.match(
    source,
    /if \(existingConcurrentAccount\) \{\s*return existingConcurrentAccount;/,
    "A concurrent matching account must be reused instead of creating a duplicate."
  );

  console.log("[PASS] Import account creation serializes same-identity accounts.");
};

void main();
