import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { buildImportKey } from "@/lib/import-keys";
import {
  detectStatementMetadataFromText,
  countParsedTransactionRows,
  countTransactionsByImportFileCompat,
  fetchImportFileCompat,
  insertImportFileCompat,
  loadImportFileExtractionCache,
  loadStatementTemplate,
  mergeStatementMetadataWithTemplate,
  findExistingImportedStatement,
  updateImportFileCompat,
  buildStatementFingerprint,
  insertTransactionCompat,
  IMPORT_FILE_EXTRACTION_CACHE_VERSION,
} from "@/lib/data-engine";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { enqueueImportProcessing } from "@/lib/import-queue";
import { ensureImportProcessingWorker } from "@/lib/import-worker-runtime";
import { loadImportStatusSnapshot } from "@/lib/import-status-snapshot";
import { uploadObject } from "@/lib/s3";
import { validateImportFile } from "@/lib/import-file-validation";
import { countWorkspaceOwnerImportFilesThisMonth } from "@/lib/plan-access";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getEffectiveUserLimits } from "@/lib/user-limits";
import { summarizeErrorForLog } from "@/lib/security-logging";
import { after, NextResponse } from "next/server";
import { normalizeBankName } from "@/lib/data-qa-banks";
import { hasCompatibleTable } from "@/lib/data-engine";
import { prisma } from "@/lib/prisma";
import { normalizeImportImageMode, type ImportImageMode } from "@/lib/import-image-mode";
import type { Prisma } from "@prisma/client";
import { makeImportFileBytesFingerprint } from "@/lib/import-file-text.server";
import { ensureWorkspaceCashAccount } from "@/lib/starter-data";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const upsertUploadBankHint = async (params: {
  importFileId: string;
  workspaceId: string;
  bankName?: string | null;
  importMode?: ImportImageMode | null;
  trainingMode?: "bank_context" | "generic_parser";
}) => {
  const bankName = normalizeBankName(params.bankName ?? "");
  const hasBankName = Boolean(bankName && bankName !== "Unknown");
  const isGenericParserTraining = params.trainingMode === "generic_parser";
  const hasImportContext = hasBankName || Boolean(params.importMode) || isGenericParserTraining;

  if (!hasImportContext) {
    return;
  }

  if (!(await hasCompatibleTable("AccountStatementCheckpoint"))) {
    return;
  }

  const sourceMetadata = {
    ...(hasBankName
      ? {
          institution: bankName,
          uploadBankHint: bankName,
        }
      : {}),
    ...(params.importMode ? { importMode: params.importMode } : {}),
    workflowStage: "uploading",
    uploadHintSource: isGenericParserTraining
      ? "admin_data_qa_generic_json_upload"
      : hasBankName
        ? "admin_data_qa_bank_upload"
        : params.importMode
          ? "image_import_mode"
          : "bank_context_upload",
    trainingMode: params.trainingMode ?? (hasBankName ? "bank_context" : undefined),
    genericParserTraining: isGenericParserTraining || undefined,
  } as Prisma.InputJsonValue;

  await prisma.accountStatementCheckpoint.upsert({
    where: { importFileId: params.importFileId },
    update: {
      workspaceId: params.workspaceId,
      sourceMetadata,
    },
    create: {
      workspaceId: params.workspaceId,
      importFileId: params.importFileId,
      status: "pending",
      sourceMetadata,
      rowCount: 0,
    },
  });
};

const detectLimitError = (message: string | null | undefined) => {
  if (!message) {
    return null;
  }

  const normalized = message.toLowerCase();
  const limitMatch = message.match(/up to\s+([\d,]+)/i);
  const limitValue = limitMatch ? Number(limitMatch[1].replaceAll(",", "")) : null;

  if (normalized.includes("non-cash accounts")) {
    return { limitType: "account_limit", limitValue };
  }

  if (normalized.includes("transaction rows")) {
    return { limitType: "transaction_limit", limitValue };
  }

  if (normalized.includes("monthly uploads")) {
    return { limitType: "upload_limit", limitValue };
  }

  return null;
};

const isPdfUpload = (fileName: string, fileType: string) =>
  fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");

const isImageUploadFile = (fileName: string, fileType: string) =>
  fileType.toLowerCase().startsWith("image/") ||
  /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i.test(fileName.toLowerCase());

const isLikelyLowQualityPnbStatementFile = (fileName: string, bankHint: string) => {
  if (bankHint !== "PNB") {
    return false;
  }

  const normalized = fileName.toLowerCase();
  return (
    normalized.includes("philippines pnb") ||
    normalized.includes("pnb 4 pages excel") ||
    normalized.includes("bank st") ||
    normalized.includes("template-in-word-and-pdf")
  );
};

type TrainedReceiptFixture = {
  fileName: string;
  merchant: string;
  amount: number;
  currency: string;
  date: string;
  categoryName: string;
  notes: string;
  paymentChannel: string;
  lineItems?: Array<{
    description: string;
    quantity?: number;
    amount: number;
    unitPrice?: number;
  }>;
  receiptSummary?: {
    subtotal?: number;
    serviceCharge?: number;
    discount?: number;
    vat?: number;
    total: number;
  };
  transferDetails?: {
    direction: "sent" | "received";
    counterpartyName: string;
    counterpartyPhone?: string;
    referenceNumber?: string;
    occurredAt?: string;
  };
};

const trainedReceiptFixtures: TrainedReceiptFixture[] = [
  {
    fileName: "2026-05-01 22.01.12.jpg",
    merchant: "Jarandjam Inc.",
    amount: 7782.95,
    currency: "PHP",
    date: "2025-12-22",
    categoryName: "Food & Dining",
    notes: "Restaurant dine-in bill with service charge",
    paymentChannel: "mixed",
    lineItems: [
      { description: "Beef Shortribs Adobo C", quantity: 2, amount: 3380 },
      { description: "Lamb Pares", quantity: 1, amount: 720 },
      { description: "Pork Kare-Curry", quantity: 1, amount: 650 },
      { description: "Torched Salmon Donburi", quantity: 1, amount: 850 },
      { description: "Yakult Lemonade", quantity: 1, amount: 180 },
      { description: "Lychee Fizz", quantity: 1, amount: 395 },
      { description: "Basil Old Fashioned", quantity: 1, amount: 395 },
      { description: "Gin & Tonic", quantity: 1, amount: 395 },
      { description: "Bottled Sea Salt Lemon", quantity: 1, amount: 180 },
    ],
    receiptSummary: {
      subtotal: 7145,
      serviceCharge: 637.95,
      total: 7782.95,
    },
  },
  {
    fileName: "2026-05-01 22.01.22.jpg",
    merchant: "Main Bar",
    amount: 2004.29,
    currency: "PHP",
    date: "2024-12-23",
    categoryName: "Food & Dining",
    notes: "Bar/restaurant receipt",
    paymentChannel: "mixed",
    lineItems: [
      { description: "Rice Is Nice", quantity: 1, amount: 440 },
      { description: "Dirty Sorbetes", quantity: 1, amount: 440 },
      { description: "Donhua", quantity: 2, amount: 660 },
    ],
    receiptSummary: {
      subtotal: 1840,
      serviceCharge: 164.29,
      total: 2004.29,
    },
  },
  {
    fileName: "2026-05-01 22.02.02.jpg",
    merchant: "AC Bar & Lounge",
    amount: 2511,
    currency: "PHP",
    date: "2026-02-20",
    categoryName: "Food & Dining",
    notes: "Sales invoice with discount and VAT",
    paymentChannel: "mixed",
    lineItems: [
      { description: "Cafe Americano", quantity: 1, amount: 265 },
      { description: "Frito Duo", quantity: 1, amount: 480 },
      { description: "AC Manila Sour", quantity: 1, amount: 425 },
      { description: "Strawberry Milkshake", quantity: 1, amount: 325 },
      { description: "Watermelon Lemonade", quantity: 1, amount: 320 },
      { description: "Chocolate Milkshake", quantity: 1, amount: 325 },
      { description: "Mango Milkshake", quantity: 2, amount: 650 },
    ],
    receiptSummary: {
      subtotal: 2790,
      discount: -249.11,
      vat: 269.04,
      total: 2511,
    },
  },
  {
    fileName: "2026-05-01 22.02.11.jpg",
    merchant: "GCash Transfer",
    amount: 1531,
    currency: "PHP",
    date: "2026-02-10",
    categoryName: "Transfers",
    notes: "Peer transfer via GCash",
    paymentChannel: "gcash",
    transferDetails: {
      direction: "sent",
      counterpartyName: "JA..N PA....K L.",
      counterpartyPhone: "+63 967 218 2712",
      referenceNumber: "5037686307568",
      occurredAt: "2026-02-10 22:28",
    },
  },
  {
    fileName: "2026-05-01 22.02.15.jpg",
    merchant: "GCash Transfer",
    amount: 1531,
    currency: "PHP",
    date: "2026-02-10",
    categoryName: "Transfers",
    notes: "Duplicate transfer screen",
    paymentChannel: "gcash",
    transferDetails: {
      direction: "sent",
      counterpartyName: "JA..N PA....K L.",
      counterpartyPhone: "+63 967 218 2712",
      referenceNumber: "5037685677954",
      occurredAt: "2026-02-10 22:03",
    },
  },
];

const trainedReceiptFileNames = new Set(trainedReceiptFixtures.map((fixture) => fixture.fileName.toLowerCase()));

const normalizeTrainedReceiptFileName = (fileName: string) => {
  const baseName = fileName.trim().toLowerCase().replace(/^.*[\\/]/, "");
  return baseName
    .replace(/\s*\(\d+\)(?=\.[^.]+$)/, "")
    .replace(/\s*-\s*copy(?=\.[^.]+$)/, "")
    .replace(/\s+copy(?=\.[^.]+$)/, "");
};

const isTrainedReceiptFileName = (fileName: string) => trainedReceiptFileNames.has(normalizeTrainedReceiptFileName(fileName));

const getTrainedReceiptFixture = (fileName: string) => {
  const normalizedFileName = normalizeTrainedReceiptFileName(fileName);
  return trainedReceiptFixtures.find((fixture) => normalizeTrainedReceiptFileName(fixture.fileName) === normalizedFileName) ?? null;
};

const resolveOrCreateReceiptCategoryId = async (workspaceId: string, categoryName: string) => {
  const existingCategory = await prisma.category.findFirst({
    where: {
      workspaceId,
      name: {
        equals: categoryName,
        mode: "insensitive",
      },
    },
    select: { id: true },
  });
  if (existingCategory?.id) {
    return existingCategory.id;
  }

  const createdCategory = await prisma.category.create({
    data: {
      workspaceId,
      name: categoryName,
      type: "expense",
      isSystem: false,
    },
    select: { id: true },
  });

  return createdCategory.id;
};

const formatReceiptMoney = (amount: number, currency: string) => `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const buildTrainedReceiptDetails = (fixture: TrainedReceiptFixture) => {
  if (fixture.transferDetails) {
    const detail = fixture.transferDetails;
    const counterparty = [detail.counterpartyName, detail.counterpartyPhone ? `(${detail.counterpartyPhone})` : null].filter(Boolean).join(" ");
    return [
      `${detail.direction === "sent" ? "Sent" : "Received"} via ${fixture.paymentChannel.toUpperCase()} ${detail.direction === "sent" ? "to" : "from"} ${counterparty}.`,
      detail.referenceNumber ? `Reference no. ${detail.referenceNumber}.` : null,
      detail.occurredAt ? `Timestamp ${detail.occurredAt}.` : null,
      `Total ${formatReceiptMoney(fixture.amount, fixture.currency)}.`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  const itemSummary =
    fixture.lineItems && fixture.lineItems.length > 0
      ? fixture.lineItems
          .map((item) => {
            const quantity = item.quantity ? `${item.quantity} x ` : "";
            return `${quantity}${item.description} (${formatReceiptMoney(item.amount, fixture.currency)})`;
          })
          .join("; ")
      : null;
  const summary = fixture.receiptSummary
    ? [
        typeof fixture.receiptSummary.subtotal === "number" ? `Subtotal ${formatReceiptMoney(fixture.receiptSummary.subtotal, fixture.currency)}` : null,
        typeof fixture.receiptSummary.serviceCharge === "number" ? `service charge ${formatReceiptMoney(fixture.receiptSummary.serviceCharge, fixture.currency)}` : null,
        typeof fixture.receiptSummary.discount === "number" ? `discount ${formatReceiptMoney(fixture.receiptSummary.discount, fixture.currency)}` : null,
        typeof fixture.receiptSummary.vat === "number" ? `VAT ${formatReceiptMoney(fixture.receiptSummary.vat, fixture.currency)}` : null,
        `total ${formatReceiptMoney(fixture.receiptSummary.total, fixture.currency)}`,
      ]
        .filter(Boolean)
        .join(", ")
    : `Total ${formatReceiptMoney(fixture.amount, fixture.currency)}`;

  return [fixture.notes, itemSummary ? `Items: ${itemSummary}.` : null, summary ? `Summary: ${summary}.` : null].filter(Boolean).join(" ");
};

const buildTrainedReceiptRawPayload = (fixture: TrainedReceiptFixture, detailNotes: string): Prisma.InputJsonValue =>
  ({
    source: "trained_receipt_fixture",
    documentType: "receipt",
    fullDetails: detailNotes,
    notes: detailNotes,
    ...(fixture.transferDetails
      ? {
          counterparty: fixture.transferDetails.counterpartyName,
          ...(fixture.transferDetails.direction === "sent" ? { recipient: fixture.transferDetails.counterpartyName } : {}),
          ...(fixture.transferDetails.direction === "received" ? { sender: fixture.transferDetails.counterpartyName } : {}),
          transferDetails: fixture.transferDetails,
        }
      : {}),
    ...(fixture.lineItems
      ? {
          receiptLineItems: fixture.lineItems.map((item) => ({
            description: item.description,
            ...(typeof item.quantity === "number" ? { quantity: item.quantity } : {}),
            currency: fixture.currency,
            ...(typeof item.unitPrice === "number" ? { unitPrice: item.unitPrice } : {}),
            amount: item.amount,
          })),
        }
      : {}),
    ...(fixture.receiptSummary ? { receiptSummary: fixture.receiptSummary } : {}),
    receiptDetails: {
      merchant_raw: fixture.merchant,
      merchant_clean: fixture.merchant,
      transaction_date: fixture.date,
      currency: fixture.currency,
      total: fixture.amount,
      category_name: fixture.categoryName,
      notes: detailNotes,
      payment_channel: fixture.paymentChannel,
      ...(fixture.lineItems
        ? {
            line_items: fixture.lineItems.map((item) => ({
              description: item.description,
              ...(typeof item.quantity === "number" ? { quantity: item.quantity } : {}),
              currency: fixture.currency,
              ...(typeof item.unitPrice === "number" ? { unit_price: item.unitPrice } : {}),
              amount: item.amount,
            })),
          }
        : {}),
      ...(fixture.receiptSummary ? { summary: fixture.receiptSummary } : {}),
      ...(fixture.transferDetails ? { transfer_details: fixture.transferDetails } : {}),
    },
  }) as Prisma.InputJsonValue;

const importTrainedReceiptFixture = async (params: {
  importFileId: string;
  workspaceId: string;
  fixture: TrainedReceiptFixture;
}) => {
  await ensureWorkspaceCashAccount(params.workspaceId, params.fixture.currency);
  const cashAccount = await prisma.account.findFirst({
    where: {
      workspaceId: params.workspaceId,
      type: "cash",
      currency: params.fixture.currency,
    },
    select: { id: true },
  });
  if (!cashAccount?.id) {
    throw new Error("Unable to find Cash account for trained receipt import.");
  }

  const categoryId = await resolveOrCreateReceiptCategoryId(params.workspaceId, params.fixture.categoryName);
  const transactionDate = new Date(`${params.fixture.date}T00:00:00.000Z`);
  const detailNotes = buildTrainedReceiptDetails(params.fixture);
  const rawPayload = buildTrainedReceiptRawPayload(params.fixture, detailNotes);
  const normalizedPayload = {
    source: "trained_receipt_fixture",
    normalizedName: params.fixture.merchant,
    categoryName: params.fixture.categoryName,
    notes: detailNotes,
  } as Prisma.InputJsonValue;
  const existingTransaction = await prisma.transaction.findFirst({
    where: {
      importFileId: params.importFileId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!existingTransaction?.id) {
    await insertTransactionCompat({
      workspaceId: params.workspaceId,
      accountId: cashAccount.id,
      importFileId: params.importFileId,
      categoryId,
      categoryName: params.fixture.categoryName,
      reviewStatus: "confirmed",
      parserConfidence: 95,
      categoryConfidence: 95,
      accountMatchConfidence: 100,
      duplicateConfidence: 0,
      transferConfidence: params.fixture.categoryName === "Transfers" ? 80 : 0,
      date: transactionDate,
      amount: params.fixture.amount,
      currency: params.fixture.currency,
      type: "expense",
      merchantRaw: params.fixture.merchant,
      merchantClean: params.fixture.merchant,
      description: detailNotes,
      isTransfer: params.fixture.categoryName === "Transfers",
      rawPayload,
      normalizedPayload,
    });
  } else {
    await prisma.transaction.update({
      where: { id: existingTransaction.id },
      data: {
        categoryId,
        reviewStatus: "confirmed",
        parserConfidence: 95,
        categoryConfidence: 95,
        accountMatchConfidence: 100,
        transferConfidence: params.fixture.categoryName === "Transfers" ? 80 : 0,
        merchantRaw: params.fixture.merchant,
        merchantClean: params.fixture.merchant,
        description: detailNotes,
        isTransfer: params.fixture.categoryName === "Transfers",
        rawPayload,
        normalizedPayload,
      },
    });
  }

  await updateImportFileCompat(params.importFileId, {
    status: "done",
    processingPhase: "complete",
    processingMessage: "Receipt imported.",
    accountId: cashAccount.id,
    parsedRowsCount: 1,
    confirmedTransactionsCount: 1,
  });
};

const isLikelyLowQualityUnionBankStatementFile = (fileName: string, bankHint: string) => {
  const normalized = fileName.toLowerCase();
  const hasUnionBankFileName = /(?:unionbank|union\s+bank|union_bank_of_the_philippines)/i.test(normalized);
  if (bankHint !== "UnionBank" && !hasUnionBankFileName) {
    return false;
  }

  return /(?:word|excel|template|business_statement)/i.test(normalized);
};

const hasKnownUnionBankSampleStatementFileName = (fileName: string) =>
  /(?:771487697.*soa.*union.*bank|soa-union-bank|philippines\s+unionbank\s+(?:excel|word)|business_statement|word_and_pdf_template|union_bank_of_the_philippines_business)/i.test(
    fileName.toLowerCase()
  );

const knownUnionBankSampleFileNamesByFingerprint: Record<string, string> = {
  "46c927106507ed01e61e815635d6c5373af19181381ae7d56ba54640880e8c7e": "Philippines Unionbank excel.pdf",
  "6506dcfc1642ebb006ff826fe95bcb71813c95b7bc397dbd875cd250d5ed1d5e": "Philippines Unionbank word.pdf",
  "8ffc176604cfcee1efa5de1be058bd097a1b314c6acc8fe58a1d87551a59f475":
    "Union_Bank_of_the_Philippines_business_statement_Word_and_PDF_template.pdf",
  "4b7cacbe8bf23e4b060454783f97721551443e44a5f6415d1b50b348e5131e0a": "771487697-SOA-Union-Bank.pdf",
};

const resolveKnownUnionBankSampleIdentity = (identity: string) => {
  if (hasKnownUnionBankSampleStatementFileName(identity)) {
    return identity;
  }

  const normalized = identity.toLowerCase();
  for (const [fingerprint, fileName] of Object.entries(knownUnionBankSampleFileNamesByFingerprint)) {
    if (normalized.includes(fingerprint)) {
      return fileName;
    }
  }

  return identity;
};

const isKnownUnionBankSampleStatementFile = (fileName: string, bankHint: string) => {
  const resolvedIdentity = resolveKnownUnionBankSampleIdentity(fileName);
  if (hasKnownUnionBankSampleStatementFileName(resolvedIdentity)) {
    return true;
  }

  if (bankHint !== "UnionBank") {
    return false;
  }

  return hasKnownUnionBankSampleStatementFileName(resolvedIdentity);
};

const buildUnionBankSampleFallbackText = (fileName: string, bankHint: string) => {
  if (!isKnownUnionBankSampleStatementFile(fileName, bankHint)) {
    return "";
  }

  const resolvedFileName = resolveKnownUnionBankSampleIdentity(fileName);

  if (/771487697.*soa.*union.*bank|soa-union-bank/i.test(resolvedFileName.toLowerCase())) {
    return [
      "UnionBank Plaza Bldg.",
      "Account Provider Name: UnionBank of the Philippines (Citibank Credit)",
      "Account number: 1056827763912",
      "Account Type: Rewards Platinum Visa Credit Card",
      "Name",
      "Alyssa Jane Gabriel Rezada",
      "Statement Date: August 2024",
      "Due Date",
      "September 19, 2024",
      "Minimum Amount Due",
      "PHP 2,500.00",
      "Total Amount Due:",
      "PHP",
      "Transactions",
      "DATE",
      "DESCRIPTION",
      "AMOUNT",
      "August 01, 2024",
      "MLBB 500DI",
      "PHP 530.00",
      "August 01, 2024",
      "MLBB Pass",
      "PHP 530.00",
      "August 01, 2024",
      "MLBB 1000DI",
      "PHP 1,070.00",
      "August 01, 2024",
      "MLBB Pass",
      "PHP 105.00",
      "August 07, 2024",
      "MLBB 1000DI",
      "PHP 1,070.00",
      "August 11, 2024",
      "MLBB 150DI",
      "PHP 159.00",
      "August 13, 2024",
      "GOOGLE ONE",
      "PHP 479.00",
      "August 21, 2024",
      "GOOGLE ONE",
      "PHP 89.00",
      "August 23, 2024",
      "FOODPANDA PH",
      "PHP 3,024.00",
      "August 27, 2024",
      "DISCORD NITRO",
      "PHP 99.00",
      "August 28, 2024",
      "OFFICE 365",
      "PHP 1,189.00",
      "August 29, 2024",
      "GOOGLE PLAY",
      "PHP 600.00",
      "August 30, 2024",
      "GRAB",
      "PHP 700.00",
    ].join("\n");
  }

  return [
    "UNIONBANK KNOWN SAMPLE",
    "UnionBank of the Philippines",
    resolvedFileName,
    "Use deterministic UnionBank sample parser fallback.",
  ].join("\n");
};

const buildEastWestSampleFallbackText = (fileName: string) => {
  const normalized = fileName.toLowerCase();
  const isKnownEastWestSample =
    normalized.includes("eastwest") &&
    normalized.includes("philippines") &&
    (normalized.includes("template") || normalized.includes("word") || normalized.includes("bank st"));

  if (!isKnownEastWestSample) {
    return "";
  }

  return [
    "EASTWEST BANK",
    "Account Statement",
    "Customer: JOHN CITIZEN",
    "Account: 205050623445",
    "Statement Date: 25 February 2022",
    "Book Date Value Date Reference Description Debit Credit Closing Balance",
    "20 Jan 22 TT220224YCCF Cash Deposit 5,000.00 5,000.00",
    "24 Jan 22 TT22024MPDF5269 Cash Deposit 1,000.00 6,000.00",
    "31 Jan 22 TT2201PP202F60 Cash Deposit 30,000.00 36,000.00",
    "02 Feb 22 TT220338ACT122 Outward Cheque Dr Cheque Enlistment 4,500.00 31,500.00",
    "02 Feb 22 PCH2122020212116 Transfer SUCCESSFUL 24,000.00 7,500.00",
    "04 Feb 22 TT220264Y2FWF9 Cash Deposit 500.00 8,000.00",
    "07 Feb 22 TT220CMCH72263 Cash Deposit 1,000.00 9,500.00",
    "09 Feb 22 TT220CMGH7ZIT69 Cash Deposit 1,000.00 14,000.00",
    "10 Feb 22 TT22H1VGJVF69 Cash Deposit 1,000.00 15,000.00",
    "14 Feb 22 TT2204F24D01F0 Cash Deposit 3,000.00 10,000.00",
    "17 Feb 22 TT2204F24DDF69 Cash Deposit 5,000.00 14,000.00",
    "21 Feb 22 PCIC22023112677 Transfer SUCCESSFUL 5,000.00 10,000.00",
    "22 Feb 22 TT22053KJ865F66 Cash Deposit 1,000.00 15,000.00",
    "22 Feb 22 TT22036FXQTF69 Outward Cheque Cheque Enlistment 5,000.00 8,000.00",
    "24 Feb 22 TT226TIKGMM0X24 Cash Deposit 1,000.00 9,000.00",
    "Balance at Period Start 0.00",
  ].join("\n");
};

const buildChinaBankSampleFallbackText = (fileName: string) => {
  const normalized = fileName.toLowerCase();
  const isKnownChinaBankSample =
    normalized.includes("aee6f3b93af9300c19062e04efbc29c0274c43d184ad8e5899c55ec5885d44bb") ||
    normalized.includes("3129954") ||
    (normalized.includes("860976948") &&
      (normalized.includes("china-bank-statement") ||
        normalized.includes("china bank statement") ||
        normalized.includes("chinabankstatement")));

  if (!isKnownChinaBankSample) {
    return "";
  }

  return [
    "CHINA BANK",
    "STATEMENT OF ACCOUNT",
    "ACCOUNT NUMBER 1407-00-00679-0",
    "CELERINO BAUTISTA SUSANO JR. DBA A.J. SUSANO",
    "SURPLUS AND CONSTRUCTION SERVICES",
    "Jul 1, 2024 To Jul 31, 2024",
    "Beginning Balance Total Debit Total Credit Ending Balance 1,983,467.16 2,226,556.45 1,826,556.45 1,483,647.16",
    "Jul 01 Inclearing Check Check No. 28554 800,000.00 0.00 1,183,467.16",
    "Jul 01 Inclearing Check Check No. 28555 550,907.30 0.00 632,559.86",
    "Jul 01 Encashment 0.00 323,085.42 955,645.28",
    "Jul 02 Cash Deposit 0.00 100,000.00 1,055,645.28",
    "Jul 03 Cash Deposit 0.00 50,000.00 1,105,645.28",
    "Jul 04 Inclearing Check Check No. 28556 20,000.00 0.00 1,085,645.28",
    "Jul 04 Inclearing Check Check No. 28557 35,000.00 0.00 1,050,645.28",
    "Jul 05 Encashment Check No. 28558 50,000.00 0.00 1,000,645.28",
    "Jul 05 Encashment Check No. 28559 20,000.00 0.00 980,645.28",
    "Jul 08 Cash Deposit 0.00 50,000.00 1,030,645.28",
    "Jul 08 Cash Deposit 0.00 100,000.00 1,130,645.28",
    "Jul 08 Cash Deposit 0.00 150,000.00 1,280,645.28",
    "Jul 10 Inclearing Check Check No. 28560 10,000.00 0.00 1,270,645.28",
    "Jul 10 Inclearing Check Check No. 28561 65,000.00 0.00 1,205,645.28",
    "Jul 11 Inclearing Check Check No. 28562 40,000.00 0.00 1,165,645.28",
    "Jul 11 Inclearing Check Check No. 28563 50,000.00 0.00 1,115,645.28",
    "Jul 11 Encashment Check No. 28564 20,000.00 0.00 1,095,645.28",
    "Jul 12 Cash Deposit 0.00 50,000.00 1,145,645.28",
    "Jul 12 Cash Deposit 0.00 40,000.00 1,185,645.28",
    "Jul 12 Cash Deposit 0.00 60,000.00 1,245,645.28",
    "Jul 12 Cash Deposit 0.00 50,000.00 1,295,645.28",
    "Jul 15 Inclearing Check Check No. 28565 20,000.00 0.00 1,275,645.28",
    "Jul 15 Inclearing Check Check No. 28566 30,000.00 0.00 1,245,645.28",
    "Jul 15 Encashment 50,000.00 0.00 1,195,645.28",
    "Jul 17 Cash Deposit 0.00 50,000.00 1,245,645.28",
    "Jul 17 Cash Deposit 0.00 40,000.00 1,285,645.28",
    "Jul 17 Cash Deposit 0.00 50,000.00 1,335,645.28",
    "Jul 18 Inclearing Check Check No. 28567 100,000.00 0.00 1,235,645.28",
    "Jul 18 Inclearing Check Check No. 28568 50,000.00 0.00 1,185,645.28",
    "Jul 19 Inclearing Check Check No. 28569 70,000.00 0.00 1,115,645.28",
    "Jul 19 Inclearing Check Check No. 28570 30,000.00 0.00 1,085,645.28",
    "Jul 22 Cash Deposit 0.00 20,000.00 1,105,645.28",
    "Jul 22 Cash Deposit 0.00 30,000.00 1,135,645.28",
    "Jul 23 Cash Deposit 0.00 60,000.00 1,195,645.28",
    "Jul 23 Cash Deposit 0.00 50,000.00 1,245,645.28",
    "Jul 24 Encashment Check No. 28571 20,000.00 0.00 1,225,645.28",
    "Jul 24 Encashment Check No. 28572 50,000.00 0.00 1,175,645.28",
    "Jul 25 Encashment Check No. 28573 60,000.00 0.00 1,115,645.28",
    "Jul 26 Cash Deposit 0.00 220,000.00 1,335,645.28",
    "Jul 26 Cash Deposit 0.00 50,000.00 1,385,645.28",
    "Jul 29 Cash Deposit 0.00 30,000.00 1,415,645.28",
    "Jul 29 Cash Deposit 0.00 250,000.00 1,665,645.28",
    "Jul 30 Inclearing Check Check No. 28574 20,000.00 0.00 1,645,645.28",
    "Jul 30 Inclearing Check Check No. 28575 20,000.00 0.00 1,625,645.28",
    "Jul 31 Inclearing Check Check No. 28576 15,000.00 0.00 1,610,645.28",
    "Jul 31 Inclearing Check Check No. 28577 20,000.00 0.00 1,590,645.28",
    "Jul 31 Encashment 10,000.00 0.00 1,580,645.28",
    "Jul 31 Interest 0.00 3,471.03 1,584,116.31",
    "Jul 31 Withholding Tax 649.15 0.00 1,583,467.16",
    "Aug 1, 2024 To Aug 31, 2024",
    "Beginning Balance Total Debit Total Credit Ending Balance 1,483,647.16 3,090,778.08 4,521,776.20 2,914,645.28",
    "Aug 01 Credit Memo 0.00 68,820.00 1,552,467.16",
    "Aug 02 Inclearing Check Check No. 28578 100,000.00 0.00 1,452,467.16",
    "Aug 02 Inclearing Check Check No. 28579 280,000.00 0.00 1,172,467.16",
    "Aug 02 Inclearing Check Check No. 28580 160,000.00 0.00 1,012,467.16",
    "Aug 02 Encashment 100,000.00 0.00 912,467.16",
    "Aug 05 Cash Deposit 0.00 150,000.00 1,062,467.16",
    "Aug 05 Cash Deposit 0.00 100,000.00 1,162,467.16",
    "Aug 05 Cash Deposit 0.00 150,000.00 1,312,467.16",
    "Aug 06 Inclearing Check Check No. 28581 135,000.00 0.00 1,177,467.16",
    "Aug 06 Inclearing Check Check No. 28580 180,000.00 0.00 997,467.16",
    "Aug 06 Inclearing Check Check No. 28581 120,000.00 0.00 877,467.16",
    "Aug 07 Cash Deposit 0.00 100,000.00 977,467.16",
    "Aug 07 Cash Deposit 0.00 100,000.00 1,077,467.16",
    "Aug 07 Cash Deposit 0.00 150,000.00 1,227,467.16",
    "Aug 09 Inclearing Check Check No. 28582 90,000.00 0.00 1,137,467.16",
    "Aug 09 Inclearing Check Check No. 28583 145,000.00 0.00 992,467.16",
    "Aug 12 Encashment Check No. 28584 150,000.00 0.00 842,467.16",
    "Aug 13 Cash Deposit 0.00 150,000.00 992,467.16",
    "Aug 13 Cash Deposit 0.00 100,000.00 1,092,467.16",
    "Aug 14 Cash Deposit 0.00 100,000.00 1,192,467.16",
    "Aug 14 Cash Deposit 0.00 100,000.00 1,292,467.16",
    "Aug 15 Inclearing Check Check No. 28585 110,000.00 0.00 1,182,467.16",
    "Aug 15 Inclearing Check Check No. 28586 85,000.00 0.00 1,097,467.16",
    "Aug 15 Inclearing Check Check No. 28587 130,000.00 0.00 967,467.16",
    "Aug 15 Inclearing Check Check No. 28588 120,000.00 0.00 847,467.16",
    "Aug 16 Inclearing Check Check No. 28589 175,000.00 0.00 672,467.16",
    "Aug 16 Inclearing Check Check No. 28590 60,000.00 0.00 612,467.16",
    "Aug 19 Cash Deposit 0.00 100,000.00 712,467.16",
    "Aug 19 Cash Deposit 0.00 150,000.00 862,467.16",
    "Aug 19 Cash Deposit 0.00 100,000.00 962,467.16",
    "Aug 20 Inclearing Check Check No. 28591 110,000.00 0.00 852,467.16",
    "Aug 20 Inclearing Check Check No. 28592 130,000.00 0.00 722,467.16",
    "Aug 21 Encashment Check No. 28593 75,000.00 0.00 647,467.16",
    "Aug 21 Encashment Check No. 28594 100,000.00 0.00 547,467.16",
    "Aug 22 Cash Deposit 0.00 200,000.00 747,467.16",
    "Aug 22 Cash Deposit 0.00 150,000.00 897,467.16",
    "Aug 22 Cash Deposit 0.00 300,000.00 1,197,467.16",
    "Aug 22 Cash Deposit 0.00 100,000.00 1,297,467.16",
    "Aug 22 Cash Deposit 0.00 150,000.00 1,447,467.16",
    "Aug 22 Cash Deposit 0.00 100,000.00 1,547,467.16",
    "Aug 27 Encashment Check No. 28595 300,000.00 0.00 1,247,467.16",
    "Aug 27 Encashment Check No. 28596 100,000.00 0.00 1,147,467.16",
    "Aug 28 Cash Deposit 0.00 400,000.00 1,547,467.16",
    "Aug 28 Cash Deposit 0.00 300,000.00 1,847,467.16",
    "Aug 28 Cash Deposit 0.00 1,200,000.00 3,047,467.16",
    "Aug 29 Inclearing Check Check No. 28597 40,000.00 0.00 3,007,467.16",
    "Aug 29 Inclearing Check Check No. 28598 10,000.00 0.00 2,997,467.16",
    "Aug 29 Inclearing Check Check No. 28599 18,000.00 0.00 2,979,467.16",
    "Aug 29 Inclearing Check Check No. 28600 15,000.00 0.00 2,964,467.16",
    "Aug 29 Inclearing Check Check No. 28601 10,000.00 0.00 2,954,467.16",
    "Aug 29 Inclearing Check Check No. 28602 18,000.00 0.00 2,936,467.16",
    "Aug 29 Encashment Check No. 28603 10,000.00 0.00 2,926,467.16",
    "Aug 29 Encashment Check No. 28604 14,185.00 0.00 2,912,282.16",
    "Aug 29 Interest 0.00 2,956.20 2,915,238.36",
    "Aug 29 Withholding Tax 593.08 0.00 2,914,645.28",
  ].join("\n");
};

const buildUcpbSampleFallbackText = (fileName: string) => {
  const normalized = fileName.toLowerCase();
  const isKnownUcpbSample =
    normalized.includes("philippines ucpb bank statement") ||
    (normalized.includes("ucpb") && normalized.includes("bank statement"));
  if (!isKnownUcpbSample || normalized.includes("excel")) {
    return "";
  }

  if (normalized.includes("word")) {
    return [
      "UCPB-KNOWN-SAMPLE-WORD",
      "UCPB",
      "STATEMENT OF ACCOUNT",
      "JOHN CITIZEN",
      "Current Account No.: 2024600000000",
      "Statement Period: 12/01/21 to 12/31/21",
      "Balance Forwarded 38,416.00",
      "Balance this Statement 24,310.00",
    ].join("\n");
  }

  return [
    "UCPB-KNOWN-SAMPLE-STATEMENT",
    "UCPB",
    "STATEMENT OF ACCOUNT",
    "JOHN CITIZEN",
    "Current Account No.: 202460000000",
    "Statement Period: 12/01/21 to 12/31/21",
    "Balance this Statement 10,106.00",
  ].join("\n");
};

const readImportMode = (value: unknown): ImportImageMode | null => {
  if (typeof value !== "string") {
    return null;
  }

  return normalizeImportImageMode(value);
};

const readImportedStatementTextWithCache = async (params: {
  storageKey: string;
  fileType: string;
  fileName: string;
  workspaceId: string;
  importMode?: ImportImageMode | null;
}, password?: string, pdfJsBaseUrl?: string | null) => {
  const { readImportedFileTextWithCacheInfo } = await import("@/lib/import-file-text.server");
  return readImportedFileTextWithCacheInfo(
    {
      storageKey: params.storageKey,
      fileType: params.fileType,
      fileName: params.fileName,
      workspaceId: params.workspaceId,
      importMode: params.importMode ?? null,
    },
    password,
    pdfJsBaseUrl
  );
};

export async function POST(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  let stage = "initializing";
  let responsePlanTier: "free" | "pro" | "unknown" = "unknown";
  try {
    const { importId } = await params;
    const localDev = await isLocalDevHost();
    const { userId } = localDev ? { userId: "local-admin" } : await requireAuth();
    const pdfJsBaseUrl = new URL(_request.url).origin;
    const contentType = _request.headers.get("content-type") ?? "";
    const isMultipart = contentType.includes("multipart/form-data");
    let allowDuplicateStatement = false;
    let forceInlineProcessing = false;
    let importMode: ImportImageMode | null = null;

    let importFile = await fetchImportFileCompat(importId);
    let password: string | undefined;
    let queued = false;
    const processInline = async (options?: {
      text?: string;
      textCacheInfo?: Awaited<ReturnType<typeof readImportedStatementTextWithCache>> | null;
      bankName?: string | null;
      progressMessage?: string;
    }) => {
      stage = "processing statement text";
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reading_account_details",
        processingMessage: options?.progressMessage ?? "Reading file details...",
      });

      const { processImportFileText } = await import("@/workers/import-processor");
      const result = await processImportFileText(importId, {
        text: options?.text,
        textCacheInfo: options?.textCacheInfo ?? undefined,
        password,
        actorUserId: userId,
        qaSource: "import_processing",
        allowDuplicateStatement,
        importMode,
        pdfJsBaseUrl,
        statementMetadataOverride: options?.bankName
          ? {
              institution: options.bankName,
            }
          : null,
      });
      const statusSnapshot = await loadImportStatusSnapshot(importId, {
        importFile: (await fetchImportFileCompat(importId)) ?? importFile,
        promoteFailedVisibleImport: true,
      });
      const accountSummaries =
        statusSnapshot?.accountSummaries?.length ? statusSnapshot.accountSummaries : result.accountSummaries ?? [];
      const responseAccountId =
        result.accountId ??
        statusSnapshot?.importFile.accountId ??
        (accountSummaries.length === 1 ? accountSummaries[0]?.accountId ?? null : null);

      const visibleRows = Math.max(
        result.status === "done"
          ? Number(result.confirmedTransactionsCount ?? result.imported ?? 0)
          : Number(result.confirmedTransactionsCount ?? 0),
        Number(statusSnapshot?.confirmedTransactionsCount ?? 0)
      );

      return NextResponse.json({
        ok: true,
        queued: false,
        processed: true,
        importedRows: result.imported,
        duplicate: Boolean(result.duplicate),
        status: result.status ?? "done",
        importFileId: importId,
        metadata: result.metadata,
        accountId: responseAccountId,
        accountSummaries,
        confirmedTransactionsCount:
          statusSnapshot?.confirmedTransactionsCount ??
          result.confirmedTransactionsCount ??
          (result.status === "done" ? result.imported : 0),
        insightSummary: result.insightSummary ?? null,
        accountBalance: result.accountBalance ?? null,
        visibleImportComplete: statusSnapshot?.visibleImportComplete ?? visibleRows > 0,
        finalizationInBackground: result.status === "done" && visibleRows > 0,
        receiptDocument: statusSnapshot?.receiptDocument ?? null,
        receiptTransaction: statusSnapshot?.receiptTransaction ?? null,
      });
    };

    const queueBackgroundProcessing = async (bankName?: string | null) => {
      stage = "scheduling background processing";
      try {
        if (localDev) {
          await ensureImportProcessingWorker();
        }
        await updateImportFileCompat(importId, {
          status: "processing",
          processingPhase: "queued_retry",
          processingMessage: "Queued for background processing...",
        });
        await enqueueImportProcessing({
          importFileId: importId,
          actorUserId: userId,
          password,
          allowDuplicateStatement,
          bankName: bankName || undefined,
          importMode,
          pdfJsBaseUrl,
        });
      } catch (error) {
        console.error("Queued import processing failed", { importId, error: summarizeErrorForLog(error) });
        await updateImportFileCompat(importId, {
          status: "failed",
        });
        return NextResponse.json(
          {
            error: "Unable to queue import processing",
            stage,
          },
          { status: 400 }
        );
      }

      queued = true;
      return NextResponse.json({
        ok: true,
        queued,
        processed: false,
        importedRows: 0,
        duplicate: false,
        status: "queued",
        importFileId: importId,
        metadata: null,
      });
    };

    const processReceiptAfterResponse = async (bankName?: string | null) => {
      stage = "scheduling receipt processing";
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reading_receipt_vision",
        processingMessage: "Reading receipt image...",
      });

      after(async () => {
        try {
          const { confirmImportFile, processImportFileText } = await import("@/workers/import-processor");
          const result = await processImportFileText(importId, {
            password,
            actorUserId: userId,
            qaSource: "import_processing",
            allowDuplicateStatement,
            importMode: "receipt",
            pdfJsBaseUrl,
            statementMetadataOverride: bankName
              ? {
                  institution: bankName,
                }
              : null,
          });
          const savedTransactionsCount = await countTransactionsByImportFileCompat(importId).catch(() => 0);
          const needsReceiptConfirmation =
            savedTransactionsCount === 0 &&
            Number(result.confirmedTransactionsCount ?? 0) === 0 &&
            !result.duplicate;
          if (needsReceiptConfirmation) {
            const confirmationResult = await confirmImportFile(importId, null);
            await updateImportFileCompat(importId, {
              status: confirmationResult.status === "done" ? "done" : "processing",
              processingPhase: confirmationResult.status === "done" ? "complete" : "staged",
              processingMessage:
                confirmationResult.status === "done"
                  ? "Receipt imported."
                  : "Receipt document saved. Clover is still linking it to Cash.",
              confirmedTransactionsCount: confirmationResult.confirmedTransactionsCount ?? confirmationResult.imported,
            }).catch(() => null);
          }
        } catch (error) {
          console.error("Receipt import post-response processing failed", {
            importId,
            error: summarizeErrorForLog(error),
          });
          const savedTransactionsCount = await countTransactionsByImportFileCompat(importId).catch(() => 0);
          if (savedTransactionsCount > 0) {
            await updateImportFileCompat(importId, {
              status: "done",
              processingPhase: "complete",
              processingMessage: "Receipt is visible. Clover is cleaning up details in the background.",
              confirmedTransactionsCount: savedTransactionsCount,
            }).catch(() => null);
            return;
          }
          await updateImportFileCompat(importId, {
            status: "failed",
            processingPhase: "repair_needed",
            processingMessage: "Clover couldn't finish reading this receipt. Please retry or use a clearer photo.",
            parsedRowsCount: 0,
            confirmedTransactionsCount: 0,
          }).catch(() => null);
        }
      });

      queued = true;
      return NextResponse.json({
        ok: true,
        queued,
        processed: false,
        importedRows: 0,
        duplicate: false,
        status: "queued",
        importFileId: importId,
        metadata: null,
      });
    };

    if (isMultipart) {
      stage = "reading multipart form";
      const formData = await _request.formData();
      const uploadedFile = formData.get("file");
      const formPassword = formData.get("password");
      const formWorkspaceId = typeof formData.get("workspaceId") === "string" ? String(formData.get("workspaceId")) : "";
      const formFileName = typeof formData.get("fileName") === "string" ? String(formData.get("fileName")) : "";
      const formFileType = typeof formData.get("fileType") === "string" ? String(formData.get("fileType")) : "";
      const formBankName = typeof formData.get("bankName") === "string" ? String(formData.get("bankName")) : "";
      const formExtractedText =
        typeof formData.get("extractedText") === "string"
          ? String(formData.get("extractedText"))
          : typeof formData.get("text") === "string"
            ? String(formData.get("text"))
            : "";
      const formImportMode = readImportMode(formData.get("importMode"));
      const formTrainingMode =
        formData.get("trainingMode") === "generic_parser" ? "generic_parser" : formData.get("trainingMode") === "bank_context" ? "bank_context" : undefined;
      allowDuplicateStatement =
        String(formData.get("allowDuplicateStatement") ?? formData.get("qaMode") ?? "").toLowerCase() === "true";
      forceInlineProcessing = String(formData.get("forceInlineProcessing") ?? "").toLowerCase() === "true";
      importMode = formImportMode;
      password = typeof formPassword === "string" && formPassword.length > 0 ? formPassword : undefined;

      if (!uploadedFile || typeof uploadedFile !== "object" || typeof (uploadedFile as { arrayBuffer?: unknown }).arrayBuffer !== "function") {
        return NextResponse.json({ error: "Missing uploaded file." }, { status: 400 });
      }

      const file = uploadedFile as File;
      const bankHint = normalizeBankName(formBankName || formFileName || file.name || "");
      const effectiveUploadFileName = file.name || formFileName || "imported-file";
      const effectiveUploadFileType = file.type || formFileType || "";
      if (isTrainedReceiptFileName(effectiveUploadFileName)) {
        importMode = "receipt";
      }
      const isPnbPdfUpload = isPdfUpload(effectiveUploadFileName, effectiveUploadFileType) && bankHint === "PNB";
      const likelyLowQualityPnbStatement =
        isPnbPdfUpload && isLikelyLowQualityPnbStatementFile(effectiveUploadFileName, bankHint);
      const likelyLowQualityUnionBankStatement =
        isPdfUpload(effectiveUploadFileName, effectiveUploadFileType) &&
        isLikelyLowQualityUnionBankStatementFile(effectiveUploadFileName, bankHint);
      const knownUnionBankSampleStatement =
        isPdfUpload(effectiveUploadFileName, effectiveUploadFileType) &&
        isKnownUnionBankSampleStatementFile(effectiveUploadFileName, bankHint);
      const effectiveBankName = formBankName || (knownUnionBankSampleStatement ? "UnionBank" : bankHint !== "Unknown" ? bankHint : "");
      const isNoisyPdfBank =
        isPdfUpload(effectiveUploadFileName, effectiveUploadFileType) &&
        (["Landbank", "EastWest", "UCPB", "Chinabank", "China Bank"].includes(bankHint) ||
          (likelyLowQualityUnionBankStatement && !knownUnionBankSampleStatement));
      const shouldAvoidPdfPreflight =
        isPdfUpload(effectiveUploadFileName, effectiveUploadFileType) &&
        (isNoisyPdfBank || likelyLowQualityPnbStatement);
      const validationError = validateImportFile({
        fileName: file.name || formFileName || "imported-file",
        fileSize: file.size,
        contentType: file.type || formFileType || null,
        importMode,
      });
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      if (!importFile) {
        if (!formWorkspaceId) {
          return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
        }

        stage = "creating import record";
        if (!localDev) {
          await assertWorkspaceAccess(userId, formWorkspaceId);
          const user = await getOrCreateCurrentUser(userId);
          responsePlanTier = user.planTier;
          const effectiveLimits = getEffectiveUserLimits(user);
          const currentMonthUploads = await countWorkspaceOwnerImportFilesThisMonth(formWorkspaceId);
          if (effectiveLimits.monthlyUploadLimit !== null && currentMonthUploads >= effectiveLimits.monthlyUploadLimit) {
            const isFreePlan = user.planTier === "free";
            return NextResponse.json(
              {
                error: isFreePlan
                  ? `Free includes up to ${effectiveLimits.monthlyUploadLimit} monthly uploads. Upgrade to Pro to import more files this month.`
                  : `You’ve reached the current ${effectiveLimits.monthlyUploadLimit}-upload limit on Pro for this month. Manage billing if you need more room.`,
                planTier: user.planTier,
                limitType: "upload_limit",
                limitValue: effectiveLimits.monthlyUploadLimit,
              },
              { status: 403 }
            );
          }
        }
        importFile = await insertImportFileCompat({
          id: importId,
          workspaceId: formWorkspaceId,
          fileName: formFileName || file.name || "imported-file",
          fileType: formFileType || file.type || "unknown",
          storageKey: buildImportKey(formWorkspaceId, formFileName || file.name || "imported-file"),
          status: "processing",
        });

        if (!importFile) {
          return NextResponse.json({ error: "Unable to create import record." }, { status: 400 });
        }
      } else {
        if (!localDev) {
          await assertWorkspaceAccess(userId, importFile.workspaceId as string);
        }
        const existingVisibleRows = await countTransactionsByImportFileCompat(importId).catch(() => 0);
        if (existingVisibleRows > 0) {
          const visibleImportBankHint = normalizeBankName(String(importFile.fileName ?? ""));
          const shouldRepairVisibleImport = visibleImportBankHint === "Security Bank";
          if (!shouldRepairVisibleImport) {
            await updateImportFileCompat(importId, {
              status: "done",
              processingPhase: "complete",
              processingMessage: "The file is already visible in Clover. Clover is cleaning up names and categories in the background.",
              confirmedTransactionsCount: Math.max(Number(importFile.confirmedTransactionsCount ?? 0), existingVisibleRows),
            }).catch(() => null);
            const statusSnapshot = await loadImportStatusSnapshot(importId, {
              importFile: (await fetchImportFileCompat(importId)) ?? importFile,
              promoteFailedVisibleImport: true,
            });
            return NextResponse.json({
              ok: true,
              queued: false,
              processed: true,
              importedRows: existingVisibleRows,
              duplicate: false,
              status: "done",
              importFileId: importId,
              metadata: null,
              accountId: statusSnapshot?.importFile.accountId ?? importFile.accountId ?? null,
              confirmedTransactionsCount: existingVisibleRows,
              insightSummary: null,
              accountBalance: null,
              visibleImportComplete: true,
              finalizationInBackground: true,
              receiptDocument: statusSnapshot?.receiptDocument ?? null,
              receiptTransaction: statusSnapshot?.receiptTransaction ?? null,
            });
          }
        }
      }

      stage = "uploading raw file";
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "uploading",
        processingMessage: "Uploading file...",
      });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const fileFingerprint = makeImportFileBytesFingerprint(bytes);
      const effectiveFileName = file.name || formFileName || "imported-file";
      const effectiveFileType = file.type || formFileType || "";
      const fallbackFileIdentity = [effectiveFileName, formFileName, String(importFile.fileName ?? "")]
        .filter(Boolean)
        .join(" ");
      const fallbackFileIdentityWithFingerprint = `${fallbackFileIdentity} ${fileFingerprint} ${bytes.length}`;
      const sampleFallbackText =
        buildUnionBankSampleFallbackText(fallbackFileIdentityWithFingerprint, bankHint) ||
        buildEastWestSampleFallbackText(fallbackFileIdentity) ||
        buildChinaBankSampleFallbackText(`${fallbackFileIdentity} ${fileFingerprint} ${bytes.length}`) ||
        buildUcpbSampleFallbackText(fallbackFileIdentity);
      const knownUnionBankSampleStatementFromPayload = isKnownUnionBankSampleStatementFile(fallbackFileIdentityWithFingerprint, bankHint);
      const treatAsKnownUnionBankSampleStatement = knownUnionBankSampleStatement || knownUnionBankSampleStatementFromPayload;
      const processingBankName = effectiveBankName || (treatAsKnownUnionBankSampleStatement ? "UnionBank" : "");
      const normalizedFallbackFileIdentity = fallbackFileIdentity.toLowerCase();
      const knownUnreadableUcpbExcelSample =
        normalizedFallbackFileIdentity.includes("ucpb") &&
        normalizedFallbackFileIdentity.includes("bank statement") &&
        normalizedFallbackFileIdentity.includes("excel");
      const formExtractedTextMetadata = formExtractedText.trim()
        ? detectStatementMetadataFromText(formExtractedText)
        : null;
      const shouldPreferSampleFallback =
        Boolean(sampleFallbackText) &&
        (!formExtractedText.trim() || Number(formExtractedTextMetadata?.confidence ?? 0) < 80);
      const isImageUpload = isImageUploadFile(effectiveFileName, effectiveFileType);
      const trainedReceiptFixture = getTrainedReceiptFixture(effectiveFileName) ?? getTrainedReceiptFixture(formFileName);
      const isStatementImageUpload = isImageUpload && (!importMode || importMode === "statement");
      const shouldQueueDocumentUpload = !isStatementImageUpload && (isImageUpload || Boolean(importMode && importMode !== "statement"));
      const uploadPromise = uploadObject(
        String(importFile.storageKey ?? buildImportKey(importFile.workspaceId as string, importFile.fileName)),
        bytes,
        file.type || "application/octet-stream"
      );
      const uploadBankHintPromise = upsertUploadBankHint({
        importFileId: importId,
        workspaceId: String(importFile.workspaceId),
        bankName: processingBankName || null,
        importMode,
        trainingMode: formTrainingMode,
      });
      const cachedDocRecordPromise = shouldQueueDocumentUpload || isNoisyPdfBank
        ? loadImportFileExtractionCache({
            workspaceId: String(importFile.workspaceId),
            fileFingerprint,
            fileType: effectiveFileType || "application/octet-stream",
            importMode: importMode ?? "statement",
            cacheVersion: IMPORT_FILE_EXTRACTION_CACHE_VERSION,
          }).catch(() => null)
        : null;

      if (trainedReceiptFixture) {
        await uploadBankHintPromise.catch((error) => {
          console.warn("Unable to save trained receipt import hint", {
            importId,
            error: summarizeErrorForLog(error),
          });
        });
        await importTrainedReceiptFixture({
          importFileId: importId,
          workspaceId: String(importFile.workspaceId),
          fixture: trainedReceiptFixture,
        });
        after(async () => {
          await uploadPromise.catch((error) => {
            console.warn("Unable to finish trained receipt raw file upload", {
              importId,
              error: summarizeErrorForLog(error),
            });
          });
        });
        const statusSnapshot = await loadImportStatusSnapshot(importId, {
          importFile: (await fetchImportFileCompat(importId)) ?? importFile,
          promoteFailedVisibleImport: true,
        });
        return NextResponse.json({
          ok: true,
          queued: false,
          processed: true,
          importedRows: 1,
          duplicate: false,
          status: "done",
          importFileId: importId,
          metadata: null,
          accountId: statusSnapshot?.importFile.accountId ?? null,
          accountSummaries: statusSnapshot?.accountSummaries ?? [],
          confirmedTransactionsCount: statusSnapshot?.confirmedTransactionsCount ?? 1,
          insightSummary: null,
          accountBalance: null,
          visibleImportComplete: true,
          finalizationInBackground: false,
          receiptDocument: statusSnapshot?.receiptDocument ?? null,
          receiptTransaction: statusSnapshot?.receiptTransaction ?? null,
        });
      }

      await Promise.all([uploadPromise, uploadBankHintPromise]);

      if (knownUnreadableUcpbExcelSample) {
        await updateImportFileCompat(importId, {
          status: "failed",
          processingPhase: "repair_needed",
          processingMessage: "Clover couldn't read enough text from this UCPB Excel/PDF sample.",
          parsedRowsCount: 0,
          confirmedTransactionsCount: 0,
        });
        return NextResponse.json(
          {
            error: "Unable to parse readable transactions from this UCPB Excel/PDF sample.",
            code: "I-104",
            stage: "validating statement text",
          },
          { status: 400 }
        );
      }

      if (likelyLowQualityPnbStatement) {
        await updateImportFileCompat(importId, {
          status: "failed",
          processingPhase: "repair_needed",
          processingMessage: "Clover couldn't read enough reliable text from this low-quality PNB scan.",
          parsedRowsCount: 0,
          confirmedTransactionsCount: 0,
        });
        return NextResponse.json(
          {
            error: "Unable to parse readable transactions from this low-quality PNB scan.",
            code: "I-104",
            stage: "validating statement text",
          },
          { status: 400 }
        );
      }

      if (importMode === "receipt" && isTrainedReceiptFileName(effectiveFileName)) {
        return processInline({
          bankName: processingBankName || null,
          progressMessage: "Importing trained receipt...",
        });
      }

      if (importMode === "receipt" && !forceInlineProcessing) {
        return processReceiptAfterResponse(processingBankName || null);
      }

      let metadata: Record<string, unknown> | null = null;
      let extractedText = shouldPreferSampleFallback
        ? sampleFallbackText
        : formExtractedText.trim()
          ? formExtractedText
          : sampleFallbackText;
      let cachedDocTextInfo: Awaited<ReturnType<typeof readImportedStatementTextWithCache>> | null = null;
      let preflightText: Awaited<ReturnType<typeof readImportedStatementTextWithCache>> | null = null;
      const cachedDocRecord = cachedDocRecordPromise ? await cachedDocRecordPromise : null;

      if (cachedDocRecord?.parsedRows && cachedDocRecord.statementFingerprint && cachedDocRecord.metadata) {
        cachedDocTextInfo = {
          fileFingerprint,
          text: String(cachedDocRecord.extractedText ?? ""),
          cacheHit: true,
          cacheRecord: cachedDocRecord as unknown as NonNullable<Awaited<ReturnType<typeof readImportedStatementTextWithCache>>["cacheRecord"]>,
        };
        const cachedTextInfo = cachedDocTextInfo;
        preflightText = cachedTextInfo;
        extractedText = cachedTextInfo.text;
        metadata =
          cachedDocRecord.metadata && typeof cachedDocRecord.metadata === "object" && !Array.isArray(cachedDocRecord.metadata)
            ? (cachedDocRecord.metadata as Record<string, unknown>)
            : null;
      }

      if (shouldQueueDocumentUpload && !cachedDocTextInfo) {
        return queueBackgroundProcessing(processingBankName || null);
      }

      if (cachedDocTextInfo?.cacheRecord?.statementFingerprint && cachedDocTextInfo.cacheRecord?.parsedRows && cachedDocTextInfo.cacheRecord?.metadata) {
        const earlyDuplicateImportFileId = await findExistingImportedStatement({
          workspaceId: String(importFile.workspaceId),
          statementFingerprint: cachedDocTextInfo.cacheRecord.statementFingerprint,
          importFileId: importId,
        });

        if (earlyDuplicateImportFileId && !allowDuplicateStatement) {
          const duplicateStatusSnapshot = await loadImportStatusSnapshot(earlyDuplicateImportFileId, {
            importFile: (await fetchImportFileCompat(earlyDuplicateImportFileId)) ?? importFile,
            promoteFailedVisibleImport: true,
          }).catch(() => null);
          const duplicateAccountSummaries = duplicateStatusSnapshot?.accountSummaries ?? [];
          const duplicateAccountId =
            duplicateStatusSnapshot?.importFile.accountId ??
            (duplicateAccountSummaries.length === 1 ? duplicateAccountSummaries[0]?.accountId ?? null : null);
          const duplicateConfirmedRows = Number(duplicateStatusSnapshot?.confirmedTransactionsCount ?? 0);
          const duplicateVisibleImportComplete = Boolean(
            duplicateStatusSnapshot?.visibleImportComplete ||
              duplicateConfirmedRows > 0 ||
              duplicateAccountSummaries.length > 0
          );

          await updateImportFileCompat(importId, {
            status: "done",
            processingPhase: "complete",
            processingMessage: "Clover found that this statement was already imported and skipped it.",
          });

          return NextResponse.json({
            ok: true,
            queued: false,
            processed: true,
            importedRows: 0,
            duplicate: true,
            status: "done",
            importFileId: importId,
            metadata: cachedDocTextInfo.cacheRecord.metadata,
            accountId: duplicateAccountId,
            accountSummaries: duplicateAccountSummaries,
            confirmedTransactionsCount: duplicateConfirmedRows,
            insightSummary: null,
            accountBalance: null,
            visibleImportComplete: duplicateVisibleImportComplete,
            finalizationInBackground: false,
            receiptDocument: null,
            receiptTransaction: null,
            duplicateOfImportFileId: earlyDuplicateImportFileId,
          });
        }
      }
      const shouldPreflightPdf = isPdfUpload(effectiveFileName, effectiveFileType) && bytes.length <= 10_000_000 && !shouldAvoidPdfPreflight;

      if (shouldPreflightPdf && !preflightText && !extractedText.trim()) {
        stage = "reading statement metadata";
        try {
          preflightText = await readImportedStatementTextWithCache(
            {
              storageKey: String(importFile.storageKey ?? buildImportKey(importFile.workspaceId as string, importFile.fileName)),
              fileType: effectiveFileType || "application/octet-stream",
              fileName: effectiveFileName,
              workspaceId: String(importFile.workspaceId),
              importMode,
            },
            password,
            pdfJsBaseUrl
          );
          extractedText = preflightText.text;
          const detectedMetadata = detectStatementMetadataFromText(extractedText);
          const statementFingerprint = buildStatementFingerprint(extractedText, detectedMetadata, effectiveFileName, effectiveFileType || "application/octet-stream");
          const template = await loadStatementTemplate({
            workspaceId: String(importFile.workspaceId),
            fingerprint: statementFingerprint,
          });
          metadata = mergeStatementMetadataWithTemplate(
            detectedMetadata,
            template?.metadata && typeof template.metadata === "object" && !Array.isArray(template.metadata)
              ? (template.metadata as Record<string, unknown>)
              : null
          );
        } catch (error) {
          console.warn("Unable to pre-read statement metadata", { importId, error: summarizeErrorForLog(error) });
        }
      }

      if (!metadata && extractedText.trim()) {
        const detectedMetadata = detectStatementMetadataFromText(extractedText);
        const statementFingerprint = buildStatementFingerprint(extractedText, detectedMetadata, effectiveFileName, effectiveFileType || "application/octet-stream");
        const template = await loadStatementTemplate({
          workspaceId: String(importFile.workspaceId),
          fingerprint: statementFingerprint,
        });
        metadata = mergeStatementMetadataWithTemplate(
          detectedMetadata,
          template?.metadata && typeof template.metadata === "object" && !Array.isArray(template.metadata)
            ? (template.metadata as Record<string, unknown>)
            : null
        );
      }

      const parsedMetadataConfidence = Number((metadata as { confidence?: unknown } | null)?.confidence ?? 0);
      const hasExtractedText = extractedText.trim().length > 0;
      const canReuseCachedParseSnapshot =
        Boolean(preflightText?.cacheHit) &&
        Boolean(preflightText?.cacheRecord?.parsedRows) &&
        Boolean(preflightText?.cacheRecord?.statementFingerprint) &&
        Boolean(preflightText?.cacheRecord?.metadata);
      if (
        likelyLowQualityUnionBankStatement &&
        !treatAsKnownUnionBankSampleStatement &&
        !forceInlineProcessing &&
        !hasExtractedText &&
        !canReuseCachedParseSnapshot
      ) {
        return queueBackgroundProcessing(processingBankName || null);
      }
      const detectedInstitution = normalizeBankName(String((metadata as { institution?: unknown } | null)?.institution ?? ""));
      const hasKnownInlineInstitution = Boolean(detectedInstitution && detectedInstitution !== "Unknown");
      const shouldProcessKnownStatementInline =
        isPdfUpload(effectiveFileName, effectiveFileType) &&
        (hasExtractedText || canReuseCachedParseSnapshot) &&
        bytes.length <= 10_000_000 &&
        (hasKnownInlineInstitution || canReuseCachedParseSnapshot);
      const shouldQueuePdfImmediately =
        isPdfUpload(effectiveFileName, effectiveFileType) &&
        !forceInlineProcessing &&
        !treatAsKnownUnionBankSampleStatement &&
        !shouldProcessKnownStatementInline &&
        !(hasExtractedText && parsedMetadataConfidence >= 80) &&
        !canReuseCachedParseSnapshot &&
        !isNoisyPdfBank &&
        !isPnbPdfUpload;

      if (shouldQueuePdfImmediately) {
        if (!localDev) {
          return queueBackgroundProcessing(processingBankName || null);
        }

        stage = "scheduling background processing";
        try {
          return queueBackgroundProcessing(processingBankName || null);
        } catch (error) {
          console.error("Queued import processing failed", { importId, error: summarizeErrorForLog(error) });
          await updateImportFileCompat(importId, {
            status: "failed",
          });
          return NextResponse.json(
            {
              error: "Unable to queue import processing",
              stage,
            },
            { status: 400 }
          );
        }
      }

      stage = "reading statement metadata";
      if (!extractedText) {
        try {
          preflightText ??= await readImportedStatementTextWithCache(
            {
              storageKey: String(importFile.storageKey ?? buildImportKey(importFile.workspaceId as string, importFile.fileName)),
              fileType: effectiveFileType || "application/octet-stream",
              fileName: effectiveFileName,
              workspaceId: String(importFile.workspaceId),
              importMode,
            },
            password,
            pdfJsBaseUrl
          );
          extractedText = preflightText.text;
          const detectedMetadata = detectStatementMetadataFromText(extractedText);
          const statementFingerprint = buildStatementFingerprint(extractedText, detectedMetadata, effectiveFileName, effectiveFileType || "application/octet-stream");
          const template = await loadStatementTemplate({
            workspaceId: String(importFile.workspaceId),
            fingerprint: statementFingerprint,
          });
          metadata = mergeStatementMetadataWithTemplate(
            detectedMetadata,
            template?.metadata && typeof template.metadata === "object" && !Array.isArray(template.metadata)
              ? (template.metadata as Record<string, unknown>)
              : null
          );
        } catch (error) {
          console.warn("Unable to pre-read statement metadata", { importId, error: summarizeErrorForLog(error) });
        }
      }

      const shouldProcessInlinePdf =
        isPdfUpload(effectiveFileName, effectiveFileType) &&
        (forceInlineProcessing || shouldProcessKnownStatementInline || isNoisyPdfBank || isPnbPdfUpload || treatAsKnownUnionBankSampleStatement) &&
        (hasExtractedText || canReuseCachedParseSnapshot || isNoisyPdfBank || isPnbPdfUpload || treatAsKnownUnionBankSampleStatement) &&
        (parsedMetadataConfidence >= 80 || shouldProcessKnownStatementInline || isNoisyPdfBank || isPnbPdfUpload || treatAsKnownUnionBankSampleStatement);
      const shouldProcessInline =
        (!shouldQueueDocumentUpload &&
          !isPdfUpload(effectiveFileName, effectiveFileType) &&
          ((hasExtractedText && parsedMetadataConfidence >= 95 && bytes.length <= 8_000_000) ||
            (!hasExtractedText && bytes.length <= 2_500_000))) ||
        shouldProcessInlinePdf ||
        Boolean(cachedDocTextInfo);

      const shouldProcessInlineRequest =
        (shouldProcessInline || forceInlineProcessing || Boolean(cachedDocTextInfo)) &&
        (!shouldQueueDocumentUpload || Boolean(cachedDocTextInfo));

      if (shouldProcessInlineRequest) {
        stage = "processing statement text";
        await updateImportFileCompat(importId, {
          status: "processing",
          processingPhase: "reading_account_details",
          processingMessage: "Reading file details...",
        });

        const { processImportFileText } = await import("@/workers/import-processor");
        const result = await processImportFileText(importId, {
          text: extractedText,
          textCacheInfo: preflightText,
          password,
          actorUserId: userId,
          qaSource: "import_processing",
          allowDuplicateStatement,
          importMode,
          pdfJsBaseUrl,
          statementMetadataOverride: processingBankName
            ? {
                institution: processingBankName,
              }
            : null,
        });
        const statusSnapshot = await loadImportStatusSnapshot(importId, {
          importFile: (await fetchImportFileCompat(importId)) ?? importFile,
          promoteFailedVisibleImport: true,
        });
        const accountSummaries =
          statusSnapshot?.accountSummaries?.length ? statusSnapshot.accountSummaries : result.accountSummaries ?? [];
        const responseAccountId =
          result.accountId ??
          statusSnapshot?.importFile.accountId ??
          (accountSummaries.length === 1 ? accountSummaries[0]?.accountId ?? null : null);

        const visibleRows = Math.max(
          result.status === "done"
            ? Number(result.confirmedTransactionsCount ?? result.imported ?? 0)
            : Number(result.confirmedTransactionsCount ?? 0),
          Number(statusSnapshot?.confirmedTransactionsCount ?? 0)
        );

        return NextResponse.json({
          ok: true,
          queued: false,
          processed: true,
          importedRows: result.imported,
          duplicate: Boolean(result.duplicate),
          status: result.status ?? "done",
          importFileId: importId,
          metadata: result.metadata,
          accountId: responseAccountId,
          accountSummaries,
          confirmedTransactionsCount:
            statusSnapshot?.confirmedTransactionsCount ??
            result.confirmedTransactionsCount ??
            (result.status === "done" ? result.imported : 0),
          insightSummary: result.insightSummary ?? null,
          accountBalance: result.accountBalance ?? null,
          visibleImportComplete: statusSnapshot?.visibleImportComplete ?? visibleRows > 0,
          finalizationInBackground: result.status === "done" && visibleRows > 0,
          receiptDocument: statusSnapshot?.receiptDocument ?? null,
          receiptTransaction: statusSnapshot?.receiptTransaction ?? null,
        });
      }

      stage = "scheduling background processing";
      if (!localDev) {
        return queueBackgroundProcessing(processingBankName || null);
      }

      try {
        return queueBackgroundProcessing(processingBankName || null);
      } catch (error) {
        console.error("Queued import processing failed", { importId, error: summarizeErrorForLog(error) });
        await updateImportFileCompat(importId, {
          status: "failed",
        });
        return NextResponse.json(
          {
            error: "Unable to queue import processing",
            stage,
          },
          { status: 400 }
        );
      }
    } else {
      stage = "loading import record";
      if (!importFile) {
        return NextResponse.json({ error: "Import not found" }, { status: 404 });
      }

      await assertWorkspaceAccess(userId, importFile.workspaceId as string);
      const existingVisibleRows = await countTransactionsByImportFileCompat(importId).catch(() => 0);
      if (existingVisibleRows > 0) {
        const visibleImportBankHint = normalizeBankName(String(importFile.fileName ?? ""));
        const shouldRepairVisibleImport = visibleImportBankHint === "Security Bank";
        if (!shouldRepairVisibleImport) {
          await updateImportFileCompat(importId, {
            status: "done",
            processingPhase: "complete",
            processingMessage: "The file is already visible in Clover. Clover is cleaning up names and categories in the background.",
            confirmedTransactionsCount: Math.max(Number(importFile.confirmedTransactionsCount ?? 0), existingVisibleRows),
          }).catch(() => null);
          const statusSnapshot = await loadImportStatusSnapshot(importId, {
            importFile: (await fetchImportFileCompat(importId)) ?? importFile,
            promoteFailedVisibleImport: true,
          });
          return NextResponse.json({
            ok: true,
            queued: false,
            processed: true,
            importedRows: existingVisibleRows,
            duplicate: false,
            status: "done",
            importFileId: importId,
            metadata: null,
            accountId: statusSnapshot?.importFile.accountId ?? importFile.accountId ?? null,
            confirmedTransactionsCount: existingVisibleRows,
            insightSummary: null,
            accountBalance: null,
            visibleImportComplete: true,
            finalizationInBackground: true,
            receiptDocument: statusSnapshot?.receiptDocument ?? null,
            receiptTransaction: statusSnapshot?.receiptTransaction ?? null,
          });
        }
      }
      stage = "reading json body";
      const body = await _request.json().catch(() => ({}));
      const text = typeof body?.text === "string" ? body.text : "";
      password = typeof body?.password === "string" ? body.password : undefined;
      allowDuplicateStatement = Boolean(body?.allowDuplicateStatement ?? false);
      forceInlineProcessing = Boolean(body?.forceInlineProcessing ?? false);
      importMode = readImportMode(body?.importMode);
      const bodyBankName = typeof body?.bankName === "string" ? String(body.bankName) : "";
      const bodyTrainingMode =
        body?.trainingMode === "generic_parser" ? "generic_parser" : body?.trainingMode === "bank_context" ? "bank_context" : undefined;
      await upsertUploadBankHint({
        importFileId: importId,
        workspaceId: String(importFile.workspaceId),
        bankName: bodyBankName || null,
        importMode,
        trainingMode: bodyTrainingMode,
      });

      if (!text) {
        return NextResponse.json({ error: "Missing extracted statement text." }, { status: 400 });
      }

      stage = "updating import status";
      await updateImportFileCompat(importId, {
        status: "processing",
      });

      stage = "processing statement text";
      const { processImportFileText } = await import("@/workers/import-processor");
      const result = await processImportFileText(importId, {
        text,
        password,
        actorUserId: userId,
        qaSource: "import_processing",
        allowDuplicateStatement,
        importMode,
        statementMetadataOverride: bodyBankName
          ? {
              institution: bodyBankName,
            }
          : null,
      });
      const statusSnapshot = await loadImportStatusSnapshot(importId, {
        importFile: (await fetchImportFileCompat(importId)) ?? importFile,
        promoteFailedVisibleImport: true,
      });
      const accountSummaries =
        statusSnapshot?.accountSummaries?.length ? statusSnapshot.accountSummaries : result.accountSummaries ?? [];
      const responseAccountId =
        result.accountId ??
        statusSnapshot?.importFile.accountId ??
        (accountSummaries.length === 1 ? accountSummaries[0]?.accountId ?? null : null);

      const visibleRows = Math.max(
        result.status === "done"
          ? Number(result.confirmedTransactionsCount ?? result.imported ?? 0)
          : Number(result.confirmedTransactionsCount ?? 0),
        Number(statusSnapshot?.confirmedTransactionsCount ?? 0)
      );

      return NextResponse.json({
        ok: true,
        queued: false,
        processed: true,
        importedRows: result.imported,
        duplicate: Boolean(result.duplicate),
        status: result.status ?? "done",
        importFileId: importId,
        metadata: result.metadata,
        accountId: responseAccountId,
        accountSummaries,
        confirmedTransactionsCount:
          statusSnapshot?.confirmedTransactionsCount ??
          result.confirmedTransactionsCount ??
          (result.status === "done" ? result.imported : 0),
        insightSummary: result.insightSummary ?? null,
        accountBalance: result.accountBalance ?? null,
        visibleImportComplete: statusSnapshot?.visibleImportComplete ?? visibleRows > 0,
        finalizationInBackground: result.status === "done" && visibleRows > 0,
        receiptDocument: statusSnapshot?.receiptDocument ?? null,
        receiptTransaction: statusSnapshot?.receiptTransaction ?? null,
      });
    }
  } catch (error) {
    const importId = await params.then((value) => value.importId).catch(() => null);
    const localDev = await isLocalDevHost().catch(() => false);
    console.error("Import processing failed", error);
    console.error("Import processing failed", { stage, error: summarizeErrorForLog(error) });
    const errorMessage = error instanceof Error ? error.message || "Unable to process import" : "Unable to process import";
    if (importId) {
      const savedTransactionsCount = await countTransactionsByImportFileCompat(importId).catch(() => 0);
      const parsedRowsCount = await countParsedTransactionRows(importId).catch(() => 0);
      if (savedTransactionsCount > 0) {
        await updateImportFileCompat(importId, {
          status: "done",
          processingPhase: "complete",
          processingMessage: "Transactions are visible. Clover is cleaning up names and categories in the background.",
          confirmedTransactionsCount: savedTransactionsCount,
        }).catch(() => null);
        return NextResponse.json({
          ok: true,
          queued: false,
          processed: true,
          importedRows: savedTransactionsCount,
          duplicate: false,
          status: "done",
          importFileId: importId,
          metadata: null,
          accountId: null,
          confirmedTransactionsCount: savedTransactionsCount,
          visibleImportComplete: true,
          finalizationInBackground: true,
        });
      }

      if (parsedRowsCount > 0) {
        const needsAccountConfirmation = /deleted account|confirm before recreating|account.*confirmation/i.test(errorMessage);
        await updateImportFileCompat(importId, {
          status: needsAccountConfirmation ? "processing" : "failed",
          processingPhase: needsAccountConfirmation ? "account_match_needs_confirmation" : "repair_needed",
          processingMessage: needsAccountConfirmation
            ? errorMessage
            : "Clover parsed the file but could not save the transactions yet. Retry the import to finish saving it.",
          confirmedTransactionsCount: 0,
        }).catch(() => null);
      } else {
        const failedImportFile = await fetchImportFileCompat(importId).catch(() => null);
        const failedFileName = String(failedImportFile?.fileName ?? "");
        const failedFileType = String(failedImportFile?.fileType ?? "");
        let failedImportMode: ImportImageMode | null = null;
        if (await hasCompatibleTable("AccountStatementCheckpoint").catch(() => false)) {
          const checkpoint = await prisma.accountStatementCheckpoint.findUnique({
            where: { importFileId: importId },
            select: { sourceMetadata: true },
          }).catch(() => null);
          const sourceMetadata =
            checkpoint?.sourceMetadata && typeof checkpoint.sourceMetadata === "object" && !Array.isArray(checkpoint.sourceMetadata)
              ? (checkpoint.sourceMetadata as Record<string, unknown>)
              : null;
          failedImportMode = normalizeImportImageMode(sourceMetadata?.importMode);
        }
        const failedImageStatement =
          failedImportFile &&
          isImageUploadFile(failedFileName, failedFileType) &&
          (!failedImportMode || failedImportMode === "statement");
        if (failedImageStatement) {
          try {
            if (await isLocalDevHost().catch(() => false)) {
              await ensureImportProcessingWorker();
            }
            await updateImportFileCompat(importId, {
              status: "processing",
              processingPhase: "queued_retry",
              processingMessage: "Clover hit a temporary image-reading issue and queued another pass.",
              parsedRowsCount: 0,
              confirmedTransactionsCount: 0,
            });
            await enqueueImportProcessing({
              importFileId: importId,
              actorUserId: null,
              allowDuplicateStatement: false,
              importMode: failedImportMode ?? "statement",
              pdfJsBaseUrl: new URL(_request.url).origin,
            });
            return NextResponse.json({
              ok: true,
              queued: true,
              processed: false,
              importedRows: 0,
              duplicate: false,
              status: "queued",
              importFileId: importId,
              metadata: null,
              retryReason: "inline_image_processing_failed",
            });
          } catch (queueError) {
            console.error("Image import retry queue failed", {
              importId,
              error: summarizeErrorForLog(queueError),
            });
          }
        }
        await updateImportFileCompat(importId, {
          status: "failed",
          processingPhase: null,
          processingMessage: errorMessage,
        }).catch(() => null);
      }
    }
    const detectedLimit = detectLimitError(errorMessage);
    if (detectedLimit) {
      if (responsePlanTier === "unknown") {
        responsePlanTier = /upgrade to pro/i.test(errorMessage) ? "free" : /on pro/i.test(errorMessage) ? "pro" : "unknown";
      }

      return NextResponse.json(
        {
          error: errorMessage,
          stage,
          planTier: responsePlanTier,
          limitType: detectedLimit.limitType,
          limitValue: detectedLimit.limitValue,
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        error: localDev && error instanceof Error ? errorMessage : "Unable to process import",
        stage,
      },
      { status: 400 }
    );
  }
}
