import { classifyExactImportEvidence, fingerprintImportClassificationBytes } from "../lib/import-classification-cache.server";
import falseRejectionRegressions from "./fixtures/financial-photo-scope/false-rejection-regressions.json";
import { resolveAdviserFactQuestion } from "../lib/adviser-facts";
import { DEFAULT_ADVISER_MODEL } from "../lib/openai-model-policy";
import { getClearLocalPhotoRejection, getUploadRejectionDetails, NonFinancialUploadError } from "../lib/financial-upload-scope";
import { resolveImportModalStatusDecision } from "../lib/import-modal-status";
import { getImportErrorSpec } from "../lib/import-error-spec";
import { nativeUploadRejection } from "../../shared/native-upload";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseImportTextWithOpenAIFallback } from "../lib/openai-import-parser";
import { ADVISER_OUT_OF_SCOPE_REPLY, ADVISER_OUT_OF_SCOPE_SUGGESTIONS, classifyAdviserScope } from "../lib/adviser-scope";
import { assessFinancialUploadScope, NON_FINANCIAL_UPLOAD_MESSAGE, PROMOTIONAL_UPLOAD_MESSAGE, getNonFinancialUploadMessage, isNonFinancialUploadError, PRE_PURCHASE_UPLOAD_MESSAGE } from "../lib/financial-upload-scope";

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
const factualHistory: Array<{role:"user"|"assistant";content:string}> = [
  {role:"user",content:"What were my three biggest spending categories last month?"},
  {role:"assistant",content:"An older answer must not determine a new question's scope."},
];
for (const latest of ["Use September 1–30 and exclude transfers", "Exactly September 1st through 30th excluding transfers", "Show this in USD"]) {
  const history=[...factualHistory,{role:"user" as const,content:latest}];
  assert.equal(classifyAdviserScope(resolveAdviserFactQuestion(latest,history),history).allowed,true,"Recognized financial clarification stays in scope");
}
for (const latest of ["Write a history essay about September 2026", "Who was president in September 2026?", "Translate this story to PHP in 2026"]) {
  const history=[...factualHistory,{role:"user" as const,content:latest}];
  const resolved=resolveAdviserFactQuestion(latest,history);
  assert.equal(resolved,latest,"An unrelated dated question must not inherit financial scope");
  assert.equal(classifyAdviserScope(resolved,history).allowed,false,"Dated unrelated follow-ups remain rejected");
}
assert.match(ADVISER_OUT_OF_SCOPE_REPLY, /help with your finances in Clover/);
assert.equal(ADVISER_OUT_OF_SCOPE_SUGGESTIONS.length, 3);

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
for (const [text, code] of [
  ["Shopping cart\nCoffee 4.99\nProceed to checkout", "I-108-CART"],
  ["Menu\nLatte 4.99\nTea 3.99", "I-108-CATALOG"],
  ["GUAM BAKERY COUPON. Get PHP 100.00 off your next order. Redeem before 09/30/2026. Terms apply.", "I-108-PROMOTION"],
]) {
  const decision = assessFinancialUploadScope({ text, fileType: "image/jpeg" });
  assert.equal(decision.decision, "non_financial");
  assert.equal(decision.reasonCode, code);
  const error = getClearLocalPhotoRejection({ text, fileType: "image/jpeg" });
  assert(error instanceof NonFinancialUploadError);
  assert.equal(error.ruleId, decision.ruleId);
  const details = getUploadRejectionDetails(error);
  assert.equal(details.reasonCode, code);
  assert.equal(details.ruleId, decision.ruleId);
  assert.equal(error.message, `${details.reason} ${details.nextAction} (${code})`);
  const status = resolveImportModalStatusDecision({
    importMode: "receipt", status: "failed", processingPhase: "non_financial", processingMessage: error.message,
  });
  assert.ok(status.kind === "repair_needed");
  assert.equal(status.message, error.message);
  assert.equal(getImportErrorSpec("scope", "receipt.jpg", status.message).message, error.message);
  assert.equal(nativeUploadRejection(status.errorCode), "non_financial_file");
}

assert.match(NON_FINANCIAL_UPLOAD_MESSAGE, /financial record/);
assert.match(PROMOTIONAL_UPLOAD_MESSAGE, /coupon, voucher, or promotion/);
assert.deepEqual(
  assessFinancialUploadScope({
    text: "GUAM BAKERY COUPON. Get PHP 100.00 off your next order. Redeem before 09/30/2026. Terms apply.",
    fileName: "IMG_1009.jpg",
    fileType: "image/jpeg",
  }),
  {
    decision: "non_financial",
    confidence: 96,
    reasons: ["promotion title and redemption terms"],
    kind: "promotion",
    reasonCode: "I-108-PROMOTION",
    ruleId: "promotion_heading_and_redemption_terms",
  }
);
assert.equal(
  assessFinancialUploadScope({
    text: "GUAM BAKERY RECEIPT 08/31/2026 Coupon discount PHP 20.00 Subtotal PHP 250.00 Tax PHP 30.00 Grand Total PHP 260.00 Paid cash",
    fileName: "IMG_1010.jpg",
    fileType: "image/jpeg",
  }).decision,
  "financial",
  "a completed receipt from the same merchant must remain eligible"
);
assert.equal(
  assessFinancialUploadScope({
    text: "This article discusses the history of architecture and how public buildings evolved across several centuries. It contains narrative prose, references to artists, and observations about materials, cities, and culture, without presenting a ledger or any commercial record.",
    fileName: "article.pdf",
  }).decision,
  "non_financial"
);

assert.equal(assessFinancialUploadScope({
  text: "HARBOUR COFFEE OFFICIAL RECEIPT TOTAL 425.00. Coupon: redeem a free coffee with your next order.",
  fileName: "IMG_1011.jpg", fileType: "image/jpeg",
}).decision, "financial", "A receipt header and total must outrank its attached coupon text");
for (const fixture of falseRejectionRegressions) {
  assert.equal(assessFinancialUploadScope({
    text: fixture.text,
    fileName: "upload.jpg",
    fileType: "image/jpeg",
  }).decision, fixture.expected, `${fixture.id}: ${fixture.reviewBasis}`);
}

const blurredStatement = "ACCOUNT STATEMENT OPENING BALANCE unreadable DEPOSIT unreadable WITHDRAWAL unreadable " +
  "Customer information and general conditions printed beside a damaged section of the original paper. ".repeat(4);
assert.ok(blurredStatement.length >= 320);
assert.equal(assessFinancialUploadScope({ text: blurredStatement, fileName: "IMG_1013.jpg", fileType: "image/jpeg" }).decision,
  "ambiguous", "Financial labels without legible values must not trigger the long-prose rejection");
assert.equal(assessFinancialUploadScope({
  text: "The walking path winds through the forest beneath the leafy canopy, following the river around the hillside. Birds nest among branches and the breeze moves softly through the trees. ".repeat(3),
  fileName: "IMG_1014.jpg", fileType: "image/jpeg",
}).decision, "ambiguous", "Prose and missing values do not identify the source photo");

for (const opticalText of [
  "炭火焼と季節のご案内　ありがとうございました　またのご来店をお待ちしております。".repeat(16),
  "MENU / RECIPE — house specialties mentioned in the merchant footer",
  "Voucher points earned",
  "HARBOUR COFFEE\nReceipt\nDate unreadable\nTotal unreadable",
  "Acme Coupon • redeem before May 25 • receipt",
]) {
  assert.notEqual(assessFinancialUploadScope({ text: opticalText, fileName: "IMG_0100.HEIC" }).decision,
    "non_financial", "Weak or conflicting photo evidence must leave an extraction or review path");
}
assert.equal(assessFinancialUploadScope({
  text: "Itinerary Template: Place | Date of Travel. Destination A. Site 1. Example expenses PHP 100.00.",
  fileName: "IMG_0101.png",
}).decision, "non_financial", "An explicit template and placeholder content establish a negative");

assert.equal(assessFinancialUploadScope({
  text: "HARBOUR COFFEE\nReceipt\nTotal 425.00",
  fileType: "image/jpeg",
}).decision, "financial", "A missing date alone cannot block a readable receipt");

const lookalikePhoto = (text: string) => assessFinancialUploadScope({
  text, fileName: "IMG_0140.jpg", fileType: "image/jpeg",
});
const cart = "Harbour Coffee\nYour Cart\nLatte PHP 150.00\nTax PHP 18.00\nGrand total PHP 168.00\nPayment method Card\nPlace order";
for (const text of [
  cart,
  "Harbour Coffee Menu\nLatte PHP 150.00\nSandwich PHP 200.00\nTax included",
  "Price List\nEspresso 110.00\nCappuccino 145.00",
]) {
  const decision = lookalikePhoto(text);
  assert.equal(decision.decision, "non_financial");
  assert.equal(getNonFinancialUploadMessage(decision), PRE_PURCHASE_UPLOAD_MESSAGE);
  assert.ok(isNonFinancialUploadError(PRE_PURCHASE_UPLOAD_MESSAGE));
}
for (const proof of ["Cash tendered PHP 200.00\nChange due PHP 32.00", "Payment approved",
  "Approval Code: 00988", "Receipt No. A1906", "Total Paid PHP 168.00", "Sales Invoice\nAmount due PHP 168.00"]) {
  assert.equal(lookalikePhoto(cart + "\n" + proof).decision, "financial", "Keep issued payment or invoice evidence eligible");
}
assert.equal(lookalikePhoto("Checkout\nAmount due PHP 168.00").decision, "ambiguous");
assert.equal(lookalikePhoto("Restaurant Menu\nLatte PHP 150.00").decision, "ambiguous");
assert.equal(lookalikePhoto(cart + "\nReceipt No.").decision, "non_financial",
  "An empty receipt-number label does not establish issuance");
assert.equal(lookalikePhoto("Restaurant Menu\nOfficial Receipt No. 1007\nTotal PHP 168.00").decision, "financial");

// The merchant name can look like a document title. Require independent
// evidence to reject it, even when the word appears on the first line.
for (const merchant of ["Daily Recipe", "Resume Studio", "The Lunch Menu", "Voucher Market"]) {
  const receipt = `${merchant}\nReceipt\n2026-08-01\nService or item A 125.00\nService or item B 25.00\nTotal 150.00`;
  for (const fileName of ["upload.jpg", "upload.pdf"]) {
    assert.equal(assessFinancialUploadScope({ text: receipt, fileName }).decision, "financial", `${merchant} (${fileName})`);
  }
}
assert.equal(lookalikePhoto("Harbour Coffee\nReceipt\nLatte 150.00\nVoucher discount -25.00\nTotal 125.00").decision, "financial");
assert.equal(lookalikePhoto("Voucher Market\nRedeem before October 1\nTerms apply").decision, "non_financial");
assert.equal(lookalikePhoto("Resume Studio\nProfessional experience\nEducation and qualifications").decision, "non_financial");

const adviserRouteSource = fs.readFileSync(path.join(process.cwd(), "app/api/adviser/chat/route.ts"), "utf8");
const factResolutionIndex = adviserRouteSource.indexOf("const factQuestion = resolveAdviserFactQuestion(localizedQuestion ?? latestIncomingQuestion, factMessages)");
const adviserGuardIndex = adviserRouteSource.indexOf("classifyAdviserScope(factQuestion, incomingMessages)");
assert.ok(factResolutionIndex >= 0 && factResolutionIndex < adviserGuardIndex, "The scope gate must assess the resolved user clarification before any financial read.");
const adviserWorkspaceIndex = adviserRouteSource.indexOf("const workspace =");
const adviserModelIndex = adviserRouteSource.indexOf('fetch("https://api.openai.com/v1/responses"');
assert.ok(adviserGuardIndex >= 0, "Adviser route must call the deterministic scope gate.");
assert.ok(adviserGuardIndex < adviserWorkspaceIndex, "Adviser scope gate must run before workspace financial queries.");
assert.ok(adviserGuardIndex < adviserModelIndex, "Adviser scope gate must run before any OpenAI request.");
assert.equal(DEFAULT_ADVISER_MODEL, "gpt-6-luna");
assert.match(adviserRouteSource, /OPENAI_ADVISER_MODEL\?\.trim\(\) \|\| DEFAULT_ADVISER_MODEL/);
assert.match(adviserRouteSource, /prompt_cache_key: "clover-adviser-v1"/);

const importParserSource = fs.readFileSync(path.join(process.cwd(), "lib/openai-import-parser.ts"), "utf8");
const importParserStart = importParserSource.indexOf("const parseImportTextWithOpenAIFallbackImpl");
const importWrapperStart = importParserSource.indexOf("export const parseImportTextWithOpenAIFallback");
assert.ok(importParserStart >= 0 && importWrapperStart > importParserStart, "The public parser must delegate to the guarded implementation.");
assert.match(importParserSource.slice(importWrapperStart, importParserSource.indexOf("export const shouldPrioritizeStrongImageTranscriptModel", importWrapperStart)), /await parseImportTextWithOpenAIFallbackImpl\(/);
const importGuardIndex = importParserSource.indexOf("assessFinancialUploadScope({", importParserStart);
const importApiKeyIndex = importParserSource.indexOf("const apiKey =", importParserStart);
assert.ok(importGuardIndex >= 0 && importGuardIndex < importApiKeyIndex, "Upload scope gate must run before OpenAI setup.");

const importWorkerSource = fs.readFileSync(path.join(process.cwd(), "workers/import-processor.ts"), "utf8");
const workerGuardIndex = importWorkerSource.indexOf("const uploadScopeDecision = assessFinancialUploadScope({");
const workerBackupIndex = importWorkerSource.indexOf("const earlyOpenAiFallbackPromise =", workerGuardIndex);
assert.ok(workerGuardIndex >= 0 && workerGuardIndex < workerBackupIndex, "Worker must reject non-financial files before backup parsing.");

const earlyRuleCheck = importWorkerSource.indexOf("const rejection = classifyExactPhotoRejection(");
assert.ok(earlyRuleCheck >= 0 && earlyRuleCheck < importWorkerSource.indexOf("const eagerReceiptImagePromise", earlyRuleCheck));
assert.match(importWorkerSource, /action: "import.scope_rejected"/);
const imageReader = fs.readFileSync(path.join(process.cwd(), "lib/import-file-text.server.ts"), "utf8");
const firstOpticalPass = imageReader.indexOf("let firstPassText = await extractTextFromImageBufferWithOcr");
assert.ok(firstOpticalPass >= 0 &&
  imageReader.indexOf("if (rejection) throw rejection;", firstOpticalPass) <
  imageReader.indexOf("const localText = await readLocalReceiptImage", firstOpticalPass));
assert.equal(getClearLocalPhotoRejection({ text: "", fileName: "coupon.jpg" }), null);
assert.equal(getClearLocalPhotoRejection({ text: "CLOVER CAFE\nOfficial Receipt\nTotal unreadable\nRedeem next visit", fileName: "image.jpg" }), null);
assert.equal(getClearLocalPhotoRejection({ text: "Kupon Diskon hingga Rp25.000 berlaku 31/12/2026", fileName: "image.jpg" })?.ruleId,
  "promotion_heading_and_redemption_terms");

const cacheContext = {
  workspaceId: "scope-qa-profile", actorUserId: "scope-qa-user", fileName: "photo.jpg", fileType: "image/jpeg",
  fileFingerprint: fingerprintImportClassificationBytes(Buffer.from("photo bytes")), importMode: "receipt",
  evidenceSource: "device_ocr" as const,
};
let evaluations = 0;
const classify = () => ++evaluations;
assert.equal(classifyExactImportEvidence(cacheContext, "photo_rejection", "optical evidence", classify), 1);
assert.equal(classifyExactImportEvidence({
  ...cacheContext, fileFingerprint: fingerprintImportClassificationBytes(new Uint8Array(Buffer.from("photo bytes"))),
}, "photo_rejection", "optical evidence", classify), 1);
for (const context of [
  { ...cacheContext, workspaceId: "another-profile" },
  { ...cacheContext, actorUserId: "another-user" },
  { ...cacheContext, importMode: "statement" },
  { ...cacheContext, fileType: "image/png" },
  { ...cacheContext, fileName: "other.png" },
  { ...cacheContext, evidenceSource: "local_text" as const },
  { ...cacheContext, fileFingerprint: fingerprintImportClassificationBytes(Buffer.from("changed bytes")) },
]) {
  const count = evaluations;
  assert.equal(classifyExactImportEvidence(context, "photo_rejection", "optical evidence", classify), count + 1);
}
assert.equal(classifyExactImportEvidence(cacheContext, "photo_rejection", "different OCR", classify), 9);
assert.equal(classifyExactImportEvidence(cacheContext, "positive_route", "optical evidence", classify), 10);
for (let expected = 11; expected <= 12; expected++) {
  assert.equal(classifyExactImportEvidence({ ...cacheContext, actorUserId: null }, "photo_rejection", "optical evidence", classify), expected);
}
let nullEvaluations = 0;
for (let run = 0; run < 2; run++) {
  assert.equal(classifyExactImportEvidence(cacheContext, "positive_route", "uncertain", () => {
    nullEvaluations++;
    return null;
  }), null);
}
assert.equal(nullEvaluations, 1);

const processRouteSource = fs.readFileSync(path.join(process.cwd(), "app/api/imports/[importId]/process/route.ts"), "utf8");
const processScopeResponseIndex = processRouteSource.indexOf("if (isNonFinancialUploadError(error))");
const processVisualRecoveryIndex = processRouteSource.indexOf("const savedTransactionsCount", processScopeResponseIndex);
assert.ok(processScopeResponseIndex >= 0, "Import processing must expose a dedicated non-financial response.");
assert.ok(processScopeResponseIndex < processVisualRecoveryIndex, "Non-financial uploads must stop before visual recovery.");
assert.match(processRouteSource, /code: "I-108"/);

const statusRouteSource = fs.readFileSync(path.join(process.cwd(), "app/api/imports/[importId]/status/route.ts"), "utf8");
assert.match(statusRouteSource, /processingPhase !== "non_financial"/, "Status polling must not restart rejected uploads.");

const queueWorkerSource = fs.readFileSync(path.join(process.cwd(), "workers/imports-worker.ts"), "utf8");
assert.match(queueWorkerSource, /job\.discard\(\)/, "Queued non-financial uploads must not consume retry attempts.");
assert.match(queueWorkerSource, /processingPhase: "non_financial"/);

const importUiSource = fs.readFileSync(path.join(process.cwd(), "components/import-files-modal.tsx"), "utf8");
assert.match(importUiSource, /error\.name === "I-108"/, "Import UI must render non-financial rejection without generic recovery.");
assert.match(importUiSource, /errorCode === "I-108"[\s\S]{0,120}item\.error/, "Import UI must preserve the specific rejection explanation.");

const importErrorSpecSource = fs.readFileSync(path.join(process.cwd(), "lib/import-error-spec.ts"), "utf8");
assert.match(importErrorSpecSource, /Try another financial file/);
assert.match(importErrorSpecSource, /Coupons, advertisements, menus, and promotional offers cannot create transactions/);

const completeEnglishIdrLedger = fs.readFileSync("scripts/fixtures/reviewed-parser-corpus/seabank-id-english-columns.txt", "utf8");
assert.equal(assessFinancialUploadScope({text:completeEnglishIdrLedger}).decision,"financial","A complete reconciled native ledger can contain a voucher counterparty");
for(const invalid of [completeEnglishIdrLedger.replace("400 | 650","401 | 650"),completeEnglishIdrLedger.replace("page 2 of 2","page 2 of 3"),completeEnglishIdrLedger.replaceAll("(IDR)","(USD)"),completeEnglishIdrLedger.replace("901 000000456","901 ***000456")]) assert.notEqual(assessFinancialUploadScope({text:invalid}).decision,"financial","An invalid native proof does not exempt a promotion-only document");
assert.equal(assessFinancialUploadScope({text:"Voucher Wallet Transfer IDR 100.00 05/01/2026\nSEABANK_ID_NATIVE_PAGES 2"}).decision,"non_financial","A marker cannot exempt a coupon");


async function verifyPublicScopeBoundary() {
  const originalFetch = globalThis.fetch;
  let externalRequests = 0;
  globalThis.fetch = async () => { externalRequests += 1; throw new Error("Non-financial upload must not reach an external service"); };
  try {
    const result = await parseImportTextWithOpenAIFallback({
      consentUserId: "non-financial-scope-test", text: "Curriculum Vitae. Professional experience: product designer. Employment history and education and qualifications.",
      fileName: "resume.jpg", fileType: "image/jpeg", importMode: "receipt", parsedRows: [], detectedMetadata: null,
      preferPrimary: true, onUsage: () => assert.fail("Rejected content cannot consume AI allowance"),
    });
    assert.equal(result, null);
    assert.equal(externalRequests, 0, "The actual public wrapper must reject irrelevant photos before any cloud request");
    console.log("Financial upload and Adviser scope gate regression passed.");
  } finally { globalThis.fetch = originalFetch; }
}
verifyPublicScopeBoundary().catch(error => { console.error(error); process.exitCode = 1; });
