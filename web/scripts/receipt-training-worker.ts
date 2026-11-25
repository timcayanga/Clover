import { correctionMatch } from "../../shared/category-correction";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { basename, join, extname } from "node:path";
import { AI_CONSENT_VERSION } from "../../shared/ai-consent";

const [batch, output] = process.argv.slice(2);
const expected =
  "postgresql://clover_qa@127.0.0.1:" +
  process.env.CLOVER_QA_PARSER_PORT +
  "/clover_migration_qa";
assert(
  process.env.NODE_ENV === "test" &&
    process.env.DATABASE_URL === expected &&
    process.env.DIRECT_URL === expected,
);
const require = createRequire(import.meta.url);
const read = (name: string) =>
  JSON.parse(readFileSync(join(batch, name), "utf8"));
const save = (name: string, value: unknown) =>
  writeFileSync(join(output, name), JSON.stringify(value, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
type Label = {
  key: string;
  sha256: string;
  merchant: string;
  date: string;
  amount: string;
  currency: string;
  category: string;
  payment: string;
};
type Source = { key: string; sha256: string; path: string };
const labels: Label[] = read("reviewed.json");
const sources = new Map<string, Source>(
  (read("receipt-sources.json") as Source[]).map((s) => [s.key, s]),
);
assert(
  labels.length && new Set(labels.map((l) => l.sha256)).size === labels.length,
  "Expected distinct reviewed sources",
);
mkdirSync(output, { mode: 0o700 });
const tasks: (() => Promise<void>)[] = [];
require("next/cache").revalidateTag = () => {};
require("next/server").after = (task: () => Promise<void>) => tasks.push(task);
globalThis.fetch = async () => {
  throw Error("External requests disabled for local training");
};
const drain = async () => {
  while (tasks.length) await tasks.shift()!();
};

async function main() {
  const { prisma: db } = await import("../lib/prisma");
  const {
    learningVerificationManifest,
    learningVerificationOwnCompleteManifest,
  } = await import("../lib/staging-learning-verification");
  const { loadReceiptDraft, saveReceiptDraft } =
    await import("../lib/receipt-draft");
  const { processLearningJob, retryLearningJob } = await import("../lib/learning-jobs");
  try {
    const user = await db.user.create({
      data: {
        clerkUserId: randomUUID(),
        email: "training@example.invalid",
        planTier: "pro",
        planTierLocked: true,
        environment: "staging",
        appPreferences: {
          aiConsent: {
            version: AI_CONSENT_VERSION,
            grantedAt: new Date().toISOString(),
            withdrawnAt: null,
          },
        },
      },
    });
    const workspace = await db.workspace.create({
      data: { userId: user.id, name: "Disposable receipt training" },
    });
    const protectedSpace = await db.workspace.create({
      data: { userId: user.id, name: "Confirmed reference records" },
    });
    const account = await db.account.create({
      data: {
        workspaceId: protectedSpace.id,
        name: "Reference cash",
        type: "cash",
        currency: "PHP",
      },
    });
    await db.transaction.create({
      data: {
        workspaceId: protectedSpace.id,
        accountId: account.id,
        merchantRaw: "Reference purchase",
        merchantClean: "Reviewed reference purchase",
        date: new Date("2026-01-01"),
        type: "expense",
        currency: "PHP",
        amount: "35.55",
        reviewStatus: "confirmed",
      },
    });
    const auth = require.resolve("../lib/auth");
    require.cache[auth] = {
      id: auth,
      filename: auth,
      loaded: true,
      exports: {
        isLocalDevHost: async () => false,
        requireAuth: async () => ({ userId: user.clerkUserId }),
      },
    } as NodeModule;
    const { POST } =
      await import("../app/api/imports/[importId]/process/route");
    const { PATCH } =
      await import("../app/api/transactions/[transactionId]/route");
    const accounts = new Map<string, string>(),
      categories = new Map<string, string>();
    for (const l of labels) {
      if (!categories.has(l.category))
        categories.set(
          l.category,
          (
            await db.category.create({
              data: {
                workspaceId: workspace.id,
                name: l.category,
                type: "expense",
              },
            })
          ).id,
        );
      if (!accounts.has(l.currency))
        accounts.set(
          l.currency,
          (
            await db.account.create({
              data: {
                workspaceId: workspace.id,
                type: "cash",
                currency: l.currency,
                name: "Cash (" + l.currency + ")",
              },
            })
          ).id,
        );
    }
    const before = await learningVerificationManifest(workspace.id);
    save("before.json", before);
    const confirmed = [],
      held = [];
    for (const l of labels) {
      assert(/^[\w.-]+$/.test(l.key) && l.key !== "." && l.key !== "..");
      const source = sources.get(l.key);
      assert(source && source.sha256 === l.sha256);
      const bytes = readFileSync(source.path);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), l.sha256);
      const type: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".pdf": "application/pdf",
        ".webp": "image/webp",
      };
      const mime = type[extname(source.path).toLowerCase()];
      assert(mime, "Unsupported receipt format");
      const form = new FormData();
      form.set(
        "file",
        new File([new Uint8Array(bytes)], basename(source.path), {
          type: mime,
        }),
      );
      for (const [k, v] of Object.entries({
        workspaceId: workspace.id,
        trainingMode: "generic_parser",
        importMode: "receipt",
        forceInlineProcessing: "true",
      }))
        form.set(k, v);
      const evidence = join("selected-vision", l.key + ".json");
      if (existsSync(join(batch, evidence)))
        form.set("deviceText", JSON.stringify(read(evidence)));
      const importId = randomUUID();
      const origin = "http://localhost";
      const result = await POST(
        new Request(origin + "/api/imports/" + importId + "/process", {
          method: "POST",
          headers: { Origin: origin },
          body: form,
        }),
        { params: Promise.resolve({ importId }) },
      );
      if (result.status === 422) {
        const rejection = await result.json();
        await drain();
        assert.equal(
          await db.transaction.count({ where: { importFileId: importId } }),
          0,
        );
        held.push({
          key: l.key,
          sha256: l.sha256,
          importId,
          reason: rejection.error,
          code: rejection.code,
        });
        continue;
      }
      assert(
        result.ok,
        "Import " +
          l.key +
          " failed (" +
          result.status +
          "): " +
          (await result.text()).slice(0, 280),
      );
      await drain();
      const draft = await loadReceiptDraft(importId, workspace.id);
      const categoryId = categories.get(l.category)!;
      const fields = {
        merchant: l.merchant,
        date: l.date,
        amount: l.amount,
        currency: l.currency,
        accountId: accounts.get(l.currency)!,
        categoryId: "",
      };
      const matched =
        Number(draft.fields.amount) === Number(l.amount) &&
        draft.fields.currency === l.currency &&
        draft.fields.date === l.date &&
        draft.fields.merchant.trim().toLowerCase() ===
          l.merchant.trim().toLowerCase();
      // Reviewed labels may correct an editable draft. Preserve already saved mismatches.
      if (
        l.payment.toLowerCase() !== "cash" ||
        (!draft.canEdit && !draft.transactionId) ||
        (draft.transactionId && !matched)
      ) {
        held.push({ key: l.key, sha256: l.sha256, fields: draft.fields });
        continue;
      }
      const saved = await saveReceiptDraft(
        importId,
        workspace.id,
        user.clerkUserId,
        fields,
        true,
      );
      assert(saved.transactionId);
      const savedTransaction = await db.transaction.findUniqueOrThrow({
        where: { id: saved.transactionId },
      });
      // An already-correct category or an ambiguous merchant cannot teach a new
      // merchant-wide rule. Confirm the reviewed category on that receipt alone.
      const scope = savedTransaction.categoryId !== categoryId &&
        savedTransaction.type === "expense" && correctionMatch(savedTransaction)
        ? "similar" : "transaction";
      const reply = await PATCH(
        new Request(origin + "/api/transactions/" + saved.transactionId, {
          method: "PATCH",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId,
            categoryCorrectionScope: scope,
            reviewStatus: "confirmed",
          }),
        }),
        { params: Promise.resolve({ transactionId: saved.transactionId }) },
      );
      assert(
        reply.ok,
        "Category learning failed: " + (await reply.text()).slice(0, 200),
      );
      await drain();
      const tx = await db.transaction.findUniqueOrThrow({
        where: { id: saved.transactionId },
      });
      assert(
        tx.amount.abs().eq(l.amount) &&
          tx.currency === l.currency &&
          tx.categoryId === categoryId &&
          tx.accountId === fields.accountId,
      );
      confirmed.push({
        key: l.key,
        sha256: l.sha256,
        importId,
        transactionId: tx.id,
        fields,
        correctionScope: scope,
        firstPassMatched: matched,
        original: draft.fields,
      });
    }
    await drain();
    for (const job of await db.learningJob.findMany({
      where: { workspaceId: workspace.id, status: "queued" },
    }))
      await processLearningJob(job.id);
    await drain();
    // The upload may have deferred template learning while the receipt was
    // awaiting review. Only resume a waiting job for a source this run confirmed.
    const confirmedSourceIds = confirmed.map(row => row.importId);
    const waiting = await db.learningJob.findMany({
      where: { workspaceId: workspace.id, status: "queued", errorCode: "SOURCE_NOT_READY",
        sourceId: { in: confirmedSourceIds } },
      select: { id: true },
    });
    for (const job of waiting) await retryLearningJob(job.id, workspace.id);
    await drain();
    save("learning-jobs.json", await db.learningJob.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, source: true, sourceId: true, status: true, nextIndex: true,
        totalItems: true, appliedItems: true, skippedItems: true, errorCode: true, errorMessage: true },
    }));
    save("learned-templates.json", await db.statementTemplate.findMany({
      where: { workspaceId: workspace.id }, orderBy: { fingerprint: "asc" },
    }));
    const own = await learningVerificationOwnCompleteManifest(workspace.id);
    for (const row of confirmed) {
      const replay = await saveReceiptDraft(
        row.importId,
        workspace.id,
        user.clerkUserId,
        row.fields,
        true,
      );
      assert(replay.duplicate && replay.transactionId === row.transactionId);
      assert.equal(
        await db.transaction.count({ where: { importFileId: row.importId } }),
        1,
      );
    }
    assert.deepEqual(
      await learningVerificationOwnCompleteManifest(workspace.id),
      own,
    );
    const after = await learningVerificationManifest(workspace.id);
    assert.deepEqual(after, before, "Protected records changed");
    save("after.json", after);
    save(
      "learned-rules.json",
      await db.merchantRule.findMany({
        where: { workspaceId: workspace.id },
        select: {
          merchantKey: true,
          normalizedName: true,
          categoryName: true,
          status: true,
          source: true,
          version: true,
        },
        orderBy: { merchantKey: "asc" },
      }),
    );
    save("result.json", {
      reviewed: labels.length,
      confirmed,
      held,
      replay: own,
      learning: await db.learningJob.groupBy({
        by: ["status"],
        where: { workspaceId: workspace.id },
        _count: true,
      }),
    });
    console.log("Disposable training verified", {
      confirmed: confirmed.length,
      held: held.length,
      protectedTables: Object.keys(before).length,
    });
  } finally {
    await db.$disconnect();
  }
}
main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
