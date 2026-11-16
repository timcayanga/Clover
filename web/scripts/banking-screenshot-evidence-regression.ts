import assert from "node:assert/strict";
import { bankingReviewMessage, classifyBankingScreenshot, inspectBankingScreenshot, readBankingStatusEvidence } from "../lib/banking-screenshot-evidence";
import { assessFinancialUploadScope, getNonFinancialUploadMessage, isNonFinancialUploadError } from "../lib/financial-upload-scope";
import { parseImportText, parseImportTextGenericOnly } from "../lib/import-parser";

const home = "Wallet\nHome\nAvailable balance\n₱500.00\nSend money\nCash in\nPay bills\nRewards";
const banner = "Congratulations!\nTransfer Successful\nPHP 500.00\nDone";
const history = "Recent transactions\n2026-09-15\nCoffee purchase\n-₱125.00\nPosted\nCash deposit\n+₱500.00\nCompleted";
const detail = "Transaction Details\n2026-09-15\nRecipient: Sample Shop\nAmount: PHP 125.00\nReference Number: AB12345\nStatus: Completed";

for (const text of [home, banner]) {
  assert.equal(classifyBankingScreenshot(text), "screen_only");
  const scope = assessFinancialUploadScope({ text, fileName: "screenshot.png", parsedRowsCount: 1, metadataConfidence: 99, hasInstitution: true });
  assert.equal(scope.decision, "non_financial");
  assert.equal(scope.kind, "banking_screen");
  assert.ok(isNonFinancialUploadError(new Error(getNonFinancialUploadMessage(scope))));
}
assert.equal(classifyBankingScreenshot(detail), "detail");
for (const status of ["Pending", "Failed", "Reversed", "Gagal", "처리 중"]) {
  assert.equal(classifyBankingScreenshot(detail.replace("Completed", status)), "unsettled_detail");
}
const reviewCases = [
  [detail.replace("Completed", "Declined"), "failed_payment", "Status: Declined"],
  [detail.replace("Completed", "Authorized only"), "pending_authorization", "Status: Authorized only"],
  ["Authorization hold", "pending_authorization", "Authorization hold"],
  ["Refund notice\nRefund amount: ₱125.00\nRefund expected by 2026-09-17", "refund_notice", "Refund notice"],
  ["Refund Details\nStatus: Pending", "refund_notice", "Status: Pending"],
  ["Refund completed\nRefund amount: ₱125.00", "refund_notice", "Refund completed"],
  ["Payment request received\nAmount: ₱125.00", "payment_request", "Payment request received"],
  [detail.replace("Completed", "Reversed"), "reversed_payment", "Status: Reversed"],
] as const;
for (const [text, status, printedStatus] of reviewCases) {
  assert.deepEqual(inspectBankingScreenshot(text), { kind: "unsettled_detail", review: { status, printedStatus } });
  assert.deepEqual(assessFinancialUploadScope({ text, fileName: "screenshot.png" }).reasons, [status]);
  assert.ok(bankingReviewMessage[status]);
  assert.deepEqual(parseImportText(text, "screenshot.png", "image/png"), []);
  assert.deepEqual(parseImportTextGenericOnly(text, "screenshot.png", "image/png"), []);
}
assert.equal(new Set(reviewCases.map(([, status]) => bankingReviewMessage[status])).size, 5);
assert.equal(readBankingStatusEvidence("Refund credited"), "posted");
assert.equal(inspectBankingScreenshot("Refund notice\nRefund credited\n2026-09-15\nAmount credited: PHP 125.00\nReference Number: RF12345").kind, "detail");

assert.equal(classifyBankingScreenshot(history), "history");
assert.equal(classifyBankingScreenshot(home + "\n" + history), "history");
assert.equal(classifyBankingScreenshot("Completed"), "unknown");
assert.equal(classifyBankingScreenshot("支付成功"), "screen_only");
assert.equal(classifyBankingScreenshot("茶馆\n支付成功\n实付金额：88元"), "unknown");
assert.equal(classifyBankingScreenshot("Official Receipt\nCongratulations!\nGrand Total PHP 125.00"), "unknown");
assert.equal(classifyBankingScreenshot("Transaction History\nAvailable Balance\nPHP 100.00"), "unknown");

const mixed = "Transaction History\n2026-09-15\nCoffee purchase\n-₱125.00\nFailed\n2026-09-16\nGrocery purchase\n-₱350.00\nPosted";
const rows = parseImportTextGenericOnly(mixed, "history.png", "image/png");
assert.deepEqual(rows.map(row => Number(row.amount)), [350]);
assert.ok(rows[0].rawPayload?.reviewRequired);
const sameDate = parseImportTextGenericOnly(mixed.replace("\n2026-09-16", ""), "history.png", "image/png");
assert.deepEqual(sameDate.map(row => [Number(row.amount), row.description]), [[350, "Grocery purchase"]]);
const refundHistory = "Transaction History\n2026-09-15\nRefund from Coffee shop\n+₱125.00\nRefund credited";
assert.deepEqual(parseImportTextGenericOnly(refundHistory, "history.png", "image/png").map(row => [row.type, Number(row.amount)]),
  [["income", 125]]);
assert.deepEqual(parseImportTextGenericOnly(refundHistory.replace("Refund credited", "Refund initiated"), "history.png", "image/png"), []);
console.log("Banking screenshots: home, banner, completed details, unsettled status and mixed history passed");
