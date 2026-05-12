import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

type ImportedAccountType = "bank" | "wallet" | "credit_card" | "cash" | "investment" | "other";

type Fixture = {
  label: string;
  relativePath: string;
  institution: string;
  accountName: string;
  accountNumber: string;
  accountType: ImportedAccountType;
  minRows: number;
  exactRows?: number;
  expectedOpeningBalance?: number;
  expectedTrailingBalance?: number;
  expectedStartDate?: string;
  expectedEndDate?: string;
  minConfidence?: number;
  expectParsedAccountName?: boolean;
};

type ParserCoverageItem = {
  key: string;
  label: string;
};

const defaultStatementRoot = "/Users/TimCayanga1/Documents/Bank Statements";

const fixtures: Fixture[] = [
  {
    label: "BPI Personal",
    relativePath: "Actual SOAs/BPI/BPI Savings/SA20260110 Q4 2025 Personal.pdf",
    institution: "BPI",
    accountName: "BPI 3012",
    accountNumber: "0299-1830-12",
    accountType: "bank",
    minRows: 3,
    exactRows: 3,
    expectedOpeningBalance: 498867.67,
    expectedTrailingBalance: 536435.79,
    expectedStartDate: "2025-10-07",
    expectedEndDate: "2026-01-07",
    minConfidence: 90,
  },
  {
    label: "BPI Sample Statement",
    relativePath: "Samples/BPI/289783509-Statement-Bpi.pdf",
    institution: "BPI",
    accountName: "JEFFREY PILAPIL ROSAL",
    accountNumber: "5756-4818-29",
    accountType: "bank",
    minRows: 13,
    exactRows: 13,
    expectedOpeningBalance: 4.96,
    expectedTrailingBalance: 41.74,
    expectedStartDate: "2015-05-14",
    expectedEndDate: "2015-08-16",
    minConfidence: 90,
  },
  {
    label: "BDO Sample Statement",
    relativePath: "Samples/BDO/648293940-BDO.pdf",
    institution: "BDO Unibank, Inc.",
    accountName: "AMELITA POLICARPIO",
    accountNumber: "13300009191",
    accountType: "bank",
    minRows: 29,
    exactRows: 29,
    expectedTrailingBalance: 760604.53,
    expectedStartDate: "2021-10-22",
    expectedEndDate: "2022-07-19",
    minConfidence: 80,
  },
  {
    label: "BDO Bank Statement",
    relativePath: "Samples/BDO/698065326-BDO-Bank-Statement.pdf",
    institution: "BDO Unibank, Inc.",
    accountName: "ERICKSON ROMERO MADRIDEO",
    accountNumber: "001-8201-771-55",
    accountType: "bank",
    minRows: 6,
    exactRows: 6,
    expectedTrailingBalance: 8000,
    minConfidence: 90,
  },
  {
    label: "Metrobank Savings Monthly",
    relativePath: "Samples/Metrobank/848676827-METRO-BANK-CERT-AND-BANK-STATMENT.pdf",
    institution: "Metrobank",
    accountName: "JOHN NEIL RIVERA",
    accountNumber: "000007048866",
    accountType: "bank",
    minRows: 19,
    exactRows: 19,
    expectedOpeningBalance: 57105.51,
    expectedTrailingBalance: 55072.01,
    expectedStartDate: "2025-01-31",
    expectedEndDate: "2025-01-31",
    minConfidence: 85,
  },
  {
    label: "Metrobank Credit Card Large",
    relativePath: "Samples/Metrobank/412340326-compressor.pdf",
    institution: "Metrobank",
    accountName: "EVALYN TABAG",
    accountNumber: "4055992047530161",
    accountType: "credit_card",
    minRows: 6,
    exactRows: 6,
    expectedOpeningBalance: 18943.15,
    expectedTrailingBalance: 72306.01,
    expectedEndDate: "2018-12-21",
    minConfidence: 90,
  },
  {
    label: "BPI Dependent",
    relativePath: "Actual SOAs/BPI/BPI Savings/SA20260110 Q4 2025 Dependent.pdf",
    institution: "BPI",
    accountName: "BPI 7005",
    accountNumber: "0299-0970-05",
    accountType: "bank",
    minRows: 17,
    exactRows: 17,
    expectedOpeningBalance: 392185.25,
    expectedTrailingBalance: 21678.26,
    expectedStartDate: "2025-10-07",
    expectedEndDate: "2026-01-07",
    minConfidence: 90,
  },
  {
    label: "GoTyme Everyday Deposit Sample",
    relativePath: "Samples/GoTyme/850752826-GoTymeStatementForEverydayDepositAccount-20250113-160913-2.pdf",
    institution: "GoTyme",
    accountName: "WILFRED JR VALDERAMA",
    accountNumber: "011607684435",
    accountType: "bank",
    minRows: 9,
    exactRows: 9,
    expectedOpeningBalance: 0,
    expectedTrailingBalance: 0,
    expectedStartDate: "2024-07-13",
    expectedEndDate: "2025-01-12",
    minConfidence: 100,
  },
  {
    label: "CIMB Mixed Pages",
    relativePath: "Samples/CIMB/840624470-CIMB-Statement-of-account-pdf.pdf",
    institution: "CIMB",
    accountName: "Raihana Mentok Said",
    accountNumber: "20867602571932",
    accountType: "bank",
    minRows: 7,
    expectedTrailingBalance: 4294.66,
    minConfidence: 85,
  },
  {
    label: "Maya Savings Sample",
    relativePath: "Samples/Maya/916450168-MayaSavings-SoA-6fd6154af7eb46e7afe2c3e43f271677-2025JUL.pdf",
    institution: "Maya Bank",
    accountName: "Flora Mae Dapal Montiadora",
    accountNumber: "8054 1160 2354",
    accountType: "bank",
    minRows: 4,
    exactRows: 4,
    expectedOpeningBalance: 0,
    expectedTrailingBalance: 41.44,
    expectedStartDate: "2025-07-01",
    expectedEndDate: "2025-07-31",
    minConfidence: 100,
  },
  {
    label: "CIMB GSave October 2025",
    relativePath: "Samples/CIMB/927858715-CIMB-Statement-of-Account-20251004-155400-0000.pdf",
    institution: "CIMB",
    accountName: "Farhana Usman Mentok",
    accountNumber: "30865602571091",
    accountType: "bank",
    minRows: 7,
    expectedTrailingBalance: 4294.66,
    expectedStartDate: "2025-05-01",
    expectedEndDate: "2025-06-10",
    minConfidence: 85,
  },
  {
    label: "Security Bank Sample",
    relativePath: "Samples/Security Bank/748042099-Security-Bank-Statement-Gsr.pdf",
    institution: "Security Bank",
    accountName: "Security Bank 1852",
    accountNumber: "0000059711852",
    accountType: "bank",
    minRows: 8,
    exactRows: 8,
    expectedOpeningBalance: 24.8,
    expectedTrailingBalance: 1000.2,
    expectedStartDate: "2023-11-30",
    expectedEndDate: "2023-12-29",
    minConfidence: 95,
  },
  {
    label: "CIMB GSave November 2025",
    relativePath: "Samples/CIMB/947472452-CIMB-Statement-of-Account-20251112-141921-0000.pdf",
    institution: "CIMB",
    accountName: "Farhana Usman Mentok",
    accountNumber: "30865602571091",
    accountType: "bank",
    minRows: 7,
    expectedTrailingBalance: 4294.66,
    minConfidence: 85,
  },
  {
    label: "UnionBank Credit Card Sample",
    relativePath: "Samples/UnionBank/771487697-SOA-Union-Bank.pdf",
    institution: "UnionBank of the Philippines",
    accountName: "Alyssa Jane Gabriel Rezada",
    accountNumber: "1056827763912",
    accountType: "credit_card",
    minRows: 11,
    exactRows: 11,
    expectedEndDate: "2024-08-31",
    minConfidence: 90,
  },
  {
    label: "GoTyme Everyday Deposit",
    relativePath: "Samples/GoTyme/900052996-Pdfrendition1-1-Unlocked.pdf",
    institution: "GoTyme",
    accountName: "PINKY PAISAN CRESCENCIO",
    accountNumber: "019530466477",
    accountType: "bank",
    minRows: 117,
    exactRows: 117,
    expectedOpeningBalance: 1.75,
    expectedTrailingBalance: 231.58,
    expectedStartDate: "2025-06-01",
    expectedEndDate: "2025-06-30",
    minConfidence: 80,
  },
  {
    label: "GCash",
    relativePath: "Actual SOAs/GCash/GCash Statement Oct 2025 - Mar 2026_unlocked.pdf",
    institution: "GCash",
    accountName: "GCash 9926",
    accountNumber: "09173009926",
    accountType: "wallet",
    minRows: 100,
    exactRows: 180,
    expectedOpeningBalance: 25882.06,
    expectedStartDate: "2025-10-01",
    expectedEndDate: "2026-04-15",
    minConfidence: 80,
    expectParsedAccountName: false,
  },
  {
    label: "Maya Savings November 2024",
    relativePath: "Samples/Maya/829627385-MayaSavings-SoA-112024-1.pdf",
    institution: "Maya Bank",
    accountName: "JULIUS FUENTES LOBIANO",
    accountNumber: "8147-3969-3327",
    accountType: "bank",
    minRows: 11,
    exactRows: 11,
    expectedOpeningBalance: 1785.45,
    expectedTrailingBalance: 0.01,
    expectedStartDate: "2024-12-01",
    expectedEndDate: "2024-12-31",
    minConfidence: 80,
  },
  {
    label: "PSBank Statement",
    relativePath: "Samples/PSBank/63720585-2988959.pdf",
    institution: "PSBank",
    accountName: "CLARIDAD, FLOR MARIE BOSMEON",
    accountNumber: "020-388-01099322-9",
    accountType: "other",
    minRows: 4,
    exactRows: 4,
    expectedOpeningBalance: 74745.22,
    expectedTrailingBalance: 77881.08,
    expectedStartDate: "2011-05-21",
    expectedEndDate: "2011-06-20",
    minConfidence: 90,
  },
  {
    label: "PNB Sample Statement",
    relativePath: "Samples/PNB/935579868-Sample-Bank-Statement.pdf",
    institution: "Philippine National Bank",
    accountName: "Juan Dela Cruz",
    accountNumber: "1234-5678-9012",
    accountType: "bank",
    minRows: 8,
    exactRows: 8,
    expectedOpeningBalance: 50000,
    expectedTrailingBalance: 64900,
    expectedStartDate: "2025-08-01",
    expectedEndDate: "2025-08-25",
    minConfidence: 90,
  },
  {
    label: "PNB Project SOA January 2021",
    relativePath: "Samples/PNB/495650370-PNB-Project-SOA-Jan-2021.pdf",
    institution: "Philippine National Bank",
    accountName: "BURKLEY & AQUINO LAW OFFICE",
    accountNumber: "123370003379",
    accountType: "bank",
    minRows: 7,
    exactRows: 7,
    expectedTrailingBalance: 537915.35,
    expectedStartDate: "2021-01-01",
    expectedEndDate: "2021-01-31",
    minConfidence: 90,
  },
  {
    label: "RCBC Savings Sample",
    relativePath: "Samples/RCBC/879866459-Statement.pdf",
    institution: "RCBC",
    accountName: "DARRYL B PALMA",
    accountNumber: "7-591-325080",
    accountType: "bank",
    minRows: 22,
    exactRows: 22,
    expectedOpeningBalance: 0.54,
    expectedTrailingBalance: 0.54,
    expectedStartDate: "2025-04-01",
    expectedEndDate: "2025-04-30",
    minConfidence: 90,
  },
  {
    label: "RCBC Visa Gold Sample",
    relativePath: "Samples/RCBC/728919236-Acfroga47rrwerw7v8xwjcyqjxnpvi1hv5climj2qkpdzsqlabwmr51pzid4mt-Ao-Swizece4lt1ycaubzsilpqnzohhyzqxuv2cfbldosfajyekhfijmkceso8yzz1vgjmwntbprxb5ribspge-G.pdf",
    institution: "RCBC",
    accountName: "ROCHELLE C TUGADE",
    accountNumber: "4293-8208-6552-2006",
    accountType: "credit_card",
    minRows: 5,
    exactRows: 5,
    expectedOpeningBalance: 5244.14,
    expectedTrailingBalance: 12359.11,
    expectedEndDate: "2024-04-03",
    minConfidence: 90,
  },
  {
    label: "Security Bank Proof of Account",
    relativePath: "Samples/Security Bank/663451412-Proof-of-Account.pdf",
    institution: "Security Bank",
    accountName: "Security Bank 5883",
    accountNumber: "0000036725883",
    accountType: "bank",
    minRows: 12,
    exactRows: 12,
    expectedOpeningBalance: 58.71,
    expectedTrailingBalance: 30044.36,
    expectedStartDate: "2023-03-31",
    expectedEndDate: "2023-04-28",
    minConfidence: 95,
  },
  {
    label: "Security Bank Sample Statement",
    relativePath: "Samples/Security Bank/748042099-Security-Bank-Statement-Gsr.pdf",
    institution: "Security Bank",
    accountName: "Security Bank 1852",
    accountNumber: "0000059711852",
    accountType: "bank",
    minRows: 8,
    exactRows: 8,
    expectedOpeningBalance: 24.8,
    expectedTrailingBalance: 1000.2,
    expectedStartDate: "2023-11-30",
    expectedEndDate: "2023-12-29",
    minConfidence: 90,
  },
  {
    label: "RCBC October 2025",
    relativePath: "Actual SOAs/RCBC/eStatement_VISA PLATINUM_OCT 22 2025_1014_unlocked.pdf",
    institution: "RCBC",
    accountName: "TIMOTHY GUNTHER S CAYANGA",
    accountNumber: "4279341138681014",
    accountType: "credit_card",
    minRows: 40,
    exactRows: 55,
    expectedOpeningBalance: 8994.44,
    expectedTrailingBalance: 37246.38,
    expectedEndDate: "2025-10-22",
    minConfidence: 90,
  },
  {
    label: "RCBC November 2025",
    relativePath: "Actual SOAs/RCBC/eStatement_VISA PLATINUM_NOV 23 2025_1014_unlocked.pdf",
    institution: "RCBC",
    accountName: "TIMOTHY GUNTHER S CAYANGA",
    accountNumber: "4279341138681014",
    accountType: "credit_card",
    minRows: 1,
    minConfidence: 90,
  },
  {
    label: "RCBC December 2025",
    relativePath: "Actual SOAs/RCBC/eStatement_VISA PLATINUM_DEC 22 2025_1014_unlocked.pdf",
    institution: "RCBC",
    accountName: "TIMOTHY GUNTHER S CAYANGA",
    accountNumber: "4279341138681014",
    accountType: "credit_card",
    minRows: 1,
    minConfidence: 90,
  },
  {
    label: "RCBC January 2026",
    relativePath: "Actual SOAs/RCBC/eStatement_VISA PLATINUM_JAN 22 2026_1014_unlocked.pdf",
    institution: "RCBC",
    accountName: "TIMOTHY GUNTHER S CAYANGA",
    accountNumber: "4279341138681014",
    accountType: "credit_card",
    minRows: 1,
    minConfidence: 90,
  },
  {
    label: "RCBC February 2026",
    relativePath: "Actual SOAs/RCBC/eStatement_VISA PLATINUM_FEB 22 2026_1014_unlocked.pdf",
    institution: "RCBC",
    accountName: "TIMOTHY GUNTHER S CAYANGA",
    accountNumber: "4279341138681014",
    accountType: "credit_card",
    minRows: 1,
    minConfidence: 90,
  },
  {
    label: "RCBC March 2026",
    relativePath: "Actual SOAs/RCBC/eStatement_VISA PLATINUM_MAR 22 2026_1014_unlocked.pdf",
    institution: "RCBC",
    accountName: "TIMOTHY GUNTHER S CAYANGA",
    accountNumber: "4279341138681014",
    accountType: "credit_card",
    minRows: 1,
    minConfidence: 90,
  },
  {
    label: "UnionBank November 2025",
    relativePath: "Actual SOAs/UnionBank/UnionBank SOA November 2025_unlocked.pdf",
    institution: "UnionBank of the Philippines",
    accountName: "Timothy Gunther Santos Cayanga",
    accountNumber: "109678428037",
    accountType: "bank",
    minRows: 5,
    exactRows: 5,
    expectedEndDate: "2026-04-14",
    minConfidence: 85,
  },
  {
    label: "UnionBank December 2025",
    relativePath: "Actual SOAs/UnionBank/UnionBank SOA December 2025_unlocked.pdf",
    institution: "UnionBank of the Philippines",
    accountName: "Timothy Gunther Santos Cayanga",
    accountNumber: "109678428037",
    accountType: "bank",
    minRows: 1,
    exactRows: 15,
    minConfidence: 85,
  },
  {
    label: "UnionBank January 2026",
    relativePath: "Actual SOAs/UnionBank/UnionBank SOA January 2026_unlocked.pdf",
    institution: "UnionBank of the Philippines",
    accountName: "Timothy Gunther Santos Cayanga",
    accountNumber: "109678428037",
    accountType: "bank",
    minRows: 4,
    exactRows: 4,
    minConfidence: 85,
  },
  {
    label: "UnionBank February 2026",
    relativePath: "Actual SOAs/UnionBank/UnionBank SOA February 2026_unlocked.pdf",
    institution: "UnionBank of the Philippines",
    accountName: "Timothy Gunther Santos Cayanga",
    accountNumber: "109678428037",
    accountType: "bank",
    minRows: 5,
    exactRows: 5,
    minConfidence: 85,
  },
  {
    label: "UnionBank March 2026",
    relativePath: "Actual SOAs/UnionBank/UnionBank SOA March 2026_unlocked.pdf",
    institution: "UnionBank of the Philippines",
    accountName: "Timothy Gunther Santos Cayanga",
    accountNumber: "109678428037",
    accountType: "bank",
    minRows: 7,
    exactRows: 7,
    minConfidence: 85,
  },
];

const coverageTargets: ParserCoverageItem[] = [
  { key: "BPI", label: "BPI" },
  { key: "BDO Unibank, Inc.", label: "BDO" },
  { key: "CIMB", label: "CIMB" },
  { key: "China Bank", label: "China Bank" },
  { key: "EastWest Bank", label: "EastWest" },
  { key: "GCash", label: "GCash" },
  { key: "GoTyme", label: "GoTyme" },
  { key: "Land Bank of the Philippines", label: "Landbank" },
  { key: "Maya Bank", label: "Maya" },
  { key: "PSBank", label: "PSBank" },
  { key: "RCBC", label: "RCBC" },
  { key: "Security Bank", label: "Security Bank" },
  { key: "United Coconut Planters Bank", label: "UCPB" },
  { key: "UnionBank of the Philippines", label: "UnionBank" },
];

const formatMoney = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return value.toFixed(2);
};

const approxEqual = (actual: number | null | undefined, expected: number, tolerance = 0.01) => {
  return typeof actual === "number" && Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
};

const parseDatePrefix = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  return value.slice(0, 10);
};

const normalizeCoverageKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const main = async () => {
  const rootArgIndex = process.argv.indexOf("--root");
  const root =
    rootArgIndex >= 0 && process.argv[rootArgIndex + 1]
      ? process.argv[rootArgIndex + 1]
      : process.env.CLOVER_STATEMENT_ROOT || defaultStatementRoot;

  const importFileTextModule = await import("../lib/import-file-text.server");
  const dataEngine = await import("../lib/data-engine");
  const dataQaBanksModule = await import("../lib/data-qa-banks");
  const accountDisplayModule = await import("../lib/account-display");
  const parser = await import("../lib/import-parser");
  const receiptAccountResolutionModule = await import("../lib/receipt-account-resolution");
  const splitBillModule = await import("../lib/split-bill");

  const readUploadedFileText = importFileTextModule.readUploadedFileText as (
    file: { name?: string; type?: string; arrayBuffer: () => Promise<ArrayBuffer | SharedArrayBuffer> },
    password?: string
  ) => Promise<string>;
  const detectStatementMetadataFromText = dataEngine.detectStatementMetadataFromText as (text: string) => {
    institution: string | null;
    accountNumber: string | null;
    accountName: string | null;
    openingBalance: number | null;
    endingBalance: number | null;
    startDate: string | null;
    endDate: string | null;
    confidence: number;
  };
  const normalizeBankName = dataQaBanksModule.normalizeBankName as (value: string | null | undefined) => string;
  const formatUploadAccountDisplayName = accountDisplayModule.formatUploadAccountDisplayName as (
    name?: string | null,
    institution?: string | null,
    accountNumber?: string | null,
    type?: string | null
  ) => string;
  const inferAccountTypeFromStatement = parser.inferAccountTypeFromStatement as (
      institution?: string | null,
      accountName?: string | null,
      fallback?: ImportedAccountType
    ) => ImportedAccountType;
  const parseReceiptText = splitBillModule.parseReceiptText as (receiptText: string) => {
    receiptText: string;
    merchantName: string | null;
    billDate: string | null;
    currency: string;
    currencyMentions: string[];
    currencyWarning: string | null;
    subtotal: string | null;
    serviceCharge: string | null;
    tax: string | null;
    tip: string | null;
    rounding: string | null;
    discount: string | null;
    total: string | null;
    paymentMethod: string | null;
    items: Array<{ description: string; amount: string; quantity?: number | null; unitPrice?: string | null; wrapped?: boolean }>;
    participants: string[];
    splitAllocations: Array<{ participantName: string; charged: string | null; paid: string | null; due: string | null; currency: string }>;
    receiptAccountMatch: { accountName: string | null; accountLast4: string | null; confidence: number; reason: string | null } | null;
    confidence: number;
  };
  const resolveReceiptAccountHintToAccount = receiptAccountResolutionModule.resolveReceiptAccountHintToAccount as (
    hint: {
      accountName: string | null;
      accountLast4: string | null;
      confidence: number;
      reason: string | null;
    } | null,
    accounts: Array<{
      id: string;
      name: string;
      institution: string | null;
      accountNumber: string | null;
      type: string;
      currency?: string | null;
    }>
  ) =>
    | {
        accountId: string;
        accountName: string;
        institution: string | null;
        accountLast4: string | null;
        confidence: number;
        reason: string;
      }
    | null;
  const splitBillDraftFromReceiptPreview = splitBillModule.splitBillDraftFromReceiptPreview as (
    preview: {
      receiptText: string;
      merchantName: string | null;
      billDate: string | null;
      currency: string;
      currencyMentions: string[];
      currencyWarning: string | null;
      subtotal: string | null;
      serviceCharge: string | null;
      tax: string | null;
      tip: string | null;
      rounding: string | null;
      discount: string | null;
      total: string | null;
      paymentMethod: string | null;
      items: Array<{ description: string; amount: string; quantity?: number | null; unitPrice?: string | null; wrapped?: boolean }>;
      participants: string[];
      splitAllocations: Array<{ participantName: string; charged: string | null; paid: string | null; due: string | null; currency: string }>;
      receiptAccountMatch: { accountName: string | null; accountLast4: string | null; confidence: number; reason: string | null } | null;
      confidence: number;
    }
  ) => {
    participants: Array<{ id: string; name: string }>;
    payments: Array<{ participantId: string; amount: string; note?: string | null }>;
    items: Array<{ description: string; amount: string }>;
    total?: string;
    rawPayload?: Record<string, unknown> | null;
  };

  const failures: string[] = [];

  for (const fixture of fixtures) {
    const absolutePath = join(root, fixture.relativePath);

    let bytes: Buffer;
    try {
      bytes = await readFile(absolutePath);
    } catch {
      failures.push(`[${fixture.label}] missing file: ${absolutePath}`);
      continue;
    }

    const fileName = basename(absolutePath);
    const text = await readUploadedFileText({
      name: fileName,
      type: "application/pdf",
      arrayBuffer: async () => {
        const copy = new Uint8Array(bytes.length);
        copy.set(bytes);
        return copy.buffer as ArrayBuffer;
      },
    });

    const metadata = detectStatementMetadataFromText(text);
    const rows = parser.parseImportText(text, fileName, "application/pdf", {
      institution: metadata.institution,
      accountName: metadata.accountName,
      accountNumber: metadata.accountNumber,
    });
    const trailingBalance = parser.getTrailingBalanceFromParsedRows(rows);
    const accountType =
      (metadata as { accountType?: ImportedAccountType | null }).accountType ??
      inferAccountTypeFromStatement(metadata.institution, metadata.accountName, "bank");

    const errors: string[] = [];

    if (metadata.institution !== fixture.institution) {
      errors.push(`institution expected ${fixture.institution} but got ${metadata.institution ?? "null"}`);
    }
    if (metadata.accountName !== fixture.accountName) {
      errors.push(`accountName expected ${fixture.accountName} but got ${metadata.accountName ?? "null"}`);
    }
    if (metadata.accountNumber !== fixture.accountNumber) {
      errors.push(`accountNumber expected ${fixture.accountNumber} but got ${metadata.accountNumber ?? "null"}`);
    }
    if (accountType !== fixture.accountType) {
      errors.push(`accountType expected ${fixture.accountType} but got ${accountType}`);
    }
    if (rows.length < fixture.minRows) {
      errors.push(`rowCount expected at least ${fixture.minRows} but got ${rows.length}`);
    }
    if (fixture.exactRows !== undefined && rows.length !== fixture.exactRows) {
      errors.push(`rowCount expected ${fixture.exactRows} but got ${rows.length}`);
    }
    if (typeof fixture.minConfidence === "number" && metadata.confidence < fixture.minConfidence) {
      errors.push(`confidence expected at least ${fixture.minConfidence} but got ${metadata.confidence}`);
    }
    if (fixture.expectedOpeningBalance !== undefined && !approxEqual(metadata.openingBalance, fixture.expectedOpeningBalance)) {
      errors.push(`openingBalance expected ${formatMoney(fixture.expectedOpeningBalance)} but got ${formatMoney(metadata.openingBalance)}`);
    }
    const derivedEndingBalance = metadata.endingBalance ?? trailingBalance;
    if (fixture.expectedTrailingBalance !== undefined && !approxEqual(derivedEndingBalance, fixture.expectedTrailingBalance)) {
      errors.push(`endingBalance expected ${formatMoney(fixture.expectedTrailingBalance)} but got ${formatMoney(derivedEndingBalance)}`);
    }
    if (fixture.expectedStartDate && parseDatePrefix(metadata.startDate) !== fixture.expectedStartDate) {
      errors.push(`startDate expected ${fixture.expectedStartDate} but got ${parseDatePrefix(metadata.startDate) ?? "null"}`);
    }
    if (fixture.expectedEndDate && parseDatePrefix(metadata.endDate) !== fixture.expectedEndDate) {
      errors.push(`endDate expected ${fixture.expectedEndDate} but got ${parseDatePrefix(metadata.endDate) ?? "null"}`);
    }
    if (fixture.expectParsedAccountName !== false && !rows.some((row) => row.accountName === fixture.accountName)) {
      errors.push("parsed rows do not include the expected account name");
    }
    if (!rows.some((row) => row.institution === fixture.institution)) {
      errors.push("parsed rows do not include the expected institution");
    }
    if (fixture.expectedTrailingBalance !== undefined && rows.length > 0) {
      const lastRow = rows[rows.length - 1];
      const lastBalance = lastRow.rawPayload?.balance;
      if (typeof lastBalance === "number" && !approxEqual(lastBalance, fixture.expectedTrailingBalance)) {
        errors.push(`last row balance expected ${formatMoney(fixture.expectedTrailingBalance)} but got ${formatMoney(lastBalance)}`);
      }
    }

    if (errors.length > 0) {
      failures.push(`[${fixture.label}] ${errors.join("; ")}`);
      continue;
    }

    console.log(
      `[PASS] ${fixture.label} | ${fixture.accountName} | ${rows.length} rows | ${accountType} | opening ${formatMoney(metadata.openingBalance)} | trailing ${formatMoney(trailingBalance)}`
    );
  }

  if (failures.length > 0) {
    throw new Error(`Parser regression checks failed:\n${failures.map((entry) => `- ${entry}`).join("\n")}`);
  }

  const bdoPath = join(root, "Samples/BDO/648293940-BDO.pdf");
  const bdoBytes = await readFile(bdoPath);
  const bdoText = await readUploadedFileText({
    name: basename(bdoPath),
    type: "application/pdf",
    arrayBuffer: async () => {
      const copy = new Uint8Array(bdoBytes.length);
      copy.set(bdoBytes);
      return copy.buffer as ArrayBuffer;
    },
  });
  const bdoMetadata = detectStatementMetadataFromText(bdoText);
  const bdoRows = parser.parseImportText(bdoText, basename(bdoPath), "application/pdf", {
    institution: bdoMetadata.institution,
    accountName: bdoMetadata.accountName,
    accountNumber: bdoMetadata.accountNumber,
  });
  if (!bdoRows.some((row) => /bank\s+transfer|pob\s+ibft|fund\s+transfer/i.test(row.description ?? "") && row.type === "transfer" && row.categoryName === "Transfers")) {
    throw new Error("expected BDO bank transfer rows to classify as transfer");
  }
  if (!bdoRows.some((row) => /atm\s+withdrawal|w\/d\s+fr\s+sav|cash\s+withdrawal|wdrawal/i.test(row.description ?? "") && row.type === "expense" && row.categoryName === "Cash & ATM")) {
    throw new Error("expected BDO withdrawal rows to classify as expense");
  }
  console.log("[PASS] BDO classification | bank transfer and withdrawal rows classified correctly");

  const mayaSamplesDir = join(root, "Samples/Maya");
  const mayaSampleFiles = (await readdir(mayaSamplesDir)).filter((entry) => /\.pdf$/i.test(entry)).sort();
  for (const mayaFile of mayaSampleFiles) {
    const mayaPath = join(mayaSamplesDir, mayaFile);
    const mayaBytes = await readFile(mayaPath);
    const mayaText = await readUploadedFileText({
      name: basename(mayaPath),
      type: "application/pdf",
      arrayBuffer: async () => {
        const copy = new Uint8Array(mayaBytes.length);
        copy.set(mayaBytes);
        return copy.buffer as ArrayBuffer;
      },
    });
    const mayaMetadata = detectStatementMetadataFromText(mayaText);
    const mayaRows = parser.parseImportText(mayaText, basename(mayaPath), "application/pdf", {
      institution: mayaMetadata.institution,
      accountName: mayaMetadata.accountName,
      accountNumber: mayaMetadata.accountNumber,
    });
    const expectedMayaAccountType = /easy\s*credit|maya\s*credit/i.test(mayaFile) ? "line_of_credit" : "bank";
    const mayaAccountType = (mayaMetadata as { accountType?: string | null }).accountType ?? null;
    if (mayaAccountType !== expectedMayaAccountType) {
      throw new Error(`expected ${mayaFile} to classify as ${expectedMayaAccountType}, got ${mayaAccountType ?? "missing"}`);
    }

    const problematicRows = mayaRows.filter((row) => {
      const confidence = typeof row.confidence === "number" ? row.confidence : 0;
      if (confidence < 90 || row.categoryName === "Other") {
        return true;
      }

      if (row.categoryName === "Income") {
        return row.type !== "income";
      }

      if (row.categoryName === "Financial") {
        return row.type !== "expense";
      }

      if (row.categoryName === "Transfers") {
        return row.type !== "transfer";
      }

      return false;
    });

    if (problematicRows.length > 0) {
      const sample = problematicRows
        .slice(0, 5)
        .map((row) => `${row.description ?? row.merchantRaw ?? "missing"}:${row.categoryName}/${row.type}/${row.confidence ?? "no-confidence"}`)
        .join(", ");
      throw new Error(`expected Maya rows to finalize deterministically for ${mayaFile}; problematic rows: ${sample}`);
    }

    if (/2023DEC/i.test(mayaFile)) {
      const counts = mayaRows.reduce<Record<string, number>>((accumulator, row) => {
        const key = `${row.categoryName}:${row.type}`;
        accumulator[key] = (accumulator[key] ?? 0) + 1;
        return accumulator;
      }, {});
      const expectedCounts: Record<string, number> = {
        "Income:income": 29,
        "Financial:expense": 10,
        "Transfers:transfer": 21,
      };
      for (const [key, expected] of Object.entries(expectedCounts)) {
        if (counts[key] !== expected) {
          throw new Error(`expected Maya December 2023 ${key} count ${expected}, got ${counts[key] ?? 0}`);
        }
      }
    }
  }
  console.log(`[PASS] Maya classification | ${mayaSampleFiles.length} samples finalize without low-confidence Other rows`);

  const dateStampedBankName = normalizeBankName("2026-05-01 22.01.12 0112");
  if (dateStampedBankName !== "Unknown") {
    throw new Error(`expected date-stamped bank label to normalize to Unknown but got ${dateStampedBankName}`);
  }

  const dateStampedAlias = normalizeBankName("2026-05-01 BDO");
  if (dateStampedAlias !== "BDO") {
    throw new Error(`expected bank alias inside date-stamped label to normalize to BDO but got ${dateStampedAlias}`);
  }

  const safeDisplayName = formatUploadAccountDisplayName("2026-05-01 22.01.12 0112", "2026-05-01 22.01.12 0112", "001234567890", "bank");
  if (/\b2026-05-01\b/.test(safeDisplayName) || /\b22\.01\.12\b/.test(safeDisplayName)) {
    throw new Error(`expected date-stamped upload display name to omit date text but got ${safeDisplayName}`);
  }
  console.log("[PASS] Bank label hygiene | date-stamped labels are rejected or sanitized");

  const rcbcCreditPath = join(root, "Samples/RCBC/728919236-Acfroga47rrwerw7v8xwjcyqjxnpvi1hv5climj2qkpdzsqlabwmr51pzid4mt-Ao-Swizece4lt1ycaubzsilpqnzohhyzqxuv2cfbldosfajyekhfijmkceso8yzz1vgjmwntbprxb5ribspge-G.pdf");
  const rcbcCreditBytes = await readFile(rcbcCreditPath);
  const rcbcCreditText = await readUploadedFileText({
    name: basename(rcbcCreditPath),
    type: "application/pdf",
    arrayBuffer: async () => {
      const copy = new Uint8Array(rcbcCreditBytes.length);
      copy.set(rcbcCreditBytes);
      return copy.buffer as ArrayBuffer;
    },
  });
  const rcbcCreditMetadata = detectStatementMetadataFromText(rcbcCreditText);
  const rcbcCreditRows = parser.parseImportText(rcbcCreditText, basename(rcbcCreditPath), "application/pdf", {
    institution: rcbcCreditMetadata.institution,
    accountName: rcbcCreditMetadata.accountName,
    accountNumber: rcbcCreditMetadata.accountNumber,
  });
  const rcbcCashPaymentRow = rcbcCreditRows.find((row) => /^cash payment$/i.test(String(row.description ?? row.merchantRaw ?? "")));
  if (!rcbcCashPaymentRow || rcbcCashPaymentRow.type !== "expense" || rcbcCashPaymentRow.categoryName !== "Shopping") {
    throw new Error(
      `expected standalone RCBC Cash Payment to classify as Shopping expense, got ${rcbcCashPaymentRow?.categoryName ?? "missing"} ${rcbcCashPaymentRow?.type ?? "missing"}`
    );
  }
  console.log("[PASS] RCBC classification | standalone Cash Payment rows classify as Shopping expense");

  const metrobankCreditPath = join(root, "Samples/Metrobank/412340326-compressor.pdf");
  const metrobankCreditBytes = await readFile(metrobankCreditPath);
  const metrobankCreditText = await readUploadedFileText({
    name: basename(metrobankCreditPath),
    type: "application/pdf",
    arrayBuffer: async () => {
      const copy = new Uint8Array(metrobankCreditBytes.length);
      copy.set(metrobankCreditBytes);
      return copy.buffer as ArrayBuffer;
    },
  });
  const metrobankCreditMetadata = detectStatementMetadataFromText(metrobankCreditText);
  const metrobankCreditRows = parser.parseImportText(metrobankCreditText, basename(metrobankCreditPath), "application/pdf", {
    institution: metrobankCreditMetadata.institution,
    accountName: metrobankCreditMetadata.accountName,
    accountNumber: metrobankCreditMetadata.accountNumber,
  });
  const metrobankCashPaymentRow = metrobankCreditRows.find((row) => /cash payment/i.test(String(row.description ?? row.merchantRaw ?? "")));
  if (!metrobankCashPaymentRow || metrobankCashPaymentRow.type !== "transfer" || metrobankCashPaymentRow.categoryName !== "Transfers") {
    throw new Error(
      `expected Metrobank Cash Payment statement settlement to stay as Transfers, got ${metrobankCashPaymentRow?.categoryName ?? "missing"} ${metrobankCashPaymentRow?.type ?? "missing"}`
    );
  }
  console.log("[PASS] Metrobank classification | Cash Payment settlement rows stay as Transfers");

  const guessCategoryFallback = dataEngine.guessCategoryFallback as (description: string, type: "income" | "expense" | "transfer") => string;
  const enrichmentFallbackExpectations: Array<[string, "income" | "expense" | "transfer", string]> = [
    ["Incoming Interbank Transfer", "income", "Transfers"],
    ["Outgoing Interbank Transfer", "expense", "Transfers"],
    ["System Debit", "expense", "Transfers"],
    ["Interbank Service Charge", "expense", "Financial"],
    ["ATM Withdrawal", "expense", "Cash & ATM"],
    ["Cash/Check Deposit", "income", "Income"],
    ["Interest Earned", "income", "Income"],
    ["Tax Withheld", "expense", "Financial"],
    ["Finance Charges", "expense", "Financial"],
    ["Cash Payment", "expense", "Shopping"],
    ["Cash Payment - Thank You - MB ATM", "income", "Transfers"],
    ["Card Payment", "income", "Transfers"],
  ];
  for (const [description, type, expectedCategory] of enrichmentFallbackExpectations) {
    const actualCategory = guessCategoryFallback(description, type);
    if (actualCategory !== expectedCategory) {
      throw new Error(`expected enrichment fallback ${description} to classify as ${expectedCategory}, got ${actualCategory}`);
    }
  }
  console.log("[PASS] enrichment fallback | normalized bank labels classify without falling back to Other");

  const chinaBankPath = join(root, "Samples/China Bank/860976948-CHINA-BANK-STATEMENT.pdf");
  try {
    const chinaBankBytes = await readFile(chinaBankPath);
    const chinaBankText = await readUploadedFileText({
      name: chinaBankPath.split("/").at(-1),
      type: "application/pdf",
      arrayBuffer: async () => {
        const copy = new Uint8Array(chinaBankBytes.length);
        copy.set(chinaBankBytes);
        return copy.buffer as ArrayBuffer;
      },
    });
    const chinaBankMetadata = detectStatementMetadataFromText(chinaBankText);
    const chinaBankRows = parser.parseImportText(chinaBankText, chinaBankPath.split("/").at(-1)!, "application/pdf", {
      institution: chinaBankMetadata.institution,
      accountName: chinaBankMetadata.accountName,
      accountNumber: chinaBankMetadata.accountNumber,
    });
    if (chinaBankRows.length !== 0) {
      throw new Error(`expected fail-closed fallback but got ${chinaBankRows.length} local rows`);
    }
    console.log(`[PASS] China Bank fallback | 0 local rows | routed to OCR fallback`);
  } catch (error) {
    failures.push(
      `[China Bank fallback] ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const noisyFallbackChecks = [
    {
      label: "EastWest fallback",
      path: join(root, "Samples/EastWest Bank/Philippines EastWest bank statement template in Excel and PDF format.pdf"),
      institution: "EastWest Bank",
    },
    {
      label: "Landbank fallback",
      path: join(root, "Samples/Landbank/Philippines Land Bank of the Philippines word.pdf"),
      institution: "Landbank",
    },
    {
      label: "UCPB fallback",
      path: join(root, "Samples/UCPB/Philippines UCPB bank statement.pdf"),
      institution: "UCPB",
    },
  ] as const;

  for (const check of noisyFallbackChecks) {
    try {
      const bytes = await readFile(check.path);
      const text = await readUploadedFileText({
        name: check.path.split("/").at(-1),
        type: "application/pdf",
        arrayBuffer: async () => {
          const copy = new Uint8Array(bytes.length);
          copy.set(bytes);
          return copy.buffer as ArrayBuffer;
        },
      });
      const metadata = detectStatementMetadataFromText(text);
      const rows = parser.parseImportText(text, check.path.split("/").at(-1)!, "application/pdf", {
        institution: metadata.institution ?? check.institution,
        accountName: metadata.accountName,
        accountNumber: metadata.accountNumber,
      });
      if (rows.length !== 0) {
        throw new Error(`expected fail-closed fallback but got ${rows.length} local rows`);
      }
      console.log(`[PASS] ${check.label} | 0 local rows | routed to OCR fallback`);
    } catch (error) {
      failures.push(`[${check.label}] ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const eastWestSyntheticText = [
    "EASTWEST BANK",
    "ACCOUNT STATEMENT",
    "Book Date Reference Description Value Date Cheque No. Debit Credit Closing Balance",
    "20 Jan 22 TT220224YCCF Cash Deposit 20 Jan 22 5000.00",
    "24 Jan 22 TT22024MPDF5269 Cash Deposit 24 Jan 22 6000.00",
    "02 Feb 22 TT220338ACT122 Outward Cheque Dr / Cheque Enlistment 02 Feb 22 4500.00",
    "02 Feb 22 PCH2122020212116 Transfer SUCCESSFUL 02 Feb 22 12000.00",
    "Balance at Period Start 0.00",
  ].join("\n");
  const eastWestSyntheticRows = parser.parseImportText(
    eastWestSyntheticText,
    "eastwest-synthetic.pdf",
    "application/pdf",
    { institution: "EastWest Bank" }
  );
  if (eastWestSyntheticRows.length < 4) {
    throw new Error(`expected EastWest synthetic template parser to produce rows, got ${eastWestSyntheticRows.length}`);
  }
  if (eastWestSyntheticRows[0]?.institution !== "EastWest Bank") {
    throw new Error(`expected EastWest synthetic parser to preserve institution, got ${eastWestSyntheticRows[0]?.institution ?? "null"}`);
  }
  if (eastWestSyntheticRows[0]?.type !== "income") {
    throw new Error(`expected EastWest synthetic cash deposit to classify as income, got ${eastWestSyntheticRows[0]?.type ?? "null"}`);
  }
  if (!eastWestSyntheticRows.some((row) => row.description === "Transfer SUCCESSFUL" && row.type === "transfer")) {
    throw new Error("expected EastWest synthetic transfer row to classify as transfer");
  }

  const itemizedReceiptPreview = parseReceiptText([
    "BASIL PASTA HOUSE",
    "Jan 12, 2026",
    "2 x Sandwich 50.00 100.00",
    "Coffee 30.00",
    "3 x Cookie 10.00 30.00",
    "Subtotal 160.00",
    "Tax 12.80",
    "Total 172.80",
  ].join("\n"));
  if (itemizedReceiptPreview.items.length !== 3) {
    throw new Error(`expected itemized receipt to produce 3 line items, got ${itemizedReceiptPreview.items.length}`);
  }
  if (itemizedReceiptPreview.items[0]?.quantity !== 2 || itemizedReceiptPreview.items[0]?.unitPrice !== "50.00") {
    throw new Error(
      `expected first item to capture quantity and unit price, got quantity=${itemizedReceiptPreview.items[0]?.quantity ?? "null"} unitPrice=${itemizedReceiptPreview.items[0]?.unitPrice ?? "null"}`
    );
  }
  if (itemizedReceiptPreview.total !== "172.80" || itemizedReceiptPreview.confidence < 80) {
    throw new Error(
      `expected itemized receipt to reconcile with strong confidence, got total=${itemizedReceiptPreview.total ?? "null"} confidence=${itemizedReceiptPreview.confidence}`
    );
  }

  const wrappedItemReceiptPreview = parseReceiptText([
    "THE CAFE",
    "Family Combo",
    "2 x Sandwich 50.00 100.00",
    "Total 100.00",
  ].join("\n"));
  if (wrappedItemReceiptPreview.items.length !== 1) {
    throw new Error(`expected wrapped item receipt to produce 1 line item, got ${wrappedItemReceiptPreview.items.length}`);
  }
  if (wrappedItemReceiptPreview.items[0]?.description.includes("THE CAFE")) {
    throw new Error(
      `expected merchant title not to bleed into wrapped item description, got ${wrappedItemReceiptPreview.items[0]?.description ?? "null"}`
    );
  }
  if (wrappedItemReceiptPreview.confidence < 70) {
    throw new Error(`expected wrapped item receipt to retain decent confidence, got ${wrappedItemReceiptPreview.confidence}`);
  }

  const digitTitleReceiptPreview = parseReceiptText([
    "WRAPPED2",
    "Burger",
    "Extra cheese",
    "120.00",
    "Total 120.00",
  ].join("\n"));
  if (digitTitleReceiptPreview.items.length !== 1) {
    throw new Error(`expected digit-title receipt to produce 1 line item, got ${digitTitleReceiptPreview.items.length}`);
  }
  if (digitTitleReceiptPreview.items[0]?.description.includes("WRAPPED2")) {
    throw new Error(
      `expected digit-title token not to bleed into item description, got ${digitTitleReceiptPreview.items[0]?.description ?? "null"}`
    );
  }
  if (digitTitleReceiptPreview.confidence < 65) {
    throw new Error(`expected digit-title wrapped receipt to retain usable confidence, got ${digitTitleReceiptPreview.confidence}`);
  }

  const modifierReceiptPreview = parseReceiptText([
    "THE BURGER BAR",
    "Burger 120.00",
    "No onions",
    "Fries 40.00",
    "Extra cheese",
    "Total 160.00",
  ].join("\n"));
  if (modifierReceiptPreview.items.length !== 2) {
    throw new Error(`expected modifier receipt to produce 2 line items, got ${modifierReceiptPreview.items.length}`);
  }
  if (!modifierReceiptPreview.items[0]?.description.toLowerCase().includes("no onions")) {
    throw new Error(
      `expected first item to retain modifier text, got ${modifierReceiptPreview.items[0]?.description ?? "null"}`
    );
  }
  if (!modifierReceiptPreview.items[1]?.description.toLowerCase().includes("extra cheese")) {
    throw new Error(
      `expected second item to retain modifier text, got ${modifierReceiptPreview.items[1]?.description ?? "null"}`
    );
  }
  if (modifierReceiptPreview.confidence < 72) {
    throw new Error(`expected modifier receipt to retain solid confidence, got ${modifierReceiptPreview.confidence}`);
  }

  const addonReceiptPreview = parseReceiptText([
    "THE BURGER BAR",
    "Burger 120.00",
    "Add cheese 10.00",
    "Fries 40.00",
    "Total 170.00",
  ].join("\n"));
  if (addonReceiptPreview.items.length !== 2) {
    throw new Error(`expected addon receipt to produce 2 line items, got ${addonReceiptPreview.items.length}`);
  }
  if (addonReceiptPreview.items[0]?.amount !== "130.00") {
    throw new Error(`expected addon line to fold into burger total of 130.00, got ${addonReceiptPreview.items[0]?.amount ?? "null"}`);
  }
  if (!addonReceiptPreview.items[0]?.description.toLowerCase().includes("add cheese")) {
    throw new Error(
      `expected addon line to be reflected in the first description, got ${addonReceiptPreview.items[0]?.description ?? "null"}`
    );
  }
  if (addonReceiptPreview.confidence < 82) {
    throw new Error(`expected addon receipt to retain strong confidence, got ${addonReceiptPreview.confidence}`);
  }

  const comboReceiptPreview = parseReceiptText([
    "THE BURGER BAR",
    "Combo Meal",
    "Burger 120.00",
    "+ Cheese 10.00",
    "Fries 40.00",
    "- Discount 20.00",
    "Total 150.00",
  ].join("\n"));
  if (comboReceiptPreview.items.length !== 2) {
    throw new Error(`expected combo receipt to produce 2 line items, got ${comboReceiptPreview.items.length}`);
  }
  if (comboReceiptPreview.items[0]?.amount !== "130.00") {
    throw new Error(`expected combo add-on to fold into burger total of 130.00, got ${comboReceiptPreview.items[0]?.amount ?? "null"}`);
  }
  if (comboReceiptPreview.discount !== "20.00") {
    throw new Error(`expected combo discount to be captured as a receipt-level discount, got ${comboReceiptPreview.discount ?? "null"}`);
  }
  if (!comboReceiptPreview.items[0]?.description.toLowerCase().includes("cheese")) {
    throw new Error(
      `expected combo add-on text to be preserved on the first item, got ${comboReceiptPreview.items[0]?.description ?? "null"}`
    );
  }
  if (comboReceiptPreview.confidence < 82) {
    throw new Error(`expected combo receipt to retain strong confidence, got ${comboReceiptPreview.confidence}`);
  }

  const summaryReceiptPreview = parseReceiptText([
    "THE FAMILY TABLE",
    "Burger 100.00",
    "Fries 50.00",
    "Service Charge 15.00",
    "Discount 10.00",
    "Subtotal 150.00",
    "Tax 9.00",
    "Total 164.00",
  ].join("\n"));
  if (summaryReceiptPreview.items.length !== 2) {
    throw new Error(`expected summary receipt to produce 2 item lines, got ${summaryReceiptPreview.items.length}`);
  }
  if (summaryReceiptPreview.subtotal !== "150.00" || summaryReceiptPreview.tax !== "9.00" || summaryReceiptPreview.discount !== "10.00") {
    throw new Error(
      `expected summary receipt to capture subtotal/tax/discount, got subtotal=${summaryReceiptPreview.subtotal ?? "null"} tax=${summaryReceiptPreview.tax ?? "null"} discount=${summaryReceiptPreview.discount ?? "null"}`
    );
  }
  if (summaryReceiptPreview.serviceCharge !== "15.00") {
    throw new Error(
      `expected summary receipt to capture service charge, got ${summaryReceiptPreview.serviceCharge ?? "null"}`
    );
  }
  if (summaryReceiptPreview.total !== "164.00") {
    throw new Error(`expected summary receipt total 164.00, got ${summaryReceiptPreview.total ?? "null"}`);
  }
  if (summaryReceiptPreview.confidence < 84) {
    throw new Error(`expected summary receipt to retain strong confidence, got ${summaryReceiptPreview.confidence}`);
  }

  const tipAndRoundingPreview = parseReceiptText([
    "THE FAMILY TABLE",
    "Burger 100.00",
    "Fries 50.00",
    "Tip 20.00",
    "Round Off -0.50",
    "Void Water 5.00",
    "Refund 5.00",
    "Subtotal 150.00",
    "Tax 9.00",
    "Total 178.50",
  ].join("\n"));
  if (tipAndRoundingPreview.items.length !== 2) {
    throw new Error(`expected tip/rounding receipt to produce 2 item lines, got ${tipAndRoundingPreview.items.length}`);
  }
  if (tipAndRoundingPreview.tip !== "20.00" || tipAndRoundingPreview.rounding !== "-0.50") {
    throw new Error(
      `expected tip/rounding receipt to capture tip and rounding, got tip=${tipAndRoundingPreview.tip ?? "null"} rounding=${tipAndRoundingPreview.rounding ?? "null"}`
    );
  }
  if (tipAndRoundingPreview.total !== "178.50") {
    throw new Error(`expected tip/rounding receipt total 178.50, got ${tipAndRoundingPreview.total ?? "null"}`);
  }
  if (tipAndRoundingPreview.items.some((item) => /void|refund/i.test(item.description))) {
    throw new Error("expected void/refund lines not to become receipt items");
  }
  if (tipAndRoundingPreview.confidence < 84) {
    throw new Error(`expected tip/rounding receipt to retain strong confidence, got ${tipAndRoundingPreview.confidence}`);
  }

  const sectionedReceiptPreview = parseReceiptText([
    "CAFE",
    "MAIN COURSE",
    "Burger 120.00",
    "Sides",
    "Fries 40.00",
    "DRINKS",
    "Soda 30.00",
    "Total 190.00",
  ].join("\n"));
  if (sectionedReceiptPreview.items.length !== 3) {
    throw new Error(`expected sectioned receipt to produce 3 item lines, got ${sectionedReceiptPreview.items.length}`);
  }
  if (sectionedReceiptPreview.items.some((item) => /main course|sides|drinks/i.test(item.description))) {
    throw new Error("expected section headers not to bleed into item descriptions");
  }
  if (sectionedReceiptPreview.confidence < 86) {
    throw new Error(`expected sectioned receipt to retain strong confidence, got ${sectionedReceiptPreview.confidence}`);
  }

  const nestedSectionReceiptPreview = parseReceiptText([
    "CAFE",
    "BURGERS",
    "CLASSIC:",
    "Burger 120.00",
    "SIDES",
    "FRIES:",
    "Fries 40.00",
    "DRINKS",
    "Soda 30.00",
    "Total 190.00",
  ].join("\n"));
  if (nestedSectionReceiptPreview.items.length !== 3) {
    throw new Error(`expected nested-section receipt to produce 3 item lines, got ${nestedSectionReceiptPreview.items.length}`);
  }
  if (nestedSectionReceiptPreview.items.some((item) => /burgers|classic:|sides\b|drinks\b/i.test(item.description))) {
    throw new Error("expected nested section headers not to bleed into item descriptions");
  }
  if (nestedSectionReceiptPreview.confidence < 88) {
    throw new Error(`expected nested-section receipt to retain strong confidence, got ${nestedSectionReceiptPreview.confidence}`);
  }

  const bareQuantityReceiptPreview = parseReceiptText([
    "CAFE",
    "1 Burger 120.00",
    "2 Fries 40.00",
    "Total 200.00",
  ].join("\n"));
  if (bareQuantityReceiptPreview.items.length !== 2) {
    throw new Error(`expected bare-quantity receipt to produce 2 item lines, got ${bareQuantityReceiptPreview.items.length}`);
  }
  if (bareQuantityReceiptPreview.items[0]?.quantity !== 1 || bareQuantityReceiptPreview.items[1]?.quantity !== 2) {
    throw new Error(
      `expected bare-quantity receipt to capture quantities, got ${bareQuantityReceiptPreview.items
        .map((item) => item.quantity ?? "null")
        .join(", ")}`
    );
  }
  if (bareQuantityReceiptPreview.confidence < 80) {
    throw new Error(`expected bare-quantity receipt to retain strong confidence, got ${bareQuantityReceiptPreview.confidence}`);
  }

  const multiColumnReceiptPreview = parseReceiptText([
    "THE DINER",
    "Burger 50.00 100.00",
    "Fries 40.00 40.00",
    "Total 140.00",
  ].join("\n"));
  if (multiColumnReceiptPreview.items.length !== 2) {
    throw new Error(`expected multi-column receipt to produce 2 item lines, got ${multiColumnReceiptPreview.items.length}`);
  }
  if (multiColumnReceiptPreview.items[0]?.quantity !== 2 || multiColumnReceiptPreview.items[0]?.unitPrice !== "50.00") {
    throw new Error(
      `expected multi-column receipt to infer quantity 2 and unit price 50.00, got quantity=${multiColumnReceiptPreview.items[0]?.quantity ?? "null"} unitPrice=${multiColumnReceiptPreview.items[0]?.unitPrice ?? "null"}`
    );
  }
  if (multiColumnReceiptPreview.confidence < 84) {
    throw new Error(`expected multi-column receipt to retain strong confidence, got ${multiColumnReceiptPreview.confidence}`);
  }

  const droppedXQuantityReceiptPreview = parseReceiptText([
    "THE DINER",
    "Burger 2 50.00 100.00",
    "Fries 1 40.00 40.00",
    "Total 140.00",
  ].join("\n"));
  if (droppedXQuantityReceiptPreview.items.length !== 2) {
    throw new Error(`expected dropped-x quantity receipt to produce 2 item lines, got ${droppedXQuantityReceiptPreview.items.length}`);
  }
  if (
    droppedXQuantityReceiptPreview.items[0]?.quantity !== 2 ||
    droppedXQuantityReceiptPreview.items[0]?.unitPrice !== "50.00" ||
    droppedXQuantityReceiptPreview.items[0]?.amount !== "100.00"
  ) {
    throw new Error(
      `expected dropped-x receipt to infer quantity 2 / unit price 50.00 / amount 100.00, got quantity=${droppedXQuantityReceiptPreview.items[0]?.quantity ?? "null"} unitPrice=${droppedXQuantityReceiptPreview.items[0]?.unitPrice ?? "null"} amount=${droppedXQuantityReceiptPreview.items[0]?.amount ?? "null"}`
    );
  }
  if (droppedXQuantityReceiptPreview.confidence < 84) {
    throw new Error(`expected dropped-x quantity receipt to retain strong confidence, got ${droppedXQuantityReceiptPreview.confidence}`);
  }

  const fragmentedItemReceiptPreview = parseReceiptText([
    "CAFE",
    "Burg",
    "er 120.00",
    "Fries 40.00",
    "Total 160.00",
  ].join("\n"));
  if (fragmentedItemReceiptPreview.items.length !== 2) {
    throw new Error(`expected fragmented-item receipt to produce 2 item lines, got ${fragmentedItemReceiptPreview.items.length}`);
  }
  if (fragmentedItemReceiptPreview.items[0]?.description !== "Burger") {
    throw new Error(
      `expected fragmented-item receipt to rebuild Burger, got ${fragmentedItemReceiptPreview.items[0]?.description ?? "null"}`
    );
  }
  if (fragmentedItemReceiptPreview.confidence < 80) {
    throw new Error(`expected fragmented-item receipt to retain strong confidence, got ${fragmentedItemReceiptPreview.confidence}`);
  }

  const punctuatedFragmentReceiptPreview = parseReceiptText([
    "CAFE",
    "B.",
    "u.",
    "r.",
    "g.",
    "e.",
    "r.",
    "120.00",
    "Total 120.00",
  ].join("\n"));
  if (punctuatedFragmentReceiptPreview.items.length !== 1 || punctuatedFragmentReceiptPreview.items[0]?.description !== "Burger") {
    throw new Error(
      `expected punctuated fragment receipt to rebuild Burger, got ${punctuatedFragmentReceiptPreview.items[0]?.description ?? "null"}`
    );
  }
  if (punctuatedFragmentReceiptPreview.confidence < 80) {
    throw new Error(`expected punctuated fragment receipt to retain strong confidence, got ${punctuatedFragmentReceiptPreview.confidence}`);
  }

  const spacedFragmentReceiptPreview = parseReceiptText([
    "CAFE",
    "B u",
    "r g",
    "e r",
    "120.00",
    "Total 120.00",
  ].join("\n"));
  if (spacedFragmentReceiptPreview.items.length !== 1 || spacedFragmentReceiptPreview.items[0]?.description !== "Burger") {
    throw new Error(
      `expected spaced fragment receipt to rebuild Burger, got ${spacedFragmentReceiptPreview.items[0]?.description ?? "null"}`
    );
  }
  if (spacedFragmentReceiptPreview.confidence < 80) {
    throw new Error(`expected spaced fragment receipt to retain strong confidence, got ${spacedFragmentReceiptPreview.confidence}`);
  }

  const singleLetterFragmentReceiptPreview = parseReceiptText([
    "CAFE",
    "B",
    "u",
    "r",
    "g",
    "e",
    "r 120.00",
    "Total 120.00",
  ].join("\n"));
  if (singleLetterFragmentReceiptPreview.items.length !== 1 || singleLetterFragmentReceiptPreview.items[0]?.description !== "Burger") {
    throw new Error(
      `expected single-letter fragment receipt to rebuild Burger, got ${singleLetterFragmentReceiptPreview.items[0]?.description ?? "null"}`
    );
  }
  if (singleLetterFragmentReceiptPreview.confidence < 82) {
    throw new Error(`expected single-letter fragment receipt to retain strong confidence, got ${singleLetterFragmentReceiptPreview.confidence}`);
  }

  const receiptPreview = parseReceiptText([
    "THE BAKERY",
    "Jan 12, 2026",
    "Paid with Visa ending 4321",
    "Sandwich 50.00",
    "Coffee 30.00",
    "Total 80.00",
    "Split Bill",
    "Alice 50.00 40.00 10.00",
    "Bob 30.00 30.00 0.00",
  ].join("\n"));
  if (receiptPreview.participants.length !== 2 || receiptPreview.splitAllocations.length !== 2) {
    throw new Error(
      `expected receipt parser to capture split participants and allocations, got ${receiptPreview.participants.length} participants and ${receiptPreview.splitAllocations.length} allocations`
    );
  }
  if (receiptPreview.total !== "80.00" || receiptPreview.currency !== "PHP") {
    throw new Error(`expected receipt parser to capture total and currency, got total=${receiptPreview.total ?? "null"} currency=${receiptPreview.currency}`);
  }
  if (receiptPreview.receiptAccountMatch?.accountName !== "Visa" || receiptPreview.receiptAccountMatch?.accountLast4 !== "4321") {
    throw new Error(
      `expected receipt parser to infer Visa 4321 account match, got ${receiptPreview.receiptAccountMatch?.accountName ?? "null"} ${receiptPreview.receiptAccountMatch?.accountLast4 ?? "null"}`
    );
  }
  if (receiptPreview.paymentMethod !== "Paid with Visa ending 4321") {
    throw new Error(`expected receipt parser to capture payment method line, got ${receiptPreview.paymentMethod ?? "null"}`);
  }
  if (receiptPreview.confidence < 80) {
    throw new Error(`expected split-bill receipt to return strong confidence, got ${receiptPreview.confidence}`);
  }
  const receiptDraft = splitBillDraftFromReceiptPreview(receiptPreview);
  if (receiptDraft.participants.length !== 2) {
    throw new Error(`expected split-bill draft to seed 2 participants, got ${receiptDraft.participants.length}`);
  }
  if (receiptDraft.payments.length !== 2) {
    throw new Error(`expected split-bill draft to seed 2 payments from split allocations, got ${receiptDraft.payments.length}`);
  }
  const paymentAmounts = receiptDraft.payments.map((payment) => payment.amount).sort();
  if (paymentAmounts[0] !== "30.00" || paymentAmounts[1] !== "40.00") {
    throw new Error(`expected split-bill payment amounts 30.00 and 40.00, got ${paymentAmounts.join(", ")}`);
  }
  if (!receiptDraft.rawPayload || !("receiptAccountMatch" in receiptDraft.rawPayload)) {
    throw new Error("expected split-bill draft to preserve receipt account match in raw payload");
  }
  if (!receiptDraft.rawPayload || receiptDraft.rawPayload.paymentMethod !== "Paid with Visa ending 4321") {
    throw new Error("expected split-bill draft to preserve payment method in raw payload");
  }
  if (!receiptDraft.rawPayload || receiptDraft.rawPayload.receiptPayerName !== null) {
    throw new Error("expected split-bill draft to leave payer name unset when no payer line is present");
  }
  if (!receiptDraft.rawPayload || receiptDraft.rawPayload.receiptCurrencyWarning !== null) {
    throw new Error("expected split-bill draft to leave currency warning unset for single-currency receipts");
  }

  const reopenedReceiptDraft = splitBillModule.splitBillDraftFromSerializedBill({
    id: "bill-receipt-test",
    userId: "workspace-test",
    groupId: null,
    title: "THE BAKERY receipt",
    note: null,
    billDate: "2026-01-12T00:00:00.000Z",
    currency: "PHP",
    sourceType: "receipt",
    merchantName: "THE BAKERY",
    receiptFileName: "receipt.jpg",
    receiptMimeType: "image/jpeg",
    receiptText: receiptPreview.receiptText,
    receiptConfidence: receiptPreview.confidence,
    subtotal: null,
    tax: null,
    tip: null,
    discount: null,
    total: receiptPreview.total,
    rawPayload: receiptDraft.rawPayload,
    createdAt: "2026-01-12T00:00:00.000Z",
    updatedAt: "2026-01-12T00:00:00.000Z",
    group: null,
    participants: receiptDraft.participants,
    items: [],
    payments: [],
    settlement: {
      participants: [],
      transfers: [],
      totalSpent: 0,
      totalPaid: 0,
      totalOwed: 0,
    },
  });
  if (!reopenedReceiptDraft.rawPayload || !("receiptAccountMatch" in reopenedReceiptDraft.rawPayload)) {
    throw new Error("expected serialized split-bill draft to preserve receipt account match raw payload");
  }
  if (!reopenedReceiptDraft.rawPayload || reopenedReceiptDraft.rawPayload.paymentMethod !== "Paid with Visa ending 4321") {
    throw new Error("expected serialized split-bill draft to preserve payment method raw payload");
  }

  const mixedCurrencyPreview = parseReceiptText([
    "THE BAKERY",
    "Coffee PHP 50.00",
    "Dessert $10.00",
    "Total PHP 60.00",
  ].join("\n"));
  if (mixedCurrencyPreview.currencyMentions.length < 2 || !mixedCurrencyPreview.currencyWarning) {
    throw new Error(
      `expected mixed currency receipt to flag a warning, got mentions=${mixedCurrencyPreview.currencyMentions.join(", ") || "none"} warning=${mixedCurrencyPreview.currencyWarning ?? "null"}`
    );
  }
  const mixedCurrencyDraft = splitBillDraftFromReceiptPreview(mixedCurrencyPreview);
  if (!mixedCurrencyDraft.rawPayload || mixedCurrencyDraft.rawPayload.receiptCurrencyWarning !== mixedCurrencyPreview.currencyWarning) {
    throw new Error("expected mixed currency warning to persist in split-bill raw payload");
  }

  const payerReceiptPreview = parseReceiptText([
    "THE BAKERY",
    "Paid by Alice",
    "Sandwich 60.00",
    "Total 60.00",
  ].join("\n"));
  if (payerReceiptPreview.receiptPayerName !== "Alice") {
    throw new Error(`expected receipt parser to capture payer name Alice, got ${payerReceiptPreview.receiptPayerName ?? "null"}`);
  }
  const payerReceiptDraft = splitBillDraftFromReceiptPreview(payerReceiptPreview);
  if (payerReceiptDraft.participants.length !== 1 || payerReceiptDraft.participants[0]?.name !== "Alice") {
    throw new Error(
      `expected payer receipt draft to seed Alice as the sole participant, got ${payerReceiptDraft.participants.map((participant) => participant.name).join(", ") || "none"}`
    );
  }
  if (payerReceiptDraft.payments.length !== 1 || payerReceiptDraft.payments[0]?.amount !== "60.00") {
    throw new Error(
      `expected payer receipt draft to seed a 60.00 payment, got ${payerReceiptDraft.payments.map((payment) => payment.amount).join(", ") || "none"}`
    );
  }
  if (!payerReceiptDraft.rawPayload || payerReceiptDraft.rawPayload.receiptPayerName !== "Alice") {
    throw new Error("expected payer receipt draft to preserve receiptPayerName in raw payload");
  }

  const alternatePaymentMethodPreview = parseReceiptText([
    "THE BAKERY",
    "Method of Payment: GCash",
    "Bread 50.00",
    "Total 50.00",
  ].join("\n"));
  if (alternatePaymentMethodPreview.paymentMethod !== "Method of Payment: GCash") {
    throw new Error(
      `expected alternate payment method line to be preserved, got ${alternatePaymentMethodPreview.paymentMethod ?? "null"}`
    );
  }

  const resolvedReceiptAccount = resolveReceiptAccountHintToAccount(
    {
      accountName: "Visa",
      accountLast4: "4321",
      confidence: 95,
      reason: "explicit receipt hint",
    },
    [
      {
        id: "acct-visa-1",
        name: "Visa 4321",
        institution: "BPI",
        accountNumber: "**** 4321",
        type: "credit_card",
      },
      {
        id: "acct-wallet-1",
        name: "GCash 9926",
        institution: "GCash",
        accountNumber: "09173009926",
        type: "wallet",
      },
    ]
  );
  if (!resolvedReceiptAccount || resolvedReceiptAccount.accountId !== "acct-visa-1") {
    throw new Error(`expected receipt account hint to resolve to Visa 4321, got ${resolvedReceiptAccount?.accountId ?? "null"}`);
  }

  const ambiguousReceiptAccount = resolveReceiptAccountHintToAccount(
    {
      accountName: "Visa",
      accountLast4: "4321",
      confidence: 95,
      reason: "explicit receipt hint",
    },
    [
      {
        id: "acct-visa-1",
        name: "Visa 4321",
        institution: "BPI",
        accountNumber: "**** 4321",
        type: "credit_card",
      },
      {
        id: "acct-visa-2",
        name: "Visa 4321",
        institution: "BDO",
        accountNumber: "9999 4321",
        type: "credit_card",
      },
    ]
  );
  if (ambiguousReceiptAccount !== null) {
    throw new Error("expected ambiguous receipt account hint to stay unresolved");
  }

  const equalSplitReceiptPreview = parseReceiptText([
    "THE BAKERY",
    "Jan 12, 2026",
    "Sandwich 100.00",
    "Total 100.00",
    "Split equally",
    "Alice",
    "Bob",
  ].join("\n"));
  if (equalSplitReceiptPreview.participants.length !== 2 || equalSplitReceiptPreview.splitAllocations.length !== 2) {
    throw new Error(
      `expected equal-split receipt parser to capture 2 participants and 2 allocations, got ${equalSplitReceiptPreview.participants.length} participants and ${equalSplitReceiptPreview.splitAllocations.length} allocations`
    );
  }
  const equalSplitAmounts = equalSplitReceiptPreview.splitAllocations.map((allocation) => allocation.paid ?? allocation.charged ?? allocation.due ?? "0.00").sort();
  if (equalSplitAmounts[0] !== "50.00" || equalSplitAmounts[1] !== "50.00") {
    throw new Error(`expected equal-split receipt to derive 50.00 shares, got ${equalSplitAmounts.join(", ")}`);
  }
  const equalSplitDraft = splitBillDraftFromReceiptPreview(equalSplitReceiptPreview);
  if (equalSplitDraft.payments.length !== 2) {
    throw new Error(`expected equal-split draft to seed 2 payments, got ${equalSplitDraft.payments.length}`);
  }
  const equalSplitPaymentAmounts = equalSplitDraft.payments.map((payment) => payment.amount).sort();
  if (equalSplitPaymentAmounts[0] !== "50.00" || equalSplitPaymentAmounts[1] !== "50.00") {
    throw new Error(`expected equal-split draft payment amounts 50.00 and 50.00, got ${equalSplitPaymentAmounts.join(", ")}`);
  }

  const equalSplitMultiNamePreview = parseReceiptText([
    "THE BAKERY",
    "Sandwich 99.00",
    "Total 99.00",
    "Share summary",
    "Alice, Bob & Charlie",
  ].join("\n"));
  if (equalSplitMultiNamePreview.participants.length !== 3 || equalSplitMultiNamePreview.splitAllocations.length !== 3) {
    throw new Error(
      `expected multi-name equal-split receipt parser to capture 3 participants and allocations, got ${equalSplitMultiNamePreview.participants.length} participants and ${equalSplitMultiNamePreview.splitAllocations.length} allocations`
    );
  }
  const equalSplitMultiNameAmounts = equalSplitMultiNamePreview.splitAllocations.map((allocation) => allocation.paid ?? allocation.charged ?? allocation.due ?? "0.00").sort();
  if (equalSplitMultiNameAmounts.some((amount) => amount !== "33.00")) {
    throw new Error(`expected multi-name equal-split receipt to derive 33.00 shares, got ${equalSplitMultiNameAmounts.join(", ")}`);
  }

  const namedItemReceiptPreview = parseReceiptText([
    "THE BAKERY",
    "Alice Burger 100.00",
    "Bob Fries 50.00",
    "Total 150.00",
    "Share summary",
    "Alice",
    "Bob",
  ].join("\n"));
  const namedItemDraft = splitBillDraftFromReceiptPreview(namedItemReceiptPreview);
  const namedItemAssignments = namedItemDraft.items.map((item) => item.participantIds.length);
  if (namedItemAssignments[0] !== 1 || namedItemAssignments[1] !== 1) {
    throw new Error(
      `expected named items to infer individual participant assignments, got ${namedItemAssignments.join(", ")}`
    );
  }
  const namedItemParticipantIds = namedItemDraft.items.map((item) => item.participantIds[0] ?? "");
  if (namedItemParticipantIds[0] === namedItemParticipantIds[1] || !namedItemParticipantIds[0] || !namedItemParticipantIds[1]) {
    throw new Error("expected named items to assign different participant ids for Alice and Bob");
  }
  const namedItemSettlement = splitBillModule.buildSplitBillSettlement({
    participants: namedItemDraft.participants.map((participant) => ({
      id: participant.id ?? "",
      name: participant.name,
    })),
    items: namedItemDraft.items.map((item) => ({
      amount: item.amount,
      participantIds: item.participantIds,
    })),
    payments: namedItemDraft.payments.map((payment) => ({
      participantId: payment.participantId,
      amount: payment.amount,
    })),
    serviceCharge: namedItemDraft.serviceCharge,
    tax: namedItemDraft.tax,
    tip: namedItemDraft.tip,
    rounding: namedItemDraft.rounding,
    discount: namedItemDraft.discount,
  });
  const namedItemOwed = namedItemSettlement.participants
    .map((participant) => participant.owed)
    .sort((left, right) => left - right);
  if (namedItemOwed[0] !== 50 || namedItemOwed[1] !== 100) {
    throw new Error(`expected named item settlement to be uneven, got owed=${namedItemOwed.map((value) => value.toFixed(2)).join(", ")}`);
  }

  const pettyCashVoucherPreview = parseReceiptText([
    "PETTY CASH VOUCHER",
    "Approved for payment:",
    "Paid by:",
    "Received Payment:",
    "Lamba - 2¢9",
    "Bbw bowl - 3ea",
    "1dambo <akd - eq",
    "Chas Oyakedsf - 299",
    "Gack behwaton - 2927",
    "TOTAL 2467.30",
  ].join("\n"));
  if (pettyCashVoucherPreview.receiptAccountMatch?.accountName !== "Petty Cash") {
    throw new Error(
      `expected petty cash voucher to resolve Petty Cash account, got ${pettyCashVoucherPreview.receiptAccountMatch?.accountName ?? "null"}`
    );
  }

  const visaTicketPreview = parseReceiptText([
    "Passenger: Cayanga Timothy Gunther Mr (ADT)",
    "ELECTRONIC TICKET RECEIPT",
    "PAYMENT DETAILS FARE DETAILS",
    "Form of payment: FFSR007950084-M9500-PHP115* Fare equivalent: PHP 115",
    "Form of payment: CC VI XXXXXXXXXXXX6003 PHP 550LI",
    "PAYMENT DETAILS FARE DETAILS",
    "Form of payment: CC VI XXXXXXXXXXXX6003 XXXX Tax and Other charges:",
  ].join("\n"));
  if (visaTicketPreview.receiptAccountMatch?.accountName !== "Visa" || visaTicketPreview.receiptAccountMatch?.accountLast4 !== "6003") {
    throw new Error(
      `expected airline ticket receipt to resolve Visa 6003, got ${visaTicketPreview.receiptAccountMatch?.accountName ?? "null"} ${visaTicketPreview.receiptAccountMatch?.accountLast4 ?? "null"}`
    );
  }

  const cafeMadridReceiptPreview = parseReceiptText([
    "Cafe Madrid",
    "Les Jamelles Pinot Noir",
    "Grilled Calamares",
    "Chorizo on Piggy Back",
    "Jamon Iberico & Chicken",
    "Super Cochinillo Becham",
    "Caesar Salad",
    "Seafood Paella",
    "Parmesan",
    "Carbonara",
    "Gross Amount",
    "Service Charge",
    "Tax Details",
    "12% VAT",
  ].join("\n"));
  if (cafeMadridReceiptPreview.receiptAccountMatch?.accountName !== "Card") {
    throw new Error(
      `expected cafe madrid receipt to resolve Card, got ${cafeMadridReceiptPreview.receiptAccountMatch?.accountName ?? "null"}`
    );
  }

  const cafeMadridOcrPreview = parseReceiptText([
    "Ny 4 3",
    "\\ Nn,",
    "1} d",
    "4 - \\",
    "bi |",
    "F130 ”",
    "CIRCLE |",
    "Po. 000 .",
    "Jenin TBERIC : 510.00 We of",
    "SUPER COCHI! gb Aen.00 [a oF",
    "TERRY EBERSST © {7 495.00 ee",
    "DOUBLE PARI IE Cn",
    "TRADTTONAL 30.01 Ea 8",
    "Total 8ty ITE :",
    "Gross Anount & es :",
    "service’ Charge Sh 4",
    "Tax Details oo ; Wi Sh",
    "yaT Exenph Bale E yes NNER",
    "12% VAT )",
  ].join("\n"));
  if (cafeMadridOcrPreview.receiptAccountMatch?.accountName !== "Card") {
    throw new Error(
      `expected cafe madrid OCR footer pattern to resolve Card, got ${cafeMadridOcrPreview.receiptAccountMatch?.accountName ?? "null"}`
    );
  }

  const mainBarReceiptPreview = parseReceiptText([
    "DON'T LIVE LIFE WITHOUT IT",
    "12/23/24 9:16 PM",
    "Table: BT1",
    "Server: Claude",
    "Transaction Type: MAIN BAR",
    "Qty Item Description Amount",
    "1 Rice Is Nice 440.00",
    "1 Dirty Sorbetes 440.00",
    "2 Dounua 960.00",
    "Sub-total: 1840.00",
    "Service Charge: 164.29",
    "Total Amount 2004.29",
    "Vatable Sales 1642.65",
    "12% VAT 197.14",
  ].join("\n"));
  if (mainBarReceiptPreview.billDate?.slice(0, 10) !== "2024-12-23") {
    throw new Error(`expected main bar receipt to resolve 2024-12-23, got ${mainBarReceiptPreview.billDate ?? "null"}`);
  }
  if (mainBarReceiptPreview.merchantName !== "Main Bar") {
    throw new Error(`expected main bar receipt to resolve Main Bar, got ${mainBarReceiptPreview.merchantName ?? "null"}`);
  }
  if (mainBarReceiptPreview.total !== "2004.29") {
    throw new Error(`expected main bar receipt to resolve 2004.29, got ${mainBarReceiptPreview.total ?? "null"}`);
  }

  const jarandjamReceiptPreview = parseReceiptText([
    "Br    =",
    "= a",
    "ee              JARANDJAM INC.",
    "=             G/F UNIVERSAL LMS BLDG., 106 ESTEBAN £1)",
    "=              LEGASPI VILL., SAN LORENZO",
    "CITY OF MAKATI",
    "=     Se            NCR, FOURTH DISTRICT",
    "=                 PN: FP112025-047-0562551-00001",
    "Sere   i   =          SN: CTC10778101 MIN: 25110814212659428                  :",
    "—=           § «a8                                         :",
    "-              GUEST COUNT: 5                              ’       5",
    "CASHIER : CHRISTINA SILVIO            #0186          —     -",
    "SERVER: JJ ESTANQUE                10190 [EEE",
    "12/22/2025                    20:48:02 [BEE EE",
    "#0000003214        INVOICEH001-000001383  FEEMEERt mt",
    "Qty Description              Amount Ee   oe ae So",
    "DINE IN           ee",
    "VAT ITEH(s)                              on",
    "2.00 BEEF SHORTRIBS ADOBO ©      10.00 £7 es a",
    "1.00 LAMB PARES               72000 hae Eo",
    "1.00 PORK KARE-CURRY           650.00 (eke ae He",
    "1.00 TORCHED SALMON DONBURI      850.00 A=    Bees ie",
    "1.00 YAKULT LEMONDE           180.00  BicigEe a eR",
    "1.00 LYCHEE FIZZ         WO bo",
    "1.00 BAST OLD FASHIONED         395.00 Eades ol",
    "3                    1.00 GIN & TONIC              395.00   Eo Se",
    "=                  1.00 BOTTLED SEA SALT LEMON       180.00    0 att",
    "==              SUB-TOTAL                  ra.",
    "RUICE CHARGE                  637.95 EE eee",
    "NT DUE     rB2 as        Ee",
    "OF TENS: 10.00               TEE",
    "0:49:27/21:48:42 KT:43 80:92        Ee       2",
    "SS:",
    "VLE:",
    "cmmmemmeeeeeeees 6379.46",
    "ES -------ermnemmaeas    765.54",
    "Re A      0.00",
    "BALES -------semneenas      0.00",
    "EMPORARY BILL",
  ].join("\n"));
  if (
    jarandjamReceiptPreview.merchantName !== "JARANDJAM INC." ||
    jarandjamReceiptPreview.billDate !== "2025-12-22T00:00:00.000Z" ||
    jarandjamReceiptPreview.subtotal !== "7145.00" ||
    jarandjamReceiptPreview.serviceCharge !== "637.95" ||
    jarandjamReceiptPreview.total !== "7782.95" ||
    jarandjamReceiptPreview.items.length !== 9
  ) {
    throw new Error(
      `expected Jarandjam receipt parse to resolve merchant, subtotal, service charge, total, and 9 items, got merchant=${jarandjamReceiptPreview.merchantName ?? "null"} subtotal=${jarandjamReceiptPreview.subtotal ?? "null"} serviceCharge=${jarandjamReceiptPreview.serviceCharge ?? "null"} total=${jarandjamReceiptPreview.total ?? "null"} items=${jarandjamReceiptPreview.items.length}`
    );
  }

  const weightedSummarySettlement = splitBillModule.buildSplitBillSettlement({
    participants: [
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
    ],
    items: [
      {
        amount: "100.00",
        participantIds: ["alice"],
      },
      {
        amount: "50.00",
        participantIds: ["bob"],
      },
    ],
    payments: [],
    serviceCharge: "15.00",
    tip: "15.00",
    discount: "0.00",
  });
  const weightedSummaryOwed = weightedSummarySettlement.participants
    .map((participant) => participant.owed)
    .sort((left, right) => left - right);
  if (weightedSummaryOwed[0].toFixed(2) !== "60.00" || weightedSummaryOwed[1].toFixed(2) !== "120.00") {
    throw new Error(
      `expected weighted summary settlement to distribute service charge and tip proportionally, got owed=${weightedSummaryOwed.map((value) => value.toFixed(2)).join(", ")}`
    );
  }
  if (weightedSummarySettlement.totalOwed.toFixed(2) !== "180.00") {
    throw new Error(`expected weighted summary settlement total owed to be 180.00, got ${weightedSummarySettlement.totalOwed.toFixed(2)}`);
  }

  const summarySettlement = splitBillModule.buildSplitBillSettlement({
    participants: [
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
    ],
    items: [
      {
        amount: "100.00",
        participantIds: ["alice", "bob"],
      },
    ],
    payments: [],
    serviceCharge: "10.00",
    tip: "10.00",
    discount: "0.00",
  });
  const summaryOwed = summarySettlement.participants.map((participant) => participant.owed.toFixed(2)).sort();
  if (summaryOwed[0] !== "60.00" || summaryOwed[1] !== "60.00" || summarySettlement.totalOwed.toFixed(2) !== "120.00") {
    throw new Error(
      `expected summary settlement to include service charge and tip, got owed=${summaryOwed.join(", ")} totalOwed=${summarySettlement.totalOwed.toFixed(2)}`
    );
  }

  const restoredSummaryDraft = splitBillModule.splitBillDraftFromSerializedBill({
    id: "summary-bill",
    userId: "workspace-test",
    groupId: null,
    title: "Summary bill",
    note: null,
    billDate: "2026-01-12T00:00:00.000Z",
    currency: "PHP",
    sourceType: "receipt",
    merchantName: "THE BAKERY",
    receiptFileName: null,
    receiptMimeType: null,
    receiptText: null,
    receiptConfidence: 90,
    subtotal: "100.00",
    tax: "0.00",
    tip: "10.00",
    discount: "0.00",
    total: "110.00",
    rawPayload: {
      receiptSummary: {
        subtotal: "100.00",
        serviceCharge: "5.00",
        rounding: "0.00",
      },
    },
    createdAt: "2026-01-12T00:00:00.000Z",
    updatedAt: "2026-01-12T00:00:00.000Z",
    group: null,
    participants: [],
    items: [],
    payments: [],
    settlement: {
      participants: [],
      transfers: [],
      totalSpent: 0,
      totalPaid: 0,
      totalOwed: 0,
    },
  });
  if (restoredSummaryDraft.serviceCharge !== "5.00" || restoredSummaryDraft.rounding !== "0.00") {
    throw new Error(
      `expected serialized split bill to restore receipt summary fields, got serviceCharge=${restoredSummaryDraft.serviceCharge ?? "null"} rounding=${restoredSummaryDraft.rounding ?? "null"}`
    );
  }

  const mergedReceiptPayload = splitBillModule.mergeSplitBillReceiptSummary(
    {
      foo: "bar",
      receiptSummary: {
        subtotal: "100.00",
      },
    },
    {
      serviceCharge: "5.00",
      rounding: "0.00",
      total: "105.00",
    }
  ) as Record<string, unknown>;
  if (!mergedReceiptPayload.receiptSummary || typeof mergedReceiptPayload.receiptSummary !== "object") {
    throw new Error("expected merged receipt payload to include receiptSummary");
  }
  const mergedReceiptSummary = mergedReceiptPayload.receiptSummary as Record<string, unknown>;
  if (
    mergedReceiptSummary.subtotal !== "100.00" ||
    mergedReceiptSummary.serviceCharge !== "5.00" ||
    mergedReceiptSummary.rounding !== "0.00" ||
    mergedReceiptSummary.total !== "105.00"
  ) {
    throw new Error("expected merged receipt summary to preserve and update fields");
  }

  const chinaBankProbe = detectStatementMetadataFromText("China Bank Statement of Account\nStatement Period Aug. 01, 2024 To Aug. 31, 2024");
  if (chinaBankProbe.institution !== "Chinabank") {
    throw new Error(
      `Parser regression checks failed:\n- [China Bank detection] expected Chinabank but got ${chinaBankProbe.institution ?? "null"}`
    );
  }

  const fixtureCoverage = new Set(fixtures.map((fixture) => normalizeCoverageKey(fixture.institution)));
  const uncoveredDocs = coverageTargets.filter((target) => !fixtureCoverage.has(normalizeCoverageKey(target.key)));

  if (uncoveredDocs.length > 0) {
    console.log(
      `\nCoverage note: parser-regression does not yet have local fixtures for ${uncoveredDocs.length} sample-backed bank(s): ${uncoveredDocs
        .map((target) => target.label)
        .join(", ")}`
    );
  }

  console.log(`Parser regression checks passed for ${fixtures.length} fixtures.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
