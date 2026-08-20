import {
  ADMIN_ACTIVE_IMPORT_WINDOW_MS,
  getAdminImportActivityCutoff,
  isAdminImportActive,
} from "../lib/admin-import-activity";
import fs from "node:fs";
import path from "node:path";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const now = new Date("2026-08-20T10:00:00.000Z");
assert(ADMIN_ACTIVE_IMPORT_WINDOW_MS === 30 * 60 * 1000, "Active import window must be 30 minutes.");
assert(getAdminImportActivityCutoff(now).toISOString() === "2026-08-20T09:30:00.000Z", "Cutoff must be deterministic.");
assert(isAdminImportActive("processing", new Date("2026-08-20T09:31:00.000Z"), now), "Recent processing imports must remain active.");
assert(!isAdminImportActive("processing", new Date("2026-08-20T09:29:00.000Z"), now), "Old processing imports must be stale.");
assert(!isAdminImportActive("done", new Date("2026-08-20T09:59:00.000Z"), now), "Completed imports are not active.");

const adminPageData = fs.readFileSync(path.join(process.cwd(), "lib/admin-page-data.ts"), "utf8");
assert(adminPageData.includes("Math.floor(Date.now() / (5 * 60 * 1000))"), "Admin Home must rotate its operational cache key.");

console.log("Admin import activity regression checks passed.");
