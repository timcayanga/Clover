import { z } from "zod";
import { getEnv } from "@/lib/env";
import {
  type DetectedStatementMetadata,
  inferAccountTypeFromStatement,
  type ParsedImportRow,
} from "@/lib/import-parser";
import { summarizeMerchantText } from "@/lib/merchant-labels";

const OPENAI_PROMPT_VERSION = "clover_bank_statement_extraction_v1";

const ALLOWED_MOVEMENT_TYPES = [
  "income",
  "real_spend",
  "transfer",
  "internal_movement",
  "refund",
  "fee",
  "passive_income",
] as const;

const ALLOWED_CATEGORIES = [
  "Income",
  "Bills & Utilities",
  "Business",
  "Education",
  "Financial",
  "Food & Dining",
  "Gifts & Donations",
  "Health & Wellness",
  "Housing",
  "Other",
  "Shopping",
  "Transport",
  "Travel & Lifestyle",
  "Opening Balance",
  "Transfers",
] as const;

type AllowedMovementType = (typeof ALLOWED_MOVEMENT_TYPES)[number];
type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];

type OpenAIExtractedTransaction = {
  date: string | null;
  post_date: string | null;
  transaction_date: string | null;
  raw_name: string;
  normalized_name: string | null;
  amount: number;
  type: "Debit" | "Credit";
  movement_type: AllowedMovementType;
  category: AllowedCategory;
  account: string | null;
  notes: string | null;
  confidence_score: number;
  review_required: boolean;
  parser_evidence: {
    page: number | null;
    source_text: string | null;
    reason: string;
  };
};

type OpenAIParsedAccount = {
  display_name: string | null;
  institution_name: string | null;
  account_last4: string | null;
  account_type: string | null;
  currency: string | null;
  statement_period: {
    start: string | null;
    end: string | null;
  };
  statement_balance: number | null;
  computed_balance: number | null;
  source: "openai_fallback";
};

const importedStatementSchema = z.object({
  institution: z.string().nullable().optional().default(null),
  institution_raw: z.string().nullable().optional().default(null),
  statement_type: z.string().min(1).optional().default("unknown"),
  account: z.object({
    display_name: z.string().nullable().optional().default(null),
    institution_name: z.string().nullable().optional().default(null),
    account_last4: z.string().nullable().optional().default(null),
    account_type: z.string().nullable().optional().default(null),
    currency: z.string().nullable().optional().default(null),
    statement_period: z
      .object({
        start: z.string().nullable().optional().default(null),
        end: z.string().nullable().optional().default(null),
      })
      .default({ start: null, end: null }),
    statement_balance: z.number().nullable().optional().default(null),
    computed_balance: z.number().nullable().optional().default(null),
    source: z.literal("openai_fallback"),
  }),
  transactions: z
    .array(
      z.object({
        date: z.string().nullable().optional().default(null),
        post_date: z.string().nullable().optional().default(null),
        transaction_date: z.string().nullable().optional().default(null),
        raw_name: z.string(),
        normalized_name: z.string().nullable().optional().default(null),
        amount: z.number(),
        type: z.enum(["Debit", "Credit"]),
        movement_type: z.enum(ALLOWED_MOVEMENT_TYPES),
        category: z.enum(ALLOWED_CATEGORIES),
        account: z.string().nullable().optional().default(null),
        notes: z.string().nullable().optional().default(null),
        confidence_score: z.number().min(0).max(100),
        review_required: z.boolean(),
        parser_evidence: z.object({
          page: z.number().nullable().optional().default(null),
          source_text: z.string().nullable().optional().default(null),
          reason: z.string(),
        }),
      })
    )
    .default([]),
  quality_checks: z
    .object({
      transaction_count: z.number().int().nonnegative(),
      balance_reconciled: z.boolean(),
      reconciliation_notes: z.array(z.string()).default([]),
      warnings: z.array(z.string()).default([]),
    })
    .default({
      transaction_count: 0,
      balance_reconciled: false,
      reconciliation_notes: [],
      warnings: [],
    }),
  learning_candidates: z
    .object({
      merchant_mappings: z.array(z.unknown()).default([]),
      code_mappings: z.array(z.unknown()).default([]),
      institution_aliases: z.array(z.unknown()).default([]),
      edge_cases: z.array(z.unknown()).default([]),
    })
    .default({
      merchant_mappings: [],
      code_mappings: [],
      institution_aliases: [],
      edge_cases: [],
    }),
});

const openAIJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    institution: { type: ["string", "null"] },
    institution_raw: { type: ["string", "null"] },
    statement_type: { type: "string" },
    account: {
      type: "object",
      additionalProperties: false,
      properties: {
        display_name: { type: ["string", "null"] },
        institution_name: { type: ["string", "null"] },
        account_last4: { type: ["string", "null"] },
        account_type: { type: ["string", "null"] },
        currency: { type: ["string", "null"] },
        statement_period: {
          type: "object",
          additionalProperties: false,
          properties: {
            start: { type: ["string", "null"] },
            end: { type: ["string", "null"] },
          },
          required: ["start", "end"],
        },
        statement_balance: { type: ["number", "null"] },
        computed_balance: { type: ["number", "null"] },
        source: { type: "string", enum: ["openai_fallback"] },
      },
      required: [
        "display_name",
        "institution_name",
        "account_last4",
        "account_type",
        "currency",
        "statement_period",
        "statement_balance",
        "computed_balance",
        "source",
      ],
    },
    transactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: { type: ["string", "null"] },
          post_date: { type: ["string", "null"] },
          transaction_date: { type: ["string", "null"] },
          raw_name: { type: "string" },
          normalized_name: { type: ["string", "null"] },
          amount: { type: "number" },
          type: { type: "string", enum: ["Debit", "Credit"] },
          movement_type: { type: "string", enum: ALLOWED_MOVEMENT_TYPES },
          category: { type: "string", enum: ALLOWED_CATEGORIES },
          account: { type: ["string", "null"] },
          notes: { type: ["string", "null"] },
          confidence_score: { type: "number" },
          review_required: { type: "boolean" },
          parser_evidence: {
            type: "object",
            additionalProperties: false,
            properties: {
              page: { type: ["number", "null"] },
              source_text: { type: ["string", "null"] },
              reason: { type: "string" },
            },
            required: ["page", "source_text", "reason"],
          },
        },
        required: [
          "date",
          "post_date",
          "transaction_date",
          "raw_name",
          "normalized_name",
          "amount",
          "type",
          "movement_type",
          "category",
          "account",
          "notes",
          "confidence_score",
          "review_required",
          "parser_evidence",
        ],
      },
    },
    quality_checks: {
      type: "object",
      additionalProperties: false,
      properties: {
        transaction_count: { type: "number" },
        balance_reconciled: { type: "boolean" },
        reconciliation_notes: { type: "array", items: { type: "string" } },
        warnings: { type: "array", items: { type: "string" } },
      },
      required: ["transaction_count", "balance_reconciled", "reconciliation_notes", "warnings"],
    },
    learning_candidates: {
      type: "object",
      additionalProperties: false,
      properties: {
        merchant_mappings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {},
            required: [],
          },
        },
        code_mappings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {},
            required: [],
          },
        },
        institution_aliases: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {},
            required: [],
          },
        },
        edge_cases: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {},
            required: [],
          },
        },
      },
      required: ["merchant_mappings", "code_mappings", "institution_aliases", "edge_cases"],
    },
  },
  required: ["institution", "institution_raw", "statement_type", "account", "transactions", "quality_checks", "learning_candidates"],
} as const;

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const summaryRowPatterns = [
  /previous\s+statement\s+balance/i,
  /previous\s+balance/i,
  /opening\s+balance/i,
  /closing\s+balance/i,
  /ending\s+balance/i,
  /balance\s+brought\s+forward/i,
  /balance\s+c\/?f/i,
  /balance\s+b\/?f/i,
  /statement\s+balance/i,
];

const isSummaryRowText = (value: string) => summaryRowPatterns.some((pattern) => pattern.test(value));

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

const buildDeterministicParserSummary = (params: {
  detectedMetadata: DetectedStatementMetadata | null;
  parsedRows: ParsedImportRow[];
}) => {
  const sampleRows = params.parsedRows.slice(0, 12).map((row) => ({
    date: row.date ?? null,
    amount: row.amount ?? null,
    merchantRaw: row.merchantRaw ?? null,
    merchantClean: row.merchantClean ?? null,
    description: row.description ?? null,
    categoryName: row.categoryName ?? null,
    accountName: row.accountName ?? null,
    institution: row.institution ?? null,
    type: row.type ?? null,
    confidence: row.confidence ?? null,
  }));

  return {
    metadata: params.detectedMetadata,
    rowCount: params.parsedRows.length,
    sampleRows,
  };
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

const buildBankInstructionJson = (params: {
  institution?: string | null;
  accountType?: string | null;
  accountName?: string | null;
}) => {
  const normalized = `${params.institution ?? ""} ${params.accountType ?? ""} ${params.accountName ?? ""}`.toLowerCase();
  const base = {
    naming: "Use simple bank name + last 4 digits when possible.",
    movement_type_rules: {
      atm_withdrawals: "transfer",
      wallet_topups: "transfer",
      bank_transfers: "transfer",
      credit_card_payments: "transfer",
      cash_check_deposits: "transfer unless clearly salary or income",
      salary: "income",
      interest: "passive_income",
      bank_fees_taxes_charges: "fee",
      refunds: "refund",
      bill_payments: "real_spend",
      purchases: "real_spend",
      opening_balances: "Opening Balance metadata",
    },
    category_rules: {
      allowed_categories: ALLOWED_CATEGORIES,
      transfers_never_spend: true,
      opening_balance_not_spend_or_income: true,
    },
  };

  if (/bpi/.test(normalized)) {
    return {
      ...base,
      institution: "BPI",
      notes: [
        "BPI credit-card statements may use BE######## identifiers.",
        "Keep BPI account names simple; do not append product labels unless required.",
        "Treat payment lines and balance rows conservatively.",
      ],
    };
  }

  if (/rcbc/.test(normalized)) {
    return {
      ...base,
      institution: "RCBC",
      notes: [
        "RCBC savings and credit-card statements often mix summary rows with transactions.",
        "Do not turn statement balance rows into transactions.",
      ],
    };
  }

  if (/aub/.test(normalized)) {
    return {
      ...base,
      institution: "AUB",
      notes: ["AUB statements may split rows across lines; preserve merchant text and join broken OCR text conservatively."],
    };
  }

  if (/cimb/.test(normalized)) {
    return {
      ...base,
      institution: "CIMB",
      notes: ["CIMB statements often include interest/tax summary lines; keep them out of the transaction stream unless they are real ledger movements."],
    };
  }

  if (/gcash/.test(normalized)) {
    return {
      ...base,
      institution: "GCash",
      notes: ["GCash rows often show cash in/out, wallet funding, transfers, and bills payment; classify them conservatively by movement type."],
    };
  }

  if (/maya/.test(normalized)) {
    return {
      ...base,
      institution: "Maya",
      notes: ["Maya credit/wallet statements may include repayment, fees, and interest. Keep the statement balance separate from row amounts."],
    };
  }

  if (/unionbank/.test(normalized)) {
    return {
      ...base,
      institution: "UnionBank",
      notes: ["UnionBank statements should keep the account label simple and preserve the trailing account digits when visible."],
    };
  }

  return {
    ...base,
    institution: params.institution ?? null,
    notes: [
      "Use the extracted text and any deterministic parser result to stay conservative.",
      "Do not invent account details or transactions.",
    ],
  };
};

const mapMovementTypeToInternalType = (movementType: AllowedMovementType, notes: string | null, rawName: string): "income" | "expense" | "transfer" => {
  if (movementType === "income" || movementType === "passive_income") {
    return "income";
  }
  if (movementType === "transfer" || movementType === "internal_movement" || movementType === "refund") {
    return "transfer";
  }
  if (movementType === "fee" || movementType === "real_spend") {
    return "expense";
  }

  const lower = `${notes ?? ""} ${rawName}`.toLowerCase();
  if (/interest|salary|payroll|deposit/.test(lower)) {
    return "income";
  }
  if (/fee|tax|charge|refund|payment|transfer|withdraw|cash in|cash out/.test(lower)) {
    return "transfer";
  }
  return "expense";
};

const normalizeAccountTypeValue = (
  value: string | null | undefined,
  institution: string | null,
  accountName: string | null,
  fallback: "bank" | "wallet" | "credit_card" | "cash" | "investment" | "other" = "bank"
) => {
  const normalized = normalizeWhitespace(String(value ?? "")).toLowerCase();
  if (normalized === "bank" || normalized === "wallet" || normalized === "credit_card" || normalized === "cash" || normalized === "investment" || normalized === "other") {
    return normalized;
  }

  return inferAccountTypeFromStatement(institution, accountName, fallback);
};

const normalizeOpenAICategory = (category: string | null, movementType: AllowedMovementType) => {
  if (!category) {
    return movementType === "transfer" || movementType === "internal_movement" ? "Transfers" : "Other";
  }
  const candidate = ALLOWED_CATEGORIES.find((value) => value.toLowerCase() === category.toLowerCase());
  return candidate ?? (movementType === "transfer" || movementType === "internal_movement" ? "Transfers" : "Other");
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

const parseStructuredJsonText = (text: string) => {
  const trimmed = text.trim();
  const candidates = [trimmed];

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try the next candidate.
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

const isTruthyEnvValue = (value?: string | null) => {
  if (!value) {
    return false;
  }

  return /^(1|true|yes|on|primary)$/i.test(value.trim());
};

const buildOpenAIInputPayload = (params: {
  fileName?: string | null;
  fileType?: string | null;
  detectedMetadata: DetectedStatementMetadata | null;
  parsedRows: ParsedImportRow[];
  text: string;
  pageImages?: Array<{ page: number; dataUrl: string }> | null;
}) => {
  const institution = params.detectedMetadata?.institution ?? null;
  const accountType = params.detectedMetadata?.accountType ?? null;
  const bankInstructionJson = buildBankInstructionJson({
    institution,
    accountType,
    accountName: params.detectedMetadata?.accountName ?? null,
  });

  return [
    "Parse this bank statement for Clover.",
    "",
    `File name: ${params.fileName ?? "unknown"}`,
    `File type: ${params.fileType ?? "unknown"}`,
    "",
    `Known institution: ${institution ?? "null"}`,
    `Known parser result: ${JSON.stringify(buildDeterministicParserSummary({ detectedMetadata: params.detectedMetadata, parsedRows: params.parsedRows }))}`,
    `Bank-specific instructions: ${JSON.stringify(bankInstructionJson)}`,
    "",
    "Extracted text:",
    params.text,
    "",
    `Image pages: ${(params.pageImages ?? []).map((page) => page.page).join(", ") || "none"}`,
    "",
    "Return only valid JSON matching the schema.",
  ].join("\n");
};

const buildFallbackMetadata = (metadata: DetectedStatementMetadata | null): DetectedStatementMetadata => {
  if (metadata) {
    return metadata;
  }

  return {
    institution: null,
    accountNumber: null,
    accountName: null,
    accountType: null,
    openingBalance: null,
    endingBalance: null,
    startDate: null,
    endDate: null,
    confidence: 0,
  };
};

export const parseImportTextWithOpenAIFallback = async (params: {
  text: string;
  fileName?: string | null;
  fileType?: string | null;
  detectedMetadata: DetectedStatementMetadata | null;
  parsedRows: ParsedImportRow[];
  pageImages?: Array<{ page: number; dataUrl: string }> | null;
  preferPrimary?: boolean;
}): Promise<
  | {
      metadata: DetectedStatementMetadata;
      rows: ParsedImportRow[];
      model: string;
      promptVersion: string;
      audit: {
        sourceFilename: string | null;
        confidence: number;
        schemaValidated: boolean;
        schemaValidationResult: string;
        rawResponse: string;
      };
    }
  | null
> => {
  const env = getEnv();
  const apiKey = (env as { OPENAI_API_KEY?: string }).OPENAI_API_KEY?.trim();
  const isPrimaryMode =
    params.preferPrimary ?? isTruthyEnvValue((env as { OPENAI_IMPORT_PARSER_PRIMARY?: string }).OPENAI_IMPORT_PARSER_PRIMARY);
  if (!apiKey || (!isPrimaryMode && !responseLooksUseful(params.detectedMetadata, params.parsedRows))) {
    return null;
  }

  const inputText = buildModelInputText(params.text);
  const systemPrompt = [
    "You are Clover’s financial statement extraction engine.",
    "Extract transactions from bank statements into strict JSON.",
    "Do not invent data.",
    "Preserve raw text.",
    "Classify transactions using Clover’s allowed categories and movement types.",
    "Transfers, wallet funding, ATM withdrawals, card payments, and deposits are not spending or income by default.",
    "Return JSON only.",
    "Use the schema exactly as given.",
    "Use only the allowed movement_type and category values.",
    "If a field is unknown, use null.",
    "Keep rows in statement order.",
    "Prefer conservative parsing over guessing.",
    "Reconcile balances when possible and report mismatches clearly.",
  ].join(" ");

  const userPrompt = buildOpenAIInputPayload({
    fileName: params.fileName ?? null,
    fileType: params.fileType ?? null,
    detectedMetadata: params.detectedMetadata,
    parsedRows: params.parsedRows,
    text: inputText,
    pageImages: params.pageImages ?? null,
  });

  const pageImagesToSend = (params.pageImages ?? []).slice(0, 2);
  const textModel = (env as { OPENAI_IMPORT_PARSER_MODEL?: string }).OPENAI_IMPORT_PARSER_MODEL?.trim() || "gpt-4.1";
  const imageModel =
    (env as { OPENAI_IMPORT_PARSER_IMAGE_MODEL?: string }).OPENAI_IMPORT_PARSER_IMAGE_MODEL?.trim() || "gpt-4.1-mini";
  const model = pageImagesToSend.length > 0 ? imageModel : textModel;
  const buildUserContent = (pageImages: Array<{ page: number; dataUrl: string }>) => {
    const userContent: Array<Record<string, unknown>> = [{ type: "input_text", text: userPrompt }];
    for (const pageImage of pageImages) {
      userContent.push({
        type: "input_image",
        image_url: pageImage.dataUrl,
      });
    }
    return userContent;
  };

  const callOpenAI = async (selectedModel: string, pageImages: Array<{ page: number; dataUrl: string }>, timeoutMs: number) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          temperature: 0,
          max_output_tokens: 4_000,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: systemPrompt }],
            },
            {
              role: "user",
              content: buildUserContent(pageImages),
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
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return null;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  const shouldRetryWithFewerImages = (status: number, errorText: string, imageCount: number) => {
    if (imageCount <= 1) {
      return false;
    }
    if (status === 429) {
      return true;
    }
    return /token|context|too large|payload/i.test(errorText);
  };

  try {
    const primaryTimeoutMs = model === imageModel ? 15_000 : 30_000;
    let response = await callOpenAI(model, pageImagesToSend, primaryTimeoutMs);

    if (!response || !response.ok) {
      const errorText = response ? await response.text().catch(() => "") : "timeout";
      if (response && shouldRetryWithFewerImages(response.status, errorText, pageImagesToSend.length)) {
        console.warn("OpenAI import fallback request retried with fewer page images", {
          status: response.status,
          statusText: response.statusText,
          imageCount: pageImagesToSend.length,
        });
        response = await callOpenAI(model, pageImagesToSend.slice(0, 1), primaryTimeoutMs);
      }

      if ((!response || !response.ok) && pageImagesToSend.length > 0 && model === imageModel && imageModel !== textModel) {
        if (response && !response.ok) {
          const retryErrorText = await response.text().catch(() => "");
          console.warn("OpenAI image fallback request failed, retrying with text model", {
            status: response.status,
            statusText: response.statusText,
            errorText: retryErrorText.slice(0, 2_000) || null,
          });
        } else {
          console.warn("OpenAI image fallback timed out, retrying with text model", {
            imageCount: pageImagesToSend.length,
          });
        }
        response = await callOpenAI(textModel, pageImagesToSend.slice(0, 1), 30_000);
      }

      if (!response || !response.ok) {
        const finalErrorText = response ? await response.text().catch(() => "") : errorText;
        console.warn("OpenAI import fallback request failed", {
          status: response?.status ?? null,
          statusText: response?.statusText ?? null,
          errorText: finalErrorText.slice(0, 2_000) || null,
        });
        return null;
      }
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const outputText = extractOutputText(payload);
    if (!outputText) {
      return null;
    }

    const parsedJson = parseStructuredJsonText(outputText);
    if (!parsedJson) {
      console.warn("OpenAI import fallback returned unparseable JSON", {
        sample: outputText.slice(0, 500),
      });
      return {
        metadata: buildFallbackMetadata(params.detectedMetadata),
        rows: [],
        model,
        promptVersion: OPENAI_PROMPT_VERSION,
        audit: {
          sourceFilename: params.fileName ?? null,
          confidence: params.detectedMetadata?.confidence ?? 0,
          schemaValidated: false,
          schemaValidationResult: "unparseable_json",
          rawResponse: outputText,
        },
      };
    }
    const validation = importedStatementSchema.safeParse(parsedJson);
    const schemaValidated = validation.success;
    const validationSummary = schemaValidated ? "valid" : validation.error.issues.slice(0, 5).map((issue) => issue.message).join("; ");
    if (!schemaValidated) {
      console.warn("OpenAI import fallback returned invalid schema", {
        issues: validation.error.issues.slice(0, 3),
      });
      return {
        metadata: buildFallbackMetadata(params.detectedMetadata),
        rows: [],
        model,
        promptVersion: OPENAI_PROMPT_VERSION,
        audit: {
          sourceFilename: params.fileName ?? null,
          confidence: params.detectedMetadata?.confidence ?? 0,
          schemaValidated: false,
          schemaValidationResult: validationSummary,
          rawResponse: outputText,
        },
      };
    }

    const value = validation.data;
    const institution = simplifyInstitutionName(value.institution ?? value.account.institution_name ?? params.detectedMetadata?.institution ?? null);
    const institutionRaw = normalizeWhitespace(String(value.institution_raw ?? value.institution ?? institution ?? params.detectedMetadata?.institution ?? "")).trim() || null;
    const accountLast4 = value.account.account_last4?.replace(/\D/g, "").slice(-4) ?? params.detectedMetadata?.accountNumber?.slice(-4) ?? null;
    const accountNumber = accountLast4 ?? params.detectedMetadata?.accountNumber ?? null;
    const accountNameCandidate =
      simplifyAccountLabel(value.account.display_name ?? null) ??
      (institution && accountLast4 ? `${institution} ${accountLast4}` : null) ??
      simplifyAccountLabel(params.detectedMetadata?.accountName ?? null) ??
      institution ??
      null;
    const accountType = normalizeAccountTypeValue(value.account.account_type ?? null, institution, accountNameCandidate, params.detectedMetadata?.accountType ?? "bank");
    const statementBalance = value.account.statement_balance ?? params.detectedMetadata?.endingBalance ?? null;
    const computedBalance = value.account.computed_balance ?? statementBalance;
    const transactionConfidenceAverage =
      value.transactions.length > 0
        ? value.transactions.reduce((sum, row) => sum + row.confidence_score, 0) / value.transactions.length
        : 0;
    const qualityBoost = value.quality_checks.balance_reconciled ? 10 : 0;
    const metadata: DetectedStatementMetadata = {
      institution: institution ?? null,
      accountNumber: accountNumber ?? null,
      accountName: accountNameCandidate,
      accountType,
      openingBalance: params.detectedMetadata?.openingBalance ?? null,
      endingBalance: statementBalance,
      startDate: value.account.statement_period.start ?? params.detectedMetadata?.startDate ?? null,
      endDate: value.account.statement_period.end ?? params.detectedMetadata?.endDate ?? null,
      confidence: Math.max(
        0,
        Math.min(
          100,
          Math.round((params.detectedMetadata?.confidence ?? 0) * 0.25 + transactionConfidenceAverage * 0.75 + qualityBoost)
        )
      ),
    };

    const balanceReconciled =
      statementBalance !== null &&
      computedBalance !== null &&
      Math.abs(Number(statementBalance) - Number(computedBalance)) < 0.01;

    const mappedRows = value.transactions.map((row): ParsedImportRow | null => {
        const description = normalizeWhitespace(String(row.normalized_name ?? row.raw_name ?? "")).trim();
        const rawName = normalizeWhitespace(String(row.raw_name ?? description)).trim();
        const amount = Math.abs(Number(row.amount));
        if (!rawName || !Number.isFinite(amount)) {
          return null;
        }

        const rowInstitution = simplifyInstitutionName(institution ?? value.account.institution_name ?? params.detectedMetadata?.institution ?? null) ?? institution ?? null;
        const rowAccountName = accountNameCandidate ?? value.account.display_name ?? null;
        const movementType = row.movement_type;
        const category = normalizeOpenAICategory(row.category, movementType);
        const internalType = mapMovementTypeToInternalType(movementType, row.notes ?? null, rawName);
        const merchantBase = row.normalized_name ?? row.raw_name ?? description;
        const merchantClean = summarizeMerchantText(merchantBase, rowInstitution);
        const reviewRequired = row.review_required || row.confidence_score < 85 || category === "Other" || movementType === "internal_movement";

        return {
          date: row.date ?? undefined,
          amount: amount.toFixed(2),
          merchantRaw: rawName,
          merchantClean,
          description: description || rawName,
          categoryName: category,
          accountName: rowAccountName ?? metadata.accountName ?? undefined,
          institution: rowInstitution ?? undefined,
          type: internalType,
          confidence: Math.max(0, Math.min(100, Math.round(row.confidence_score ?? metadata.confidence ?? 0))),
          rawPayload: {
            source: "openai",
            model,
            promptVersion: OPENAI_PROMPT_VERSION,
            statementType: value.statement_type,
            institutionRaw,
            sourceLine: row.parser_evidence.source_text ?? null,
            parserEvidence: row.parser_evidence,
            normalizedName: row.normalized_name ?? null,
            movementType,
            category,
            reviewRequired,
            notes: row.notes ?? null,
            amountType: row.type,
            balanceReconciled,
            computedBalance,
            qualityChecks: value.quality_checks,
            learningCandidates: value.learning_candidates,
          },
        } satisfies ParsedImportRow;
    });

    const rows = mappedRows.filter((row): row is ParsedImportRow => row !== null);

    if (rows.length === 0) {
      return null;
    }

    return {
      metadata,
      rows,
      model,
      promptVersion: OPENAI_PROMPT_VERSION,
      audit: {
        sourceFilename: params.fileName ?? null,
        confidence: metadata.confidence,
        schemaValidated,
        schemaValidationResult: validationSummary,
        rawResponse: outputText,
      },
    };
  } catch (error) {
    console.warn("OpenAI import fallback failed", error);
    return null;
  }
};
