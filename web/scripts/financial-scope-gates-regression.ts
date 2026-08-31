import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ADVISER_OUT_OF_SCOPE_REPLY, classifyAdviserScope } from "../lib/adviser-scope";
import { assessFinancialUploadScope, NON_FINANCIAL_UPLOAD_MESSAGE } from "../lib/financial-upload-scope";

const allowedAdviserQuestions = [
  "Can I safely spend ₱20,000 from my accounts?",
  "Why are Transfers up this month?",
  "Show my August spending report",
  "How much interest am I paying on my loan?",
  "Add a transaction for ₱500",
];
for (const question of allowedAdviserQuestions) {
  assert.equal(classifyAdviserScope(question, [{ role: "user", content: question }]).allowed, true, question);
}

const rejectedAdviserQuestions = [
  "Write me a Python web scraper",
  "What is the capital of France?",
  "Write a history essay",
  "What should I eat for dinner?",
  "Which movie should I watch?",
  "What is Bitcoin?",
  "Write a report about ancient history",
  "Help me improve my personal statement",
  "What life goal should I pursue?",
];
for (const question of rejectedAdviserQuestions) {
  assert.equal(classifyAdviserScope(question, [{ role: "user", content: question }]).allowed, false, question);
}

assert.equal(
  classifyAdviserScope("What about next month?", [
    { role: "user", content: "How much can I safely spend this month?" },
    { role: "assistant", content: "Your safe-to-spend amount is ₱5,000." },
    { role: "user", content: "What about next month?" },
  ]).allowed,
  true,
  "financial follow-up should preserve scope"
);
assert.match(ADVISER_OUT_OF_SCOPE_REPLY, /Clover accounts/);

const financialUploads = [
  { text: "Statement Date 08/31/2026 Account Balance PHP 10,500.00", fileName: "upload.pdf" },
  { text: "RMB 63.00 2026/08/21 好食特 餐饮管理有限公司", fileName: "IMG_1234.jpg" },
  { text: "ใบเสร็จ 2025/10/14 ฿1,240.00", fileName: "IMG_5678.jpg" },
  { text: "Date,Description,Debit,Credit,Balance\n2026-08-01,Coffee,120.00,,5000.00", fileName: "export.csv" },
];
for (const upload of financialUploads) {
  assert.equal(assessFinancialUploadScope(upload).decision, "financial", JSON.stringify(upload));
}

assert.equal(
  assessFinancialUploadScope({ text: "", fileName: "IMG_9999.jpg", fileType: "image/jpeg" }).decision,
  "ambiguous",
  "sparse camera OCR must fail open for foreign-language and low-light receipts"
);
assert.equal(
  assessFinancialUploadScope({
    text: "Curriculum Vitae. Experienced product designer focused on user research, design systems, collaboration, prototyping, and accessibility across consumer software products.",
    fileName: "resume.pdf",
  }).decision,
  "non_financial"
);
assert.equal(
  assessFinancialUploadScope({
    text: "Statement of purpose. I am applying to the graduate program because architecture connects cities, culture, public space, and human behavior. My academic work developed through research, studio collaboration, community projects, and a long-standing interest in sustainable design.",
    fileName: "statement-of-purpose.pdf",
  }).decision,
  "non_financial"
);
assert.match(NON_FINANCIAL_UPLOAD_MESSAGE, /financial records/);
assert.equal(
  assessFinancialUploadScope({
    text: "This article discusses the history of architecture and how public buildings evolved across several centuries. It contains narrative prose, references to artists, and observations about materials, cities, and culture, without presenting a ledger or any commercial record.",
    fileName: "article.pdf",
  }).decision,
  "non_financial"
);

const adviserRouteSource = fs.readFileSync(path.join(process.cwd(), "app/api/adviser/chat/route.ts"), "utf8");
const adviserGuardIndex = adviserRouteSource.indexOf("classifyAdviserScope(latestIncomingQuestion");
const adviserWorkspaceIndex = adviserRouteSource.indexOf("const workspace =");
const adviserModelIndex = adviserRouteSource.indexOf('fetch("https://api.openai.com/v1/responses"');
assert.ok(adviserGuardIndex >= 0, "Adviser route must call the deterministic scope gate.");
assert.ok(adviserGuardIndex < adviserWorkspaceIndex, "Adviser scope gate must run before workspace financial queries.");
assert.ok(adviserGuardIndex < adviserModelIndex, "Adviser scope gate must run before any OpenAI request.");
assert.match(adviserRouteSource, /OPENAI_ADVISER_MODEL\?\.trim\(\) \|\| "gpt-4\.1-mini"/);
assert.match(adviserRouteSource, /prompt_cache_key: "clover-adviser-v1"/);

const importParserSource = fs.readFileSync(path.join(process.cwd(), "lib/openai-import-parser.ts"), "utf8");
const importParserStart = importParserSource.indexOf("export const parseImportTextWithOpenAIFallback");
const importGuardIndex = importParserSource.indexOf("assessFinancialUploadScope({", importParserStart);
const importApiKeyIndex = importParserSource.indexOf("const apiKey =", importParserStart);
assert.ok(importGuardIndex >= 0 && importGuardIndex < importApiKeyIndex, "Upload scope gate must run before OpenAI setup.");

const importWorkerSource = fs.readFileSync(path.join(process.cwd(), "workers/import-processor.ts"), "utf8");
const workerGuardIndex = importWorkerSource.indexOf("const uploadScopeDecision = assessFinancialUploadScope({");
const workerBackupIndex = importWorkerSource.indexOf("const earlyOpenAiFallbackPromise =", workerGuardIndex);
assert.ok(workerGuardIndex >= 0 && workerGuardIndex < workerBackupIndex, "Worker must reject non-financial files before backup parsing.");

console.log("Financial upload and Adviser scope gate regression passed.");
