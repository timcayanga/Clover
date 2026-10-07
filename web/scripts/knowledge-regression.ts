import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  knowledgeSeeds,
  knowledgeCategories,
  legacyKnowledgePaths,
} from "../lib/knowledge-seed";
import {
  contentSchema,
  contentPathSchema,
  searchKnowledge,
  aiSettingsSchema,
} from "../lib/knowledge-types";
import { helpSections, publicHelpSections } from "../lib/help-center";
import { philippineBankGuideSeeds } from "../lib/knowledge-ph-bank-guides";

assert.equal(philippineBankGuideSeeds.length, 8);
for (const guide of philippineBankGuideSeeds) {
  assert.equal(guide.content.market, "ph");
  assert.equal(guide.content.kind, "guide");
  assert(guide.content.sources.length > 0, `${guide.path}: official source required`);
  assert(guide.content.reviewedAt, `${guide.path}: review date required`);
  assert(knowledgeSeeds.some(entry => entry.path === guide.path));
}
for (const bank of ["BDO", "UnionBank", "RCBC", "Security Bank", "Chinabank", "LANDBANK", "CIMB", "GoTyme"]) {
  assert(searchKnowledge(philippineBankGuideSeeds, bank).length > 0, `${bank}: guide must be searchable`);
}

for (const slug of ["import-from-actual-budget", "import-from-spendee", "import-from-toshl", "import-from-ynab", "import-from-monarch", "import-from-realbyte", "import-from-money-lover", "import-from-wallet", "import-from-bluecoins", "use-clover-migration-template"]) {
  const entry = knowledgeSeeds.find(item => item.path === `/help/modern-imports/${slug}`)!;
  assert(entry, slug);
  assert.equal(entry.content.downloads?.[0]?.path, "/templates/clover-migration.csv", `${slug}: template must reach the current renderer`);
  assert(existsSync(`public${entry.content.downloads![0].path}`));
  if (slug !== "use-clover-migration-template") assert(entry.content.sources.length > 0, `${slug}: official instructions must be visible`);
}
assert(!contentSchema.safeParse({ ...knowledgeSeeds[0].content, downloads: [{ label: "Unsafe download", path: "//example.com/payload.csv" }] }).success);
assert(!contentSchema.safeParse({ ...knowledgeSeeds[0].content, downloads: [{ label: "Private data", path: "/api/account/export" }] }).success);

assert.equal(
  new Set(knowledgeSeeds.map((entry) => entry.path)).size,
  knowledgeSeeds.length,
);
for (const entry of knowledgeSeeds) {
  contentSchema.parse(entry.content);
  contentPathSchema.parse(entry.path);
  assert(
    knowledgeCategories.some(
      (category) => category.slug === entry.content.category,
    ),
  );
  if (entry.content.screenshot)
    assert(
      existsSync(`public${entry.content.screenshot}`),
      entry.content.screenshot,
    );
}
for (const category of knowledgeCategories) {
  assert(existsSync(`public/assets/3d icons/${category.icon}.png`));
  assert(
    knowledgeSeeds.some((entry) => entry.content.category === category.slug),
  );
}
for (const section of [...helpSections, ...publicHelpSections])
  for (const article of section.articles) {
    const canonical = legacyKnowledgePaths.get(
      `/help/${section.slug}/${article.slug}`,
    );
    assert(
      knowledgeSeeds.some((entry) => entry.path === canonical),
      `Preserve ${section.slug}/${article.slug}`,
    );
  }
assert(
  searchKnowledge(knowledgeSeeds, "GCash").some(
    (entry) => entry.path === "/guides/export-gcash-transaction-history",
  ),
);
assert.equal(searchKnowledge(knowledgeSeeds, "zzzznoresults").length, 0);
assert(!contentPathSchema.safeParse("/admin/secret").success);
assert(
  !contentSchema.safeParse({
    ...knowledgeSeeds[0].content,
    screenshot: "/api/account/export",
    screenshotAlt: "Private data",
  }).success,
);
assert(
  !aiSettingsSchema.safeParse({
    enabled: true,
    intervalDays: 0,
    monthlyDraftLimit: 999,
    backlogLimit: 100,
    topics: [],
  }).success,
);
const ai = readFileSync("lib/knowledge-ai.ts", "utf8");
assert.match(ai, /max_output_tokens:\s*4000/);
assert.match(ai, /max_tool_calls:\s*2/);
assert.match(ai, /needsReview:\s*true/);
assert.doesNotMatch(ai, /published:/);
const crons = JSON.parse(readFileSync("vercel.json", "utf8")).crons;
assert(
  crons.some((c: { path: string }) => c.path === "/api/cron/content-drafts"),
);
console.log(
  `Knowledge regression passed: ${knowledgeSeeds.length} articles/guides, ${knowledgeCategories.length} topics, legacy paths, search, assets, and safety bounds.`,
);
