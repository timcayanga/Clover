import JSZip from "jszip";
import { prisma } from "./prisma";
import { DEFAULT_CATEGORY_ROWS } from "./default-categories";
import { recordTrainingSignal, upsertAccountRule } from "./data-engine";

// This path is intentionally separate from public import validation.
// Clover users can upload only PDF/CSV, while admins can feed labeled image corpora here for OCR learning.
type LabeledTransaction = {
  date?: string | null;
  time?: string | null;
  merchant?: string | null;
  raw_name?: string | null;
  normalized_name?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  transaction_type?: "income" | "expense" | "transfer" | null;
  movement_type?: string | null;
  category?: string | null;
  account_type?: string | null;
  review_required?: boolean | null;
  confidence?: number | null;
  notes?: string | null;
};

export type LabeledCorpusFile = {
  file_name?: string | null;
  import_mode?: "statement" | "receipt" | "notes" | "portfolio" | "account_detail" | null;
  document_type?: "statement" | "receipt" | "notes" | "portfolio" | "account_detail" | null;
  payment_channel?: string | null;
  split_context?: string | null;
  review_required?: boolean | null;
  receipt_account_match_status?: "clear" | "maybe" | "none" | null;
  receipt_account_match?: {
    account_name?: string | null;
    account_last4?: string | null;
    confidence?: number | null;
    reason?: string | null;
  } | null;
  source_summary?: string | null;
  transactions?: LabeledTransaction[];
  line_items?: Array<Record<string, unknown>>;
  participants?: Array<Record<string, unknown>>;
  split_rows?: Array<Record<string, unknown>>;
  flags?: string[];
};

type CorpusSummary = {
  files: number;
  transactions: number;
  signalsCreated: number;
  accountRulesCreated: number;
  skipped: number;
  byDocumentType: Record<string, number>;
  byPaymentChannel: Record<string, number>;
  byMode: Record<string, number>;
};

const ensureWorkspaceCategories = async (workspaceId: string) => {
  const existing = await prisma.category.findMany({
    where: { workspaceId },
    select: { name: true },
  });

  const byName = new Set(existing.map((category) => category.name.toLowerCase()));
  const toCreate = DEFAULT_CATEGORY_ROWS.filter((category) => !byName.has(category.name.toLowerCase())).map((category) => ({
    workspaceId,
    name: category.name,
    type: category.type,
    isSystem: true,
  }));

  if (toCreate.length > 0) {
    await prisma.category.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
  }
};

const findCategory = async (workspaceId: string, categoryName: string | null | undefined) => {
  const normalized = typeof categoryName === "string" ? categoryName.trim() : "";
  if (!normalized) {
    return null;
  }

  return await prisma.category.findFirst({
    where: {
      workspaceId,
      name: {
        equals: normalized,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
    },
  });
};

const inferAccountType = (paymentChannel: string | null | undefined) => {
  const normalized = String(paymentChannel ?? "").toLowerCase();
  if (normalized === "gcash" || normalized === "maya") {
    return "wallet" as const;
  }

  if (normalized === "credit_card") {
    return "credit_card" as const;
  }

  if (normalized === "cash") {
    return "cash" as const;
  }

  if (normalized === "instapay" || normalized === "bank_transfer") {
    return "bank" as const;
  }

  return "other" as const;
};

const readZipJsonEntries = async (zipData: ArrayBuffer | Uint8Array | Buffer) => {
  const zip = await JSZip.loadAsync(zipData);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.endsWith(".json") && !entry.name.endsWith("manifest.json"));
  const files: Array<{ name: string; data: LabeledCorpusFile }> = [];

  for (const entry of entries) {
    const text = await entry.async("string");
    files.push({
      name: entry.name,
      data: JSON.parse(text) as LabeledCorpusFile,
    });
  }

  return files;
};

export const processImageLabelCorpusZip = async (params: {
  zipData: ArrayBuffer | Uint8Array | Buffer;
  workspaceId: string;
  dryRun?: boolean;
}) => {
  if (!params.dryRun) {
    await ensureWorkspaceCategories(params.workspaceId);
  }

  const entries = await readZipJsonEntries(params.zipData);
  const summary: CorpusSummary = {
    files: 0,
    transactions: 0,
    signalsCreated: 0,
    accountRulesCreated: 0,
    skipped: 0,
    byDocumentType: {},
    byPaymentChannel: {},
    byMode: {},
  };

  for (const entry of entries) {
    const labeled = entry.data;
    summary.files += 1;

    const importMode = labeled.import_mode ?? "receipt";
    const documentType = labeled.document_type ?? "receipt";
    summary.byMode[importMode] = (summary.byMode[importMode] ?? 0) + 1;
    summary.byDocumentType[documentType] = (summary.byDocumentType[documentType] ?? 0) + 1;
    if (labeled.payment_channel) {
      summary.byPaymentChannel[labeled.payment_channel] = (summary.byPaymentChannel[labeled.payment_channel] ?? 0) + 1;
    }

    const transactions = Array.isArray(labeled.transactions) ? labeled.transactions : [];
    if (transactions.length === 0) {
      summary.skipped += 1;
      continue;
    }

    for (const transaction of transactions) {
      const merchantText =
        transaction.merchant?.trim() ||
        transaction.raw_name?.trim() ||
        transaction.normalized_name?.trim() ||
        labeled.source_summary?.trim() ||
        labeled.file_name?.trim() ||
        "Unknown merchant";

      const category = params.dryRun ? { id: "dry-run", name: transaction.category ?? "Other" } : await findCategory(params.workspaceId, transaction.category ?? null);
      if (!category) {
        summary.skipped += 1;
        continue;
      }

      if (params.dryRun) {
        summary.transactions += 1;
        summary.signalsCreated += 1;
        continue;
      }

      await recordTrainingSignal({
        workspaceId: params.workspaceId,
        merchantText,
        normalizedName: transaction.normalized_name?.trim() || undefined,
        categoryId: category.id,
        categoryName: category.name,
        type: transaction.transaction_type === "income" || transaction.transaction_type === "transfer" ? transaction.transaction_type : "expense",
        source: "training_upload",
        confidence: Math.max(0, Math.min(100, Math.round(transaction.confidence ?? 90))),
        notes:
          transaction.notes?.trim() ||
          labeled.source_summary?.trim() ||
          `Imported from ${entry.name}`,
      });

      summary.transactions += 1;
      summary.signalsCreated += 1;
    }

    const matchStatus = labeled.receipt_account_match_status ?? "none";
    const accountMatch = labeled.receipt_account_match ?? null;
    if (!params.dryRun && (matchStatus === "clear" || matchStatus === "maybe") && accountMatch?.account_name) {
      await upsertAccountRule({
        workspaceId: params.workspaceId,
        accountName: accountMatch.account_name,
        institution: null,
        accountType: inferAccountType(labeled.payment_channel),
        source: "training_upload",
        confidence: Math.max(0, Math.min(100, Math.round(accountMatch.confidence ?? 75))),
      });
      summary.accountRulesCreated += 1;
    }
  }

  return summary;
};
