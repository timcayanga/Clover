import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const routeSource = fs.readFileSync(path.join(root, "app/api/goals/route.ts"), "utf8");
const pageSource = fs.readFileSync(path.join(root, "app/goals/page.tsx"), "utf8");
const modalSource = fs.readFileSync(path.join(root, "components/goals-editor-modal.tsx"), "utf8");

assert.match(
  routeSource,
  /goalTargetSource:\s*targetAmount === undefined \? undefined : targetAmount === null \? null : "goals"/,
  "Clearing a goal target must also clear its source."
);
assert.match(routeSource, /prisma\.\$transaction/, "Goal state and history must be saved atomically.");
assert.doesNotMatch(
  pageSource,
  /currentGoalPlan\s*=[^;]*\?\?\s*latestGoalPlan/,
  "Historical plans must not become the active plan after a user clears their goal."
);
assert.match(
  modalSource,
  /fetch\("\/api\/settings\/financial-focus"/,
  "Goal writes must use a neutral settings endpoint that privacy extensions do not confuse with analytics tracking."
);
assert.ok(
  (modalSource.match(/onClick=\{\(\) => saveGoal\(null\)\}/g) ?? []).length >= 2,
  "Goal deletion must be available in both desktop and mobile editors."
);
assert.match(modalSource, /role="status"/, "Goal save failures must be visible to the user.");

console.log("Goal persistence regression passed.");
