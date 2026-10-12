import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  parseImportText,
  parseCimbConsolidatedStatement,
  hasVerifiedCimbConsolidatedRows,
} from "../lib/import-parser";
import {
  parseBcaTransferProof,
  buildBcaTransferPdfRows,
  hasVerifiedBcaTransferRows,
} from "../lib/bca-transfer-proof";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55441");
assert.equal(url.pathname, "/clover_migration_qa");
assert(process.argv.includes("--execute"));
const require = createRequire(join(process.cwd(), "package.json"));
require("next/cache").revalidateTag = () => {};
const tasks: Array<() => Promise<void>> = [];
require("next/server").after = (t: () => Promise<void>) => tasks.push(t);
const drain = async () => {
  while (tasks.length) await Promise.all(tasks.splice(0).map((t) => t()));
};
let network = 0;
globalThis.fetch = async () => {
  network++;
  throw new Error("Isolated database regression forbids provider requests");
};
async function main() {
  const cimb = readFileSync(
      "scripts/fixtures/reviewed-parser-corpus/cimb-consolidated-zero-account.txt",
      "utf8",
    ),
    bca = readFileSync(
      "scripts/fixtures/reviewed-parser-corpus/bca-transfer-components.txt",
      "utf8",
    );
  assert(
    hasVerifiedCimbConsolidatedRows(
      cimb,
      parseImportText(cimb, "source.pdf", "application/pdf"),
    ),
  );
  for (const bad of [
    cimb.replace("Total Deposit PHP 102.00", "Total Deposit PHP 103.00"),
    cimb.replace("PHP 122.00", "PHP 123.00"),
    cimb.replace("Page 1 of 1", "Page 1 of 2"),
    cimb.replace("CIMB_NATIVE_PAGES 1", "CIMB_NATIVE_PAGES 2"),
    cimb.replace(
      "Nov 30, 2025 Closing Balance PHP 121.00",
      "Nov 29, 2025 Closing Balance PHP 121.00",
    ),
    cimb.replace(
      "Nov 01, 2025 Opening Balance PHP 20.00",
      "Nov 01, 2025 Opening Balance",
    ),
  ])
    assert.deepEqual(
      parseCimbConsolidatedStatement(bad)?.rows,
      [],
      "Incomplete/contradictory source cannot supply a reconciled proof",
    );
  assert(
    hasVerifiedBcaTransferRows(
      bca,
      parseImportText(bca, "source.pdf", "application/pdf"),
    ),
  );
  for (const bad of [
    bca.replace(/^BCA_TRANSFER .+$/m, ""),
    bca.replace("Halaman 1 dari 1", "Halaman 1 dari 2"),
    bca.replace("BCA_NATIVE_PAGES 1", "BCA_NATIVE_PAGES 2"),
    bca.replace('"status":"Berhasil"', '"status":"Gagal"'),
    bca.replace('"fx":"1.00"', '"fx":"2.00"'),
    bca.replace('"fee":"Rp 2.00"', '"fee":"2.00"'),
    bca.replace('"transferDate":"10/04/2025"', '"transferDate":"31/04/2025"'),
  ])
    assert.deepEqual(parseBcaTransferProof(bad)?.rows, []);
  const csv =
    'Date,Description,Amount,Currency\n2025-06-03,"' +
    bca.replace(/\n/g, " ").replace(/"/g, '""') +
    '",4.50,USD';
  assert.equal(
    parseImportText(csv, "export.csv", "text/csv")[0]?.amount,
    "4.50",
  );
  assert.equal(parseImportText(csv, "export.csv", "text/csv").length, 1);
  const item = (str: string, x: number, y: number) => ({
    str,
    transform: [1, 0, 0, 7.3, x, y],
    width: str.length * 4,
  });
  const items = [
    item("Transfer Dana", 45, 783),
    item("Transaksi berhasil diotorisasi", 45, 753),
    item("BCA. Hak cipta", 45, 566),
    ...[
      "Tanggal",
      "Jenis",
      "Tanggal",
      "Dari Rekening",
      "Rekening /",
      "Jumlah",
      "Biaya",
      "Kurs",
      "Status Alasan No. Referensi",
    ].map((s, i) =>
      item(s, [47, 90, 131, 172, 252, 311, 365, 397, 424][i]!, 698),
    ),
    item("Transfer", 90, 690),
    item("10/04/2025", 47, 651),
    item("09:12:34", 47, 641),
    item("Rekening Bank Lain", 90, 651),
    item("10/04/2025", 131, 651),
    item("09:12:34", 131, 641),
    item("001-", 172, 661),
    item("1234567 / EXAMPLE HOLDING", 172, 651),
    item("P (Rp)", 172, 631),
    item("90012345678", 257, 646),
    item("Rp 30.00", 311, 646),
    item("Rp", 365, 651),
    item("2.00", 365, 641),
    item("1.00", 397, 646),
    item("Berhasil", 424, 646),
    item("-", 457, 646),
    item("20250410001234", 493, 646),
  ];
  assert.deepEqual(buildBcaTransferPdfRows(items), [
    bca.split("\n").find((l) => l.startsWith("BCA_TRANSFER "))!,
  ]);
  assert.deepEqual(buildBcaTransferPdfRows(items, 2), []);
  assert.deepEqual(
    buildBcaTransferPdfRows([...items, item("11/04/2025", 47, 621)]),
    [],
    "Multiple transfer rows require their own reviewed layout",
  );
  const { prisma: db } = await import("../lib/prisma");
  const { processImportFileText, confirmImportFile } = await import(
    "../workers/import-processor"
  );
  const { loadImportStatusSnapshot } = await import(
    "../lib/import-status-snapshot"
  );
  const { processLearningJob } = await import("../lib/learning-jobs");
  const { AI_CONSENT_VERSION } = await import("../../shared/ai-consent");
  const { resolveImportFileExtractionCacheVersion } = await import(
    "../lib/data-engine"
  );
  assert.equal(
    resolveImportFileExtractionCacheVersion("CIMBConsoStatement.pdf"),
    "v41-cimb-consolidated",
  );
  assert.equal(
    resolveImportFileExtractionCacheVersion("bukti-trf.pdf"),
    "v41-bca-transfer-proof",
  );
  assert.equal(resolveImportFileExtractionCacheVersion("retained.pdf"), "v39");
  assert.equal(
    resolveImportFileExtractionCacheVersion("GCash-Bills-Pay-Receipt.pdf"),
    "v40-gcash-bills-receipt",
  );
  const user = await db.user.create({
    data: {
      clerkUserId: randomUUID(),
      email: randomUUID() + "@example.invalid",
      environment: "staging",
      planTier: "pro",
      planTierLocked: true,
      appPreferences: {
        aiConsent: {
          version: AI_CONSENT_VERSION,
          grantedAt: new Date().toISOString(),
          withdrawnAt: null,
        },
      },
    },
  });
  try {
    const workspace = await db.workspace.create({
      data: { userId: user.id, name: "Batch two isolated regression" },
    });
    const settle = async () => {
      await drain();
      for (const j of await db.learningJob.findMany({
        where: { workspaceId: workspace.id, status: "queued" },
      }))
        await processLearningJob(j.id);
    };
    for (const [name, text, count, parsedCount] of [
      ["CIMBConsoStatement.pdf", cimb, 4, 5],
      ["bukti-trf.pdf", bca, 2, 2],
    ] as const) {
      const file = await db.importFile.create({
        data: {
          workspaceId: workspace.id,
          fileName: name,
          fileType: "application/pdf",
          storageKey: "qa/" + randomUUID(),
        },
      });
      await processImportFileText(file.id, {
        text,
        importMode: "statement",
        actorUserId: user.clerkUserId,
      });
      await settle();
      const rows = await db.transaction.findMany({
        where: { importFileId: file.id },
        include: { account: true, category: true },
      });
      assert.equal(rows.length, count);
      assert.equal(
        await db.parsedTransaction.count({ where: { importFileId: file.id } }),
        parsedCount,
      );
      if (name.startsWith("CIMB")) {
        assert(
          rows.every(
            (r) =>
              r.currency === "PHP" &&
              r.account!.accountNumber === "00000123456789",
          ),
        );
        assert.equal(
          rows.filter((r) => Number(r.amount) === 1 && r.type === "income")
            .length,
          2,
        );
        assert(!rows.some((r) => /Closing Balance/i.test(r.merchantRaw ?? "")));
        assert.equal(
          String(
            (
              await db.account.findFirstOrThrow({
                where: {
                  workspaceId: workspace.id,
                  accountNumber: "00000123450000",
                },
              })
            ).balance,
          ),
          "0",
        );
        assert.equal(String(rows[0].account!.balance), "121");
      } else {
        assert(
          rows.every(
            (r) =>
              r.currency === "IDR" &&
              r.account!.accountNumber === "001-1234567",
          ),
        );
        assert.deepEqual(
          rows.map((r) => Number(r.amount)).sort((a, b) => a - b),
          [2, 30],
        );
        assert(rows.every((r) => r.type === "expense"));
        assert.equal(
          rows.find((r) => Number(r.amount) === 30)?.category?.name,
          "Transfers",
        );
        assert.equal(
          rows.find((r) => Number(r.amount) === 2)?.category?.name,
          "Financial",
        );
        assert(
          rows.every(
            (r) => r.date.toISOString() === "2025-04-10T12:00:00.000Z",
          ),
        );
        assert(!rows.some((r) => /EXAMPLE HOLDING/.test(r.merchantRaw ?? "")));
      }
      const checkpoint = await db.accountStatementCheckpoint.findUniqueOrThrow({
        where: { importFileId: file.id },
      });
      const status = await loadImportStatusSnapshot(file.id);
      assert(status?.settledImportComplete);
      assert.deepEqual(
        await db.accountStatementCheckpoint.findUniqueOrThrow({
          where: { importFileId: file.id },
        }),
        checkpoint,
        "First settled read must leave the checkpoint unchanged",
      );
      await loadImportStatusSnapshot(file.id);
      assert.deepEqual(
        await db.accountStatementCheckpoint.findUniqueOrThrow({
          where: { importFileId: file.id },
        }),
        checkpoint,
      );
      const knowledge = async () =>
        JSON.stringify({
          rows: await db.transaction.findMany({
            where: { workspaceId: workspace.id },
            orderBy: { id: "asc" },
          }),
          accounts: await db.account.findMany({
            where: { workspaceId: workspace.id },
            orderBy: { id: "asc" },
          }),
          signals: await db.trainingSignal.findMany({
            where: { workspaceId: workspace.id },
            orderBy: { id: "asc" },
          }),
          rules: await db.merchantRule.findMany({
            where: { workspaceId: workspace.id },
            orderBy: { id: "asc" },
          }),
          templates: await db.statementTemplate.findMany({
            where: { workspaceId: workspace.id },
            orderBy: { id: "asc" },
          }),
          jobs: await db.learningJob.findMany({
            where: { workspaceId: workspace.id },
            orderBy: { id: "asc" },
          }),
        });
      const before = await knowledge();
      await confirmImportFile(file.id);
      await settle();
      const after = await knowledge();
      if (after !== before) {
        const a = JSON.parse(after),
          b = JSON.parse(before);
        console.log(
          JSON.stringify({
            changed: Object.keys(b).flatMap((table) =>
              b[table].flatMap((r: any) => {
                const current = a[table].find((x: any) => x.id === r.id);
                return Object.keys(r)
                  .filter(
                    (k) =>
                      JSON.stringify(r[k]) !== JSON.stringify(current?.[k]),
                  )
                  .map((key) => ({
                    table,
                    id: r.id,
                    key,
                    before: r[key],
                    after: current?.[key],
                  }));
              }),
            ),
          }),
        );
      }
      assert.equal(
        after,
        before,
        "Confirmed financial/learning rows and timestamps survive retry",
      );
    }
    const badFile = await db.importFile.create({
      data: {
        workspaceId: workspace.id,
        fileName: "bukti-trf-partial.pdf",
        fileType: "application/pdf",
        storageKey: "qa/" + randomUUID(),
      },
    });
    const beforeUnsafe = await db.transaction.count({
      where: { workspaceId: workspace.id },
    });
    const beforeUnsafeJobs = await db.learningJob.count({
      where: { workspaceId: workspace.id },
    });
    await assert.rejects(
      () =>
        processImportFileText(badFile.id, {
          text: bca.replace("BCA_NATIVE_PAGES 1", "BCA_NATIVE_PAGES 2"),
          importMode: "statement",
          actorUserId: user.clerkUserId,
        }),
      /complete statement or native bank proof/,
    );
    await settle();
    assert.equal(
      await db.transaction.count({ where: { workspaceId: workspace.id } }),
      beforeUnsafe,
    );
    assert.equal(
      await db.learningJob.count({ where: { workspaceId: workspace.id } }),
      beforeUnsafeJobs,
    );
    const jobs = await db.learningJob.findMany({
      where: { workspaceId: workspace.id },
    });
    assert.equal(jobs.length, 4);
    assert(jobs.every((j) => j.status === "completed"));
    // Confirmed user edits and current balances are not a source-refresh target.
    for (const account of await db.account.findMany({
      where: { workspaceId: workspace.id, type: "bank" },
    }))
      await db.account.update({
        where: { id: account.id },
        data: {
          name: "User " + account.name,
          nameCustomized: true,
          institution: "User bank label",
          institutionCustomized: true,
          balance: String(Number(account.balance ?? 0) + 50),
        },
      });
    const edited = await db.transaction.findFirstOrThrow({
      where: { workspaceId: workspace.id },
    });
    await db.transaction.update({
      where: { id: edited.id },
      data: {
        amount: "42.25",
        description: "Confirmed correction",
        merchantClean: "User title",
        reviewStatus: "edited",
        isExcluded: true,
      },
    });
    const financial = async () =>
      JSON.stringify({
        accounts: await db.account.findMany({
          where: { workspaceId: workspace.id },
          orderBy: { id: "asc" },
        }),
        transactions: await db.transaction.findMany({
          where: { workspaceId: workspace.id },
          orderBy: { id: "asc" },
        }),
      });
    const protectedBefore = await financial();
    for (const file of await db.importFile.findMany({
      where: { workspaceId: workspace.id, id: { not: badFile.id } },
    })) {
      await confirmImportFile(file.id);
      await settle();
    }
    assert.equal(
      await financial(),
      protectedBefore,
      "Confirmed edits, custom identity, current balances and currencies survive historical confirmation",
    );
    assert.equal(network, 0);
  } finally {
    await drain();
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
  console.log(
    "Batch two: separate zero snapshots, repeated movements, strict BCA columns, source roles, no-op reads/retry and durable learning passed.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
