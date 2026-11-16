import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { detectStatementMetadata, parseImportText, type ParsedImportRow } from "@/lib/import-parser";
import { assessBpiStatementReconciliation, BPI_RECONCILIATION_VERSION, isBpiCardMetadata } from "@/lib/bpi-statement-reconciliation";

const fail = (reason: string): never => { throw new Error(`VERIFICATION_CHECKPOINT_${reason}`); };
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Only computes a proposed checkpoint patch. Never calls the import worker,
// account balance updater, learning pipeline, or parsed-row replacement path.
export async function planBpiCheckpointRepair(db: Prisma.TransactionClient, input: { importFileId: string; workspaceId: string; sourceSha256: string; text: string }) {
  const file = await db.importFile.findUniqueOrThrow({ where: { id: input.importFileId }, include: { account: true, statementCheckpoint: true, parsedRows: true, transactions: true } });
  const checkpoint = file.statementCheckpoint, account = file.account;
  if (file.workspaceId !== input.workspaceId || file.sourceFingerprint !== input.sourceSha256 || file.status !== "done" || !checkpoint || !account || checkpoint.accountId !== account.id || checkpoint.workspaceId !== file.workspaceId || account.workspaceId !== file.workspaceId) fail("SOURCE_OR_SCOPE_CHANGED");
  if (!checkpoint || !account) return fail("MISSING_RECORD");
  const metadata = detectStatementMetadata(input.text, file.fileName);
  if (!metadata || !isBpiCardMetadata(metadata) || !digits(metadata.accountNumber) || digits(metadata.accountNumber) !== digits(account.accountNumber) || account.type !== "credit_card" || account.currency !== metadata.currency) fail("IDENTITY_CONFLICT");
  if (!metadata) return fail("MISSING_METADATA");
  // Reject multiple identities/bill dates, even when a first-match parser could
  // otherwise appear confident. Repeated identical page headers are valid.
  for (const pattern of [/CUSTOMER\s+NUMBER\s*:?\s*([\d ]{8,})/gi, /STATEMENT\s+DATE\s*:?\s*([A-Z]+\s+\d{1,2},\s*\d{4})/gi, /PAYMENT\s+DUE\s+DATE\s*:?\s*([A-Z]+\s+\d{1,2},\s*\d{4})/gi, /CURRENCY\s*:?\s*([A-Z]{3})/gi]) {
    const values = [...input.text.matchAll(pattern)].map(m => m[1].replace(/\s/g, "").toUpperCase());
    if (new Set(values).size > 1) fail("CONFLICTING_HEADERS");
  }
  const rows = parseImportText(input.text, file.fileName, file.fileType, { institution: metadata.institution, accountNumber: metadata.accountNumber, accountName: metadata.accountName });
  if (!rows.length || rows.length !== file.parsedRows.length || rows.length !== file.transactions.length || rows.length !== checkpoint.rowCount) fail("ROW_COUNT_CONFLICT");
  // Compare multisets, not sets: legitimate repeated transactions must retain
  // every occurrence. Merchant/category edits do not change ledger arithmetic.
  const ledger = (items: Array<{ date?: unknown; amount?: unknown; currency?: unknown; type?: unknown }>) => items.map(row => {
    const date = row.date instanceof Date ? row.date.toISOString() : String(row.date);
    return [date.slice(0, 10), Number(row.amount).toFixed(2), row.currency ?? metadata.currency, row.type].join("|");
  }).sort();
  if (hash(ledger(rows)) !== hash(ledger(file.parsedRows)) || hash(ledger(rows)) !== hash(ledger(file.transactions))) fail("LEDGER_CONFLICT");
  if (file.transactions.some(row => row.workspaceId !== file.workspaceId || row.accountId !== account.id || row.deletedAt || row.isExcluded || row.isTransfer || !["confirmed", "edited"].includes(row.reviewStatus))) fail("REVIEW_REQUIRED");
  if (file.parsedRows.some(row => row.workspaceId !== file.workspaceId || digits(row.accountNumber) !== digits(account.accountNumber))) fail("IDENTITY_CONFLICT");
  const reconciliation = assessBpiStatementReconciliation(input.text, metadata, rows as ParsedImportRow[]);
  if (["CONFLICTING_HEADERS", "MISSING_ENDING_BALANCE", "UNRESOLVED_LEDGER"].includes(reconciliation.code) || !metadata.statementDate || !metadata.paymentDueDate) fail("INCOMPLETE_SOURCE");
  const old = object(checkpoint.sourceMetadata);
  const priorRepair = object(old.checkpointRepair);
  const fields = { statementStartDate: reconciliation.statementStartDate, statementEndDate: reconciliation.statementEndDate, openingBalance: metadata.openingBalance, endingBalance: metadata.endingBalance };
  for (const [key, value] of Object.entries(fields)) {
    const saved = checkpoint[key as keyof typeof fields];
    const normalized = saved instanceof Date ? saved.toISOString() : saved === null ? null : Number(saved);
    if (saved !== null && normalized !== value) fail("EXISTING_METADATA_CONFLICT");
  }
  for (const [key, value] of Object.entries({ statementDate: metadata.statementDate, paymentDueDate: metadata.paymentDueDate, totalAmountDue: metadata.totalAmountDue, openingBalance: metadata.openingBalance, endingBalance: metadata.endingBalance })) {
    if (old[key] !== null && old[key] !== undefined && old[key] !== value) fail("EXISTING_METADATA_CONFLICT");
  }
  if (checkpoint.status !== "pending" && priorRepair.version !== BPI_RECONCILIATION_VERSION) fail("ALREADY_REVIEWED");
  if (metadata.openingBalance !== null && reconciliation.statementStartDate) {
    const previous = await db.accountStatementCheckpoint.findFirst({ where: { workspaceId: file.workspaceId, accountId: account.id, id: { not: checkpoint.id }, statementEndDate: { lt: new Date(reconciliation.statementStartDate) }, endingBalance: { not: null } }, orderBy: { statementEndDate: "desc" } });
    if (previous && Number(previous.endingBalance) !== metadata.openingBalance) fail("PREVIOUS_BALANCE_CONFLICT");
  }
  const sourceMetadata = { ...old,
    statementDate: metadata.statementDate, paymentDueDate: metadata.paymentDueDate, totalAmountDue: metadata.totalAmountDue,
    openingBalance: metadata.openingBalance, endingBalance: metadata.endingBalance,
    // Preserve confirmed identity and every unrelated audit/learning field.
    accountName: old.accountName ?? account.name, institution: old.institution ?? account.institution,
    accountNumber: old.accountNumber ?? account.accountNumber, accountType: old.accountType ?? account.type,
    startDate: reconciliation.statementStartDate, endDate: reconciliation.statementEndDate,
    workflowStage: reconciliation.status === "mismatch" ? "repair_needed" : "complete", balanceReconciled: reconciliation.balanceReconciled, reconciliation,
    checkpointRepair: { version: BPI_RECONCILIATION_VERSION, sourceSha256: input.sourceSha256, textSha256: createHash("sha256").update(input.text).digest("hex"), preservedFinancialRows: true },
  };
  const patch = { ...fields, status: reconciliation.status, mismatchReason: reconciliation.reason, sourceMetadata: sourceMetadata as Prisma.InputJsonValue };
  const unchanged = checkpoint.status === patch.status && checkpoint.mismatchReason === patch.mismatchReason &&
    Object.entries(fields).every(([key, value]) => { const v = checkpoint[key as keyof typeof fields]; return (v instanceof Date ? v.toISOString() : v === null ? null : Number(v)) === value; }) &&
    // JSONB key order is not stable; compare normalized objects recursively.
    stable(checkpoint.sourceMetadata) === stable(sourceMetadata);
  return { checkpoint, patch, unchanged, planHash: hash([checkpoint, patch]), reconciliation };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
