import { z } from "zod";
import { getEnv } from "@/lib/env";
import {
  type DetectedStatementMetadata,
  inferAccountTypeFromStatement,
  parseAmountValue,
  type ParsedImportRow,
} from "@/lib/import-parser";
import { summarizeMerchantText } from "@/lib/merchant-labels";

type OpenAIImportRow = {
  date: string | null;
  amount: number | string | null;
  merchantRaw: string | null;
  merchantClean: string | null;
  description: string | null;
  categoryName: string | null;
  accountName: string | null;
  institution: string | null;
  type: "income" | "expense" | "transfer";
  confidence: number | null;
  sourceLine: string | null;
};

type OpenAIImportResult = {
  institution: string | null;
  accountNumber: string | null;
  accountName: string | null;
  openingBalance: number | null;
  endingBalance: number | null;
  startDate: string | null;
  endDate: string | null;
  confidence: number;
  notes: string | null;
  rows: OpenAIImportRow[];
};

const importedStatementSchema = z.object({
  institution: z.string().nullable().optional().default(null),
  accountNumber: z.string().nullable().optional().default(null),
  accountName: z.string().nullable().optional().default(null),
  accountType: z.enum(["bank", "wallet", "credit_card", "cash", "investment", "other"]).nullable().optional().default(null),
  openingBalance: z.number().nullable().optional().default(null),
  endingBalance: z.number().nullable().optional().default(null),
  startDate: z.string().nullable().optional().default(null),
  endDate: z.string().nullable().optional().default(null),
  confidence: z.number().min(0).max(100).optional().default(0),
  notes: z.string().nullable().optional().default(null),
  rows: z
    .array(
      z.object({
        date: z.string().nullable().optional().default(null),
        amount: z.union([z.number(), z.string()]).nullable().optional().default(null),
        merchantRaw: z.string().nullable().optional().default(null),
        merchantClean: z.string().nullable().optional().default(null),
        description: z.string().nullable().optional().default(null),
        categoryName: z.string().nullable().optional().default(null),
        accountName: z.string().nullable().optional().default(null),
        institution: z.string().nullable().optional().default(null),
        type: z.enum(["income", "expense", "transfer"]),
        confidence: z.number().min(0).max(100).nullable().optional().default(null),
        sourceLine: z.string().nullable().optional().default(null),
      })
    )
    .default([]),
});

const openAIJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    institution: { type: ["string", "null"] },
    accountNumber: { type: ["string", "null"] },
    accountName: { type: ["string", "null"] },
    accountType: {
      anyOf: [
        { type: "string", enum: ["bank", "wallet", "credit_card", "cash", "investment", "other"] },
        { type: "null" },
      ],
    },
    openingBalance: { type: ["number", "null"] },
    endingBalance: { type: ["number", "null"] },
    startDate: { type: ["string", "null"] },
    endDate: { type: ["string", "null"] },
    confidence: { type: "number" },
    notes: { type: ["string", "null"] },
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: { type: ["string", "null"] },
          amount: { type: ["number", "string", "null"] },
          merchantRaw: { type: ["string", "null"] },
          merchantClean: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          categoryName: { type: ["string", "null"] },
          accountName: { type: ["string", "null"] },
          institution: { type: ["string", "null"] },
          type: { type: "string", enum: ["income", "expense", "transfer"] },
          confidence: { type: ["number", "null"] },
          sourceLine: { type: ["string", "null"] },
        },
        required: ["date", "amount", "merchantRaw", "merchantClean", "description", "categoryName", "accountName", "institution", "type", "confidence", "sourceLine"],
      },
    },
  },
  required: [
    "institution",
    "accountNumber",
    "accountName",
    "accountType",
    "openingBalance",
    "endingBalance",
    "startDate",
    "endDate",
    "confidence",
    "notes",
    "rows",
  ],
} as const;

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const buildModelInputText = (text: string) => {
  const normalizedLines = text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const compact = normalizedLines.join("\n");
  if (compact.length <= 60_000) {
    return compact;
  }

  return `${compact.slice(0, 42_000)}\n\n[TRUNCATED FOR MODEL INPUT]\n\n${compact.slice(-18_000)}`;
};

const simplifyAccountLabel = (value?: string | null) => {
  if (!value) {
    return null;
  }

  return normalizeWhitespace(value)
    .replace(/\b(Savings|Checking|Credit Card|Mastercard|Visa|Signature|Platinum|Gold|Wallet|Card|Deposit|Current|Account)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
};

const simplifyInstitutionName = (value?: string | null) => {
  const simplified = simplifyAccountLabel(value);
  return simplified || null;
};

const inferFallbackCategory = (description: string, type: OpenAIImportRow["type"]) => {
  const lower = description.toLowerCase();
  if (type === "transfer") {
    return "Transfers";
  }
  if (/salary|payroll|income|deposit|credit memo/.test(lower)) return "Income";
  if (/fee|interest|loan|financial|bank charge|tax/.test(lower)) return "Financial";
  if (/grocery|supermarket|market|food|dining|restaurant|coffee|cafe|meal|takeout/.test(lower)) return "Food & Dining";
  if (/grab|uber|taxi|bus|train|parking|gas|fuel|transport|ride/.test(lower)) return "Transport";
  if (/rent|mortgage|apartment|housing/.test(lower)) return "Housing";
  if (/bill|utilities|electric|water|internet|phone|subscription/.test(lower)) return "Bills & Utilities";
  if (/travel|airbnb|hotel|airline|flight|tour|holiday/.test(lower)) return "Travel & Lifestyle";
  if (/entertainment|movie|cinema|theater|theatre|concert|show|ticket|tickets|game|gaming|arcade|karaoke|amusement/.test(lower))
    return "Entertainment";
  if (/shop|shopping|mall|amazon|lazada|shopee|retail/.test(lower)) return "Shopping";
  if (/health|doctor|clinic|pharmacy|medical|hospital/.test(lower)) return "Health & Wellness";
  if (/education|tuition|school|college|course|learning/.test(lower)) return "Education";
  if (/gift|donation|charity|present/.test(lower)) return "Gifts & Donations";
  if (/business|invoice|client|contract/.test(lower)) return "Business";
  return "Other";
};

const extractOutputText = (payload: Record<string, unknown>) => {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = payload.output;
  if (!Array.isArray(output)) {
    return null;
  }

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") {
        continue;
      }

      const typedContent = contentItem as { type?: unknown; text?: unknown };
      if (typedContent.type === "output_text" && typeof typedContent.text === "string" && typedContent.text.trim()) {
        return typedContent.text.trim();
      }
    }
  }

  return null;
};

const responseLooksUseful = (metadata: DetectedStatementMetadata | null, rows: ParsedImportRow[]) => {
  const confidence = metadata?.confidence ?? 0;
  const hasStrongIdentity = Boolean(metadata?.institution && metadata?.accountNumber);
  const genericName = normalizeWhitespace(String(metadata?.accountName ?? "")).toLowerCase();
  const fileNameLike = genericName.length > 0 && (genericName.includes("imported-file") || genericName === "account" || genericName === "statement");

  if (rows.length === 0) {
    return confidence < 90 || !hasStrongIdentity;
  }

  return confidence < 75 && (!hasStrongIdentity || fileNameLike);
};

export const parseImportTextWithOpenAIFallback = async (params: {
  text: string;
  fileName?: string | null;
  fileType?: string | null;
  detectedMetadata: DetectedStatementMetadata | null;
  parsedRows: ParsedImportRow[];
}): Promise<{ metadata: DetectedStatementMetadata; rows: ParsedImportRow[]; model: string } | null> => {
  const env = getEnv();
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey || !responseLooksUseful(params.detectedMetadata, params.parsedRows)) {
    return null;
  }

  const model = env.OPENAI_IMPORT_PARSER_MODEL?.trim() || "gpt-4.1";
  const inputText = buildModelInputText(params.text);
  const systemPrompt = [
    "You are parsing a bank statement for Clover, a personal finance app.",
    "Clover imports statements into accounts and transactions.",
    "The user expects the model to extract account identity, balances, dates, and transaction rows from noisy statement text.",
    "Never invent values. Only use details visible in the statement text.",
    "If a field is unknown, use null.",
    "Prefer conservative parsing over guessing.",
    "If the statement is ambiguous, still return the best structured JSON you can, but keep low-confidence fields null and set low confidence.",
    "Rows must stay in the order they appear in the statement.",
    "Use positive amounts only; row.type describes the direction.",
    "For account names, keep them simple and consistent across imports: use 'BankName last4' when possible, such as 'AUB 9671', 'BPI 3012', 'RCBC 5080', 'UnionBank 8037', or 'GCash 9926'.",
    "Do not append product labels like Savings, Checking, Mastercard, Visa, Signature, Platinum, or similar unless they are required to distinguish two real accounts with the same bank and suffix.",
    "institution should be the bank or wallet brand only, not a product name.",
    "accountNumber should be the visible account or card number if present; keep digits only if you can.",
    "openingBalance and endingBalance should reflect the statement totals when visible.",
    "merchantRaw should preserve the readable merchant or description text from the statement.",
    "merchantClean should be a short normalized title that Clover can show in transactions.",
    "Use accountType to classify the statement as bank, wallet, credit_card, cash, investment, or other.",
    "If a row clearly shows a transfer, payment, cash in, cash out, or fee, normalize it sensibly, but do not over-interpret unclear rows.",
    "If the statement has an obvious beginning or ending balance row, include it in the statement balances rather than turning it into a transaction.",
  ].join(" ");

  const userPrompt = [
    `File name: ${params.fileName ?? "unknown"}`,
    `File type: ${params.fileType ?? "unknown"}`,
    `Deterministic metadata: ${JSON.stringify(params.detectedMetadata ?? null)}`,
    `Deterministic rows found: ${params.parsedRows.length}`,
    "",
    "Parse the statement below and return the JSON structure described by the schema.",
    inputText,
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_output_tokens: 4_000,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "bank_statement_import",
            strict: true,
            schema: openAIJsonSchema,
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.warn("OpenAI import fallback request failed", {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText.slice(0, 2_000) || null,
      });
      return null;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const outputText = extractOutputText(payload);
    if (!outputText) {
      return null;
    }

    const parsedJson = JSON.parse(outputText) as unknown;
    const validation = importedStatementSchema.safeParse(parsedJson);
    if (!validation.success) {
      console.warn("OpenAI import fallback returned invalid schema", {
        issues: validation.error.issues.slice(0, 3),
      });
      return null;
    }

    const value = validation.data;
    const institution = simplifyInstitutionName(value.institution ?? params.detectedMetadata?.institution ?? null);
    const accountNumber = value.accountNumber?.replace(/\D/g, "").slice(0, 16) ?? params.detectedMetadata?.accountNumber ?? null;
    const accountNameCandidate =
      simplifyAccountLabel(value.accountName ?? null) ??
      (institution && accountNumber ? `${institution} ${accountNumber.slice(-4)}` : null) ??
      simplifyAccountLabel(params.detectedMetadata?.accountName ?? null) ??
      institution ??
      null;

    const metadata: DetectedStatementMetadata = {
      institution: institution ?? null,
      accountNumber: accountNumber ?? null,
      accountName: accountNameCandidate,
      accountType:
        value.accountType ??
        params.detectedMetadata?.accountType ??
        inferAccountTypeFromStatement(institution, accountNameCandidate, "bank"),
      openingBalance: value.openingBalance ?? params.detectedMetadata?.openingBalance ?? null,
      endingBalance: value.endingBalance ?? params.detectedMetadata?.endingBalance ?? null,
      startDate: value.startDate ?? params.detectedMetadata?.startDate ?? null,
      endDate: value.endDate ?? params.detectedMetadata?.endDate ?? null,
      confidence: Math.max(0, Math.min(100, Math.round(value.confidence ?? params.detectedMetadata?.confidence ?? 0))),
    };

    const rows: ParsedImportRow[] = value.rows
      .map((row) => {
        const amount = parseAmountValue(typeof row.amount === "number" ? String(row.amount) : row.amount ?? null);
        const description = normalizeWhitespace(String(row.description ?? row.merchantRaw ?? row.merchantClean ?? "")).trim();
        if (!description || amount === null) {
          return null;
        }

        const rowInstitution = simplifyInstitutionName(row.institution ?? metadata.institution ?? null) ?? metadata.institution ?? null;
        const rowAccountName =
          simplifyAccountLabel(row.accountName ?? null) ??
          (rowInstitution && metadata.accountNumber ? `${rowInstitution} ${metadata.accountNumber.slice(-4)}` : null) ??
          metadata.accountName ??
          null;
        const merchantBase = row.merchantClean ?? row.merchantRaw ?? row.description ?? description;
        const merchantClean = summarizeMerchantText(merchantBase, rowInstitution);

        return {
          date: row.date ?? undefined,
          amount: amount.toFixed(2),
          merchantRaw: normalizeWhitespace(String(row.merchantRaw ?? row.description ?? description)),
          merchantClean,
          description: row.description ?? description,
          categoryName: row.categoryName ?? inferFallbackCategory(description, row.type),
          accountName: rowAccountName ?? metadata.accountName ?? undefined,
          institution: rowInstitution ?? undefined,
          type: row.type,
          confidence: Math.max(0, Math.min(100, Math.round(row.confidence ?? metadata.confidence ?? 0))),
          rawPayload: {
            source: "openai",
            model,
            sourceLine: row.sourceLine ?? null,
            parsedDescription: row.description ?? description,
          },
        } satisfies ParsedImportRow;
      })
      .filter(Boolean) as ParsedImportRow[];

    if (rows.length === 0) {
      return null;
    }

    return {
      metadata,
      rows,
      model,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("OpenAI import fallback timed out", { model });
      return null;
    }

    console.warn("OpenAI import fallback failed", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
};
