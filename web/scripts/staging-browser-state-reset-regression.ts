import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "components/staging-browser-state-reset.tsx"), "utf8");

assert.match(
  source,
  /window\.sessionStorage\.setItem\(sessionResetMarkerKey, "done"\);[\s\S]*?clearBrowserState\(\{ clearAuth: !keepSignedIn \}\);/,
  "A new staging deployment must still record and perform its one-time browser-state cleanup."
);
assert.match(
  source,
  /clearBrowserState\(\{ clearAuth: true \}\);/,
  "Unsigned public staging sessions must retain their browser-state cleanup."
);
assert.doesNotMatch(
  source,
  /window\.location\.(?:reload|replace|assign)\(/,
  "Staging cleanup must not force a second navigation while the browser viewport is still settling."
);

console.log("Staging browser-state cleanup no longer forces a responsive-layout-breaking reload.");
