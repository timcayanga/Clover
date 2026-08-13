import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const chrome = read("components/admin-page-chrome.tsx");
const page = read("app/admin/analysis/page.tsx");
const analysis = read("lib/admin-analysis.ts");
const workspace = read("components/admin-analysis-workspace.tsx");

assert.match(chrome, /href: "\/admin\/analysis", label: "Analysis"/);
assert.match(page, /requireAdminAuth/);
assert.match(page, /getCachedAdminCommandCenterSnapshot/);
assert.match(page, /active="analysis"/);
assert.match(analysis, /buildAdminRecommendations/);
assert.match(analysis, /No high-confidence product or reliability gap/);
assert.match(analysis, /viewers >= 3/);
assert.match(analysis, /Current deploy errors/);
assert.match(analysis, /Failed imports, 7d/);
assert.match(workspace, /What Clover should improve next/);
assert.match(workspace, /decision-support suggestions/);

console.log("Admin analysis regression passed.");
