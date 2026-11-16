import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const starterSource = fs.readFileSync(path.join(process.cwd(), "lib/starter-data.ts"), "utf8");
const workspaceRouteSource = fs.readFileSync(path.join(process.cwd(), "app/api/workspaces/route.ts"), "utf8");

assert.match(starterSource, /pg_advisory_xact_lock/, "Starter creation must use a database transaction lock.");
assert.match(starterSource, /starter-workspace:\$\{userId\}/, "The starter lock must be scoped to one user.");
assert.match(starterSource, /workspace-defaults:\$\{workspaceId\}/, "Cash and category seeding must share a workspace lock.");

const starterFindIndex = starterSource.indexOf("const existingPersonal = await tx.workspace.findFirst");
const starterCreateIndex = starterSource.indexOf("const workspace = await tx.workspace.create", starterFindIndex);
const lockIndex = starterSource.indexOf("await lockTransaction(tx, starterWorkspaceLockKey(user.id))");
assert.ok(lockIndex >= 0 && lockIndex < starterFindIndex, "The user lock must be acquired before checking for a starter profile.");
assert.ok(starterFindIndex >= 0 && starterFindIndex < starterCreateIndex, "Creation must recheck for an existing profile inside the lock.");

assert.match(starterSource, /STARTER_PROFILE_RACE_WINDOW_MS = 10_000/);
assert.match(starterSource, /STARTER_PROFILE_REPAIR_MIN_AGE_MS = 60_000/);
assert.match(starterSource, /meaningful\.length > 1\) return 0/, "Repair must preserve duplicates when more than one carries data.");
assert.match(starterSource, /isPristineStarterWorkspace\(workspace\)/, "Repair must delete only untouched starter profiles.");
assert.match(starterSource, /Object\.values\(workspace\._count\)\.every/, "Repair must verify that no dependent records exist.");
assert.match(starterSource, /nameCustomized/);
assert.match(starterSource, /logoCustomized/);
assert.match(starterSource, /Number\(cash\.balance \?\? 0\) === 0/);

assert.match(workspaceRouteSource, /repairDuplicateStarterWorkspaces\(user\.id\)/, "Profile loading must repair safe historical race duplicates.");
assert.match(workspaceRouteSource, /const refreshedUser =/, "Profile loading must refresh after repair.");

console.log("Starter workspace idempotency regression passed.");
