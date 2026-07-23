import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");

const main = async () => {
  const source = await readFile(join(webRoot, "components/clover-shell.tsx"), "utf8");

  assert.match(source, /import \{ publishImportedSummary \} from "@\/lib\/imported-summary-events"/);
  assert.match(
    source,
    /onImported=\{async \(summary\) => \{[\s\S]{0,500}publishImportedSummary\(searchWorkspaceId, summary\)[\s\S]{0,200}router\.refresh\(\)/,
    "Shell uploads must notify open client pages before refreshing the route."
  );

  console.log("[PASS] Shell uploads publish confirmed summaries to the active page.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
