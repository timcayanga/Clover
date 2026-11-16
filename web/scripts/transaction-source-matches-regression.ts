import { Prisma } from "@prisma/client";
import assert from "node:assert/strict";
import {
  linkReceiptToExistingExpense, loadTransactionSourceMatches, receiptItemsForSourceMatch, scoreTransactionSourceMatch,
  sourceMatchConfirmedAction, sourceMatchDismissedAction, sourceMatchProvenance,
} from "../lib/transaction-source-matches";

type Row = Parameters<typeof scoreTransactionSourceMatch>[0];
const decimal = (value: number) => ({
  isZero: () => value === 0, abs: () => decimal(Math.abs(value)), negated: () => decimal(-value),
  equals: (other: number | { toNumber(): number }) => value === (typeof other === "number" ? other : other.toNumber()),
  toNumber: () => value, toString: () => String(value), toFixed: (digits: number) => value.toFixed(digits),
}) as unknown as Row["amount"];

const statement: Row = {
  id: "statement-row", workspaceId: "profile", accountId: "bank", importFileId: "statement",
  date: new Date("2026-11-09"), amount: decimal(120), currency: "PHP", type: "expense",
  isTransfer: false, isExcluded: false, reviewStatus: "confirmed",
  merchantRaw: "POS North Star Cafe Terminal 92K", merchantClean: "North Star Cafe",
  rawPayload: { sourceRowIndex: 8 }, normalizedPayload: { userEdit: true },
  account: { name: "Bank", accountNumber: "1234567890" }, receiptDocument: null,
};
const receipt: Row = {
  ...statement, id: "receipt-row", importFileId: "receipt-upload", merchantRaw: "North Star Cafe",
  receiptDocument: { id: "receipt-document" }, normalizedPayload: null,
  rawPayload: { receiptDetails: { lineItems: [{ description: "Coffee", amount: "120", currency: "PHP" }] } },
};
const manual: Row = {
  ...statement, id: "manual-row", importFileId: null, merchantRaw: "North Star Cafe", rawPayload: null,
};
assert.ok(scoreTransactionSourceMatch(statement, manual));
assert.ok(scoreTransactionSourceMatch(statement, receipt));
assert.ok(scoreTransactionSourceMatch(receipt, statement));
assert.equal(scoreTransactionSourceMatch(statement, { ...manual, workspaceId: "other" }), null);
assert.equal(scoreTransactionSourceMatch(statement, { ...manual, accountId: "another-bank" }), null);
assert.equal(scoreTransactionSourceMatch(statement, { ...manual, currency: "USD" }), null);
assert.equal(scoreTransactionSourceMatch(statement, { ...manual, amount: decimal(121) }), null);
assert.equal(scoreTransactionSourceMatch(
  { ...statement, rawPayload: { paymentReference: "AAAA123456789" } },
  { ...receipt, rawPayload: { paymentReference: "BBBB123456789" } },
), null);
assert.equal(scoreTransactionSourceMatch(statement, {
  ...receipt, rawPayload: { receiptAccountMatch: { account_last4: "1111" } },
}), null);
assert.ok(scoreTransactionSourceMatch(
  { ...statement, rawPayload: { originalAmount: 10, originalCurrency: "USD" } },
  { ...receipt, amount: decimal(10), currency: "USD" },
));
assert.ok(scoreTransactionSourceMatch(
  { ...statement, rawPayload: { approvalCode: "803612" } },
  { ...receipt, date: new Date("2026-11-07"), merchantClean: null, merchantRaw: "Different printed seller",
    rawPayload: { receiptDetails: { authorization_code: "803612" } } },
));
assert.equal(scoreTransactionSourceMatch(statement, {
  ...receipt, rawPayload: { dateInferredFromFileName: true },
}), null);
assert.equal(scoreTransactionSourceMatch(
  { ...statement, rawPayload: { timeText: "09:00" } },
  { ...receipt, rawPayload: { receiptDetails: { transaction_time: "11:00" } } },
), null);
assert.ok(receiptItemsForSourceMatch(statement, receipt));
assert.equal(receiptItemsForSourceMatch({ ...statement, amount: decimal(121) }, receipt), null);
assert.equal(receiptItemsForSourceMatch({
  ...statement, normalizedPayload: { receiptLineItems: [{ description: "User item", amount: "120" }] },
}, receipt), null);
assert.deepEqual(sourceMatchProvenance(statement), {
  source: "Import", importFileId: "statement", sourceRowIndex: 8, receiptDocumentId: null,
});
assert.equal(sourceMatchProvenance(receipt).receiptDocumentId, "receipt-document");

async function main() {
  const repeated = { ...receipt, id: "another-receipt" };
  const rows = [receipt, repeated, manual];
  const decisions: Array<{ entityId: string; action: string; metadata: { candidateId: string } }> = [];
  const lookups: Prisma.TransactionWhereInput[] = [];
  const db = {
    transaction: { findMany: async ({ where }: { where: Prisma.TransactionWhereInput }) => {
      lookups.push(where);
      const id = typeof where.id === "object" ? where.id : null;
      return rows.filter(row => !id?.in || (Array.isArray(id.in) && id.in.includes(row.id)));
    } },
    auditLog: { findMany: async () => decisions },
  } as unknown as Parameters<typeof loadTransactionSourceMatches>[0];
  const lateStatement = { ...statement, date: new Date("2026-11-09T23:59:59Z") };
  const suggested = await loadTransactionSourceMatches(db, lateStatement);
  assert.equal(lookups[0].workspaceId, "profile");
  assert.deepEqual(lookups[0].date, { gte: new Date("2026-11-05"), lt: new Date("2026-11-14") });
  assert.equal(lookups[0].OR?.[0].currency, "PHP");
  assert.deepEqual(lookups[0].OR?.at(-1)?.currency, { not: "PHP" });
  assert.equal(scoreTransactionSourceMatch(lateStatement, {
    ...receipt, date: new Date("2026-11-05T00:00:00Z"), rawPayload: { approvalCode: "803612" },
  }), null, "Being in the database window alone does not establish a match");
  assert.equal(suggested.length, 3, "Repeated purchases remain separate candidates");
  assert.ok(suggested.every(match => !match.confirmed && !match.canCopyLineItems));
  decisions.push({ entityId: receipt.id, action: sourceMatchConfirmedAction, metadata: { candidateId: statement.id } });
  const linked = await loadTransactionSourceMatches(db, statement);
  assert.equal(linked[0].id, receipt.id);
  assert.equal(linked[0].canCopyLineItems, true);
  assert.equal((await loadTransactionSourceMatches(db, { ...statement, type: "income" }))[0].confirmed, true);
  decisions.push({ entityId: statement.id, action: sourceMatchDismissedAction, metadata: { candidateId: receipt.id } });
  assert.ok((await loadTransactionSourceMatches(db, statement)).every(match => match.id !== receipt.id));
  assert.deepEqual(statement.normalizedPayload, { userEdit: true });
  const writes: unknown[] = [];
  const real = (row: Row) => ({ ...row, amount: new Prisma.Decimal(row.amount.toString()) });
  let available = [real(statement)];
  const attachDb = {
    $queryRaw: async () => [{ id: statement.id }],
    transaction: {
      findMany: async ({ where }: { where: Prisma.TransactionWhereInput }) => { lookups.push(where); return available; },
      findFirst: async () => available[0],
      update: async ({ data }: { data: unknown }) => { writes.push(data); },
    },
    receiptDocument: { updateMany: async () => ({ count: 1 }) },
  } as unknown as Parameters<typeof linkReceiptToExistingExpense>[0];
  const input = { workspaceId: receipt.workspaceId, accountId: receipt.accountId, date: receipt.date,
    amount: "120", currency: receipt.currency, merchantRaw: receipt.merchantRaw!, rawPayload: receipt.rawPayload! };
  assert.equal((await linkReceiptToExistingExpense(attachDb, "receipt-document", input))?.id, statement.id);
  assert.equal(lookups.at(-1)?.workspaceId, input.workspaceId);
  assert.equal(lookups.at(-1)?.accountId, input.accountId);
  assert.equal(lookups.at(-1)?.currency, input.currency);
  assert.deepEqual(lookups.at(-1)?.date, { gte: new Date("2026-11-09"), lt: new Date("2026-11-10") });
  assert.deepEqual(lookups.at(-1)?.amount, { in: [new Prisma.Decimal(120), new Prisma.Decimal(-120)] });
  assert.deepEqual(writes[0], { normalizedPayload: {
    userEdit: true,
    linkedReceipt: { id: "receipt-document", confidence: 90, evidence: [
      "Same amount and currency", "Same date", "Similar merchant", "Matching account evidence",
    ] },
    receiptLineItems: [{ description: "Coffee", amount: "120", currency: "PHP", quantity: null, unitPrice: null }],
  } });
  available = [real(manual)];
  assert.equal((await linkReceiptToExistingExpense(attachDb, "receipt-document", input))?.id, manual.id);
  available = [real(manual), real(statement)];
  assert.equal(await linkReceiptToExistingExpense(attachDb, "receipt-document", input), null);
  available = [{ ...real(statement), receiptDocument: { id: "older-receipt" } }];
  assert.equal(await linkReceiptToExistingExpense(attachDb, "receipt-document", input), null);
  assert.equal(writes.length, 2);
  console.log("Statement links preserve separate purchases, confirmed decisions and receipt evidence.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
