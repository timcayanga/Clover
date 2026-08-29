import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => readFile(path.join(root, file), "utf8");

async function main() {
  const [shell, reports, adviser, adviserChat, styles, transactions, transactionDetail, categoryPicker, more, schema, circlesSpec] = await Promise.all([
    read("components/clover-shell.tsx"),
    read("app/reports/reports-page-content.tsx"),
    read("app/adviser/page.tsx"),
    read("components/adviser-chat.tsx"),
    read("app/globals.css"),
    read("app/transactions/page.tsx"),
    read("app/transactions/[transactionId]/page.tsx"),
    read("components/transaction-category-picker.tsx"),
    read("app/more/page.tsx"),
    read("prisma/schema.prisma"),
    read("../docs/circles-product-spec.md"),
  ]);

  assert.match(shell, /label: "Understand"[\s\S]{0,300}href: "\/reports"[\s\S]{0,220}href: "\/adviser"/);
  assert.match(shell, /shell-bottom-nav__label">More<\/span>/);
  assert.match(reports, /<ReportsPageStream searchParams=\{searchParams\}/);
  assert.match(reports, /<AdviserHeaderLink \/>/);
  assert.doesNotMatch(adviser, /<ReportsStream/);
  assert.match(adviser, /title="Adviser"[\s\S]{0,500}<AdviserChat[\s\S]{0,220}layout="workspace"/);
  assert.match(adviserChat, /src="\/clover-mark\.svg"/, "Adviser must use the Clover mark in its empty state.");
  assert.match(adviserChat, /Make your next money move\./, "Adviser must open with an actionable prompt.");
  assert.match(adviserChat, /layout === "workspace" \? composer : null/, "The empty Adviser workspace must center its composer with the welcome state.");
  assert.match(adviserChat, /messages\.length > 0 \|\| layout === "embedded" \? composer : null/, "The composer must move below an active Adviser conversation.");
  assert.doesNotMatch(adviserChat, /className="button button-primary button-small adviser-chat__send"/, "Adviser must not show the misleading upward-arrow button.");
  assert.match(styles, /adviser-chat__composer-bar textarea::\-webkit-scrollbar[\s\S]{0,60}display: none/, "The Adviser composer must hide its internal scrollbar.");
  assert.match(styles, /adviser-chat--workspace \.adviser-chat__prompt-row \.adviser-chat__prompt[\s\S]{0,260}border: 0/, "Empty-state suggestions must be compact and container-free.");
  assert.doesNotMatch(adviser, /<header className="adviser-summary">/);
  assert.doesNotMatch(adviser, /title="What Clover noticed"/);
  assert.match(transactions, /href="\/transactions\/categories">Manage categories<\/Link>/);
  assert.match(transactions, /href="\/transactions\/tags">Manage tags<\/Link>/);
  assert.match(transactionDetail, /<TransactionTagsEditor[\s\S]{0,180}onChange=\{setTagDraft\}/);
  assert.match(categoryPicker, /href="\/transactions\/categories"[\s\S]{0,100}Manage categories/);
  assert.match(more, /title: "Split Bills"[\s\S]{0,160}without inviting anyone/);
  assert.match(more, /title: "Circles"[\s\S]{0,160}ongoing shared money responsibilities/);
  assert.match(schema, /model SplitBillGroup[\s\S]{0,180}circleId\s+String\?/);
  assert.match(circlesSpec, /never requires Circle membership/);

  console.log("Feature discovery regression passed.");
}

void main();
