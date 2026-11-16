import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { buildGrabReceiptNativePages, parseGrabEmailReceipt } from "../lib/grab-email-receipt";
import { parseHeldNativeSource } from "../lib/held-source-contracts";
import { isSourceReviewRequiredError } from "../lib/import-source-review";
import { AI_CONSENT_VERSION } from "../../shared/ai-consent";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, process.env.CLOVER_QA_PARSER_PORT ?? "55441");
assert.equal(url.pathname, "/clover_migration_qa");
assert.equal(process.env.DIRECT_URL, process.env.DATABASE_URL);
assert(process.argv.includes("--execute"));

const require = createRequire(import.meta.url);
require("next/cache").revalidateTag = () => {};
const tasks: Array<() => Promise<void>> = [];
require("next/server").after = (task: () => Promise<void>) => tasks.push(task);
let providerCalls = 0;
globalThis.fetch = async () => {
  providerCalls += 1;
  throw new Error("Batch 24 regression must use local parsing only");
};

// Invented identities, dates and amounts. Preserve only the reviewed shapes:
// four pages per ledger, two separate ride messages, and explicit source proof.
const rupiah = (amount: number) => new Intl.NumberFormat("id-ID").format(amount);
function seaBankLedger(accountNumber: string, pageCounts: number[], opening: number, month: "JAN" | "MAR") {
  let balance = opening;
  let incoming = 0;
  let outgoing = 0;
  const movements: { amount: number; balance: number; direction: string }[] = [];
  const pages = pageCounts.flatMap((count, page) => [
    `SEABANK_ID_ROW_COUNT ${count}`,
    ...Array.from({ length: count }, (_, index) => {
      const credit = index === 0 || index === count - 1;
      const amount = index === 0 ? 20_000 + page * 1_000 : credit ? 13 : 1_250;
      const direction = credit ? "incoming" : "outgoing";
      const description = index === 0 ? "Example Credit Transfer" : credit ? "Bunga Tabungan" : "Example Store Pembayaran";
      if (credit) incoming += amount;
      else outgoing += amount;
      balance += credit ? amount : -amount;
      movements.push({ amount, balance, direction });
      return `SEABANK_ID_TXN | 0${page + 5} ${month} | ${direction} | ${rupiah(amount)} | ${rupiah(balance)} | ${description}`;
    }),
  ]);
  const totals = [opening, outgoing, incoming, balance];
  const text = [
    "REKENING KORAN", `NO. REKENING SEABANK: ${accountNumber}`, "cs@seabank.co.id", "RINGKASAN REKENING",
    `01 ${month} 2026 sampai 31 ${month} 2026`,
    "REKENING SALDO AWAL (IDR) TRANSAKSI KELUAR (IDR) TRANSAKSI MASUK (IDR) SALDO AKHIR (IDR)",
    `TABUNGAN ${totals.map(rupiah).join(" ")} TOTAL: ${rupiah(balance)}`,
    "TABUNGAN - RINCIAN TRANSAKSI", "TANGGAL TRANSAKSI KELUAR (IDR) MASUK (IDR) SALDO AKHIR (IDR)",
    ...pageCounts.map((_, index) => `halaman ${index + 1} dr 4`),
    "SEABANK_ID_NATIVE_PAGES 4", `SEABANK_ID_SUMMARY | ${totals.map(rupiah).join(" | ")}`, ...pages,
  ].join("\n");
  return { accountNumber, text, movements, opening, closing: balance, incoming, outgoing };
}

const ledgers = [
  seaBankLedger("901000000417", [6, 12, 14, 3], 83_200, "JAN"),
  seaBankLedger("901000000428", [6, 12, 11, 3], 117_400, "MAR"),
];

const rides = [
  { reference: "A-EXAMPLEBATCH2401", place: "Cebu City", date: "8 April 2026" },
  { reference: "A-EXAMPLEBATCH2402", place: "Pasay Terminal", date: "8 April 2026" },
];
const grabPages = rides.map(({ reference, place, date }, index) => [
  ...(index === 0 ? ["Your Grab E-Receipt", "2 messages"] : []),
  "Hope you enjoyed your ride!", `Picked up on ${date}`, `Booking ID: ${reference}`,
  "Total Paid P 137.00", "Breakdown", "Base fare 45.00", "Distance 40.00", "Time 22.00",
  "Surge charges 30.00", "Total Paid 137.00", "Passenger Paid by", "Example Rider",
  "Cash 137.00", "Your Trip", place,
].join("\n"));

async function main() {
  const grabText = buildGrabReceiptNativePages(grabPages)!;
  assert.deepEqual(parseGrabEmailReceipt(grabText)?.rows.map(row => [
    row.currency, row.amount, row.accountName, row.rawPayload?.referenceNumber,
  ]), rides.map(({ reference }) => ["PHP", "137.00", "Cash", reference]));
  assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages(grabPages.slice(0, 1))!), isSourceReviewRequiredError);
  for (const ledger of ledgers) {
    const parsed = parseHeldNativeSource(ledger.text)!;
    assert.deepEqual(parsed.rows.map(row => ({
      amount: Number(row.amount), balance: row.balance, direction: row.rawPayload?.direction,
    })), ledger.movements);
    assert.throws(() => parseHeldNativeSource(ledger.text.replace("halaman 4 dr 4", "")), isSourceReviewRequiredError);
    assert.throws(() => parseHeldNativeSource(ledger.text.replace(
      `| ${rupiah(ledger.movements[0].balance)} | Example Credit Transfer`,
      `| ${rupiah(ledger.movements[0].balance + 1)} | Example Credit Transfer`,
    )), isSourceReviewRequiredError);
  }

  const { prisma: db } = await import("../lib/prisma");
  const { confirmImportFile, processImportFileText } = await import("../workers/import-processor");
  const { processLearningJob } = await import("../lib/learning-jobs");
  const user = await db.user.create({ data: {
    clerkUserId: randomUUID(), email: `${randomUUID()}@example.invalid`, environment: "staging",
    planTier: "pro", planTierLocked: true,
    appPreferences: { aiConsent: { version: AI_CONSENT_VERSION, grantedAt: new Date().toISOString(), withdrawnAt: null } },
  } });
  try {
    const workspace = await db.workspace.create({ data: { userId: user.id, name: "Synthetic Batch 24" } });
    const existingAccounts = await Promise.all(ledgers.map(ledger => db.account.create({ data: {
      workspaceId: workspace.id, name: "Customized SeaBank", nameCustomized: true,
      institution: "SeaBank Indonesia", accountNumber: ledger.accountNumber, type: "bank",
      currency: "IDR", balance: "382451", source: "manual",
    } })));
    const existingTransactions = await Promise.all(existingAccounts.map(account => db.transaction.create({ data: {
      workspaceId: workspace.id, accountId: account.id, reviewStatus: "confirmed",
      date: new Date("2025-12-15T00:00:00Z"), amount: "5100", currency: "IDR",
      type: "expense", merchantRaw: "Example Historic Payment", merchantClean: "My confirmed correction",
      rawPayload: { evidence: "Synthetic earlier import" },
    } })));
    const preserved = async () => JSON.stringify(await Promise.all([
      db.account.findMany({ where: { id: { in: existingAccounts.map(row => row.id) } }, orderBy: { id: "asc" } }),
      db.transaction.findMany({ where: { id: { in: existingTransactions.map(row => row.id) } }, orderBy: { id: "asc" } }),
    ]));
    const before = await preserved();
    const settle = async () => {
      while (tasks.length) await Promise.all(tasks.splice(0).map(task => task()));
      for (const job of await db.learningJob.findMany({ where: { workspaceId: workspace.id, status: "queued" } })) {
        await processLearningJob(job.id);
      }
    };
    const importText = async (fileName: string, text: string, importMode: "statement" | "receipt") => {
      const file = await db.importFile.create({ data: {
        workspaceId: workspace.id, fileName, fileType: "application/pdf", storageKey: `qa/${randomUUID()}`,
      } });
      await processImportFileText(file.id, { text, importMode, actorUserId: user.clerkUserId });
      await settle();
      assert.equal((await db.importFile.findUniqueOrThrow({ where: { id: file.id } })).status, "done");
      return file.id;
    };
    const fileIds: string[] = [];
    for (const [index, ledger] of ledgers.entries()) {
      const importFileId = await importText(`Synthetic SeaBank ${index + 1}.pdf`, ledger.text, "statement");
      fileIds.push(importFileId);
      const rows = await db.transaction.findMany({ where: { importFileId } });
      assert.equal(rows.length, ledger.movements.length);
      assert(rows.every(row => row.accountId === existingAccounts[index].id && row.currency === "IDR"));
      const checkpoint = await db.accountStatementCheckpoint.findFirstOrThrow({ where: { importFileId } });
      assert.equal(Number(checkpoint.openingBalance), ledger.opening);
      assert.equal(Number(checkpoint.endingBalance), ledger.closing);
      assert.equal(checkpoint.mismatchReason, null);
    }
    const grabId = await importText("Synthetic Grab E-Receipt.pdf", grabText, "receipt");
    fileIds.push(grabId);
    const storedRides = await db.transaction.findMany({ where: { importFileId: grabId } });
    assert.deepEqual(storedRides.map(row => (row.rawPayload as Record<string, unknown>).referenceNumber).sort(), rides.map(row => row.reference));
    assert(storedRides.every(row => row.currency === "PHP" && Number(row.amount) === 137));
    assert.equal(await preserved(), before, "Learning and new imports must preserve prior confirmed rows and current bank balances");

    const snapshot = async () => JSON.stringify(await Promise.all([
      db.account.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: "asc" } }),
      db.transaction.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: "asc" } }),
      db.accountStatementCheckpoint.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: "asc" } }),
      db.trainingSignal.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: "asc" } }),
      db.learningJob.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: "asc" } }),
    ]));
    assert.equal(await db.trainingSignal.count({ where: { workspaceId: workspace.id } }), 69);
    const jobs = await db.learningJob.findMany({ where: { workspaceId: workspace.id } });
    assert.equal(jobs.length, 6);
    assert(jobs.every(job => job.status === "completed"));
    const settled = await snapshot();
    for (const fileId of fileIds) await confirmImportFile(fileId);
    await settle();
    assert.equal(await snapshot(), settled, "Repeat confirmation must preserve all stored rows and timestamps");
    assert.equal(providerCalls, 0);
    console.log("Batch 24 passed: 69 movements and signals, 6 completed jobs, and exact preservation before and after replay.");
  } finally {
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
