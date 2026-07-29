import { z } from "zod";
import { getEnv } from "@/lib/env";
import {
  parseGfundsAccountDetailSnapshotText,
  parseGfundsPortfolioSnapshotText,
  type DetectedStatementMetadata,
  type DeterministicParsedHolding,
  guessCategoryName,
  inferAccountTypeFromStatement,
  type ImportedAccountType,
  type ParsedImportRow,
} from "@/lib/import-parser";
import { summarizeMerchantText } from "@/lib/merchant-labels";
import { assessStatementExtractionQuality } from "@/lib/import-quality";

const OPENAI_PROMPT_VERSION = "clover_bank_statement_extraction_v4";
const OPENAI_IMAGE_TRANSCRIPTION_PROMPT_VERSION = "clover_bank_statement_transcription_v2";
const OPENAI_IMPORT_FAST_MODEL_FALLBACK = "gpt-5.4-mini";
const OPENAI_IMPORT_STRONG_MODEL_FALLBACK = "gpt-5.5";
const OPENAI_IMPORT_PDF_MODEL_FALLBACK = "gpt-5.5";
const OPENAI_IMPORT_LEGACY_IMAGE_MODEL_FALLBACK = "gpt-5.5";
const OPENAI_IMPORT_LEGACY_TEXT_MODEL_FALLBACK = "gpt-5.4-mini";
const OPENAI_IMPORT_LEGACY_PDF_MODEL_FALLBACK = "gpt-5.5";

export const getRemainingOpenAIImportAttemptTimeout = (params: {
  deadlineMs: number;
  requestedTimeoutMs: number;
  nowMs?: number;
  minimumRemainingMs?: number;
}) => {
  const remainingMs = params.deadlineMs - (params.nowMs ?? Date.now());
  const minimumRemainingMs = params.minimumRemainingMs ?? 5_000;
  if (!Number.isFinite(remainingMs) || remainingMs < minimumRemainingMs) {
    return null;
  }

  return Math.max(1_000, Math.min(params.requestedTimeoutMs, remainingMs));
};

export const shouldReadOpenAIImportErrorBody = (response: Pick<Response, "ok"> | null) =>
  Boolean(response && !response.ok);

const resolveOpenAIImportModel = (value: string | undefined, fallback: string, label: string) => {
  const model = value?.trim();
  if (!model) {
    return fallback;
  }

  if (/^gpt-image(?:-\d+)?$/i.test(model) || /gpt-image/i.test(model)) {
    console.warn(`Ignoring unsupported OpenAI import ${label}`, {
      model,
      fallback,
    });
    return fallback;
  }

  return model;
};

const dedupeOpenAIImportModels = (models: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const resolved: string[] = [];

  for (const candidate of models) {
    const model = candidate?.trim();
    if (!model || seen.has(model)) {
      continue;
    }

    if (/^gpt-image(?:-\d+)?$/i.test(model) || /gpt-image/i.test(model)) {
      continue;
    }

    seen.add(model);
    resolved.push(model);
  }

  return resolved;
};

const openAIImportFailureLooksRetryable = (status: number | null, errorText: string | null | undefined) => {
  if (status == null) {
    return true;
  }

  if (status >= 500 || status === 408 || status === 409 || status === 429) {
    return true;
  }

  return /model|not found|does not exist|not available|unsupported|overloaded|capacity|timeout|token|context|too large|payload/i.test(
    errorText ?? ""
  );
};

const GENERIC_PARSER_GUIDANCE = [
  "Generic parser guidance:",
  "- Use the shared Clover parser system: local rules first, OpenAI fallback for unknown banks or OCR failures, then validation.",
  "- The backup parser is a fallback, not a replacement for the local parser. Preserve the same Clover contract when local parsing is weak or unsupported.",
  "- Preserve raw transaction text and only normalize names/categories when the statement layout makes the meaning clear.",
  "- Keep auditability: preserve source descriptions, account hints, visible balances, notes, and OCR uncertainty instead of hiding them.",
  "- If the statement looks like a bank, wallet, credit card, loan, or certificate-style account but no bank-specific rule exists, still extract the rows conservatively.",
  "- Keep account number, opening balance, ending balance, payment due date, and amount due when visible.",
  "- Preserve each transaction's visible currency separately from the account currency when the source is multi-currency.",
  "- For multi-currency wallet screenshots, treat the amount debited from the user's wallet as the canonical transaction amount and preserve any merchant currency amount separately in notes or evidence.",
  "- If a screenshot shows an inbound marker like +, Added, Received, Refunded, Deposit, or Cash In, treat it as money in. Otherwise do not infer income unless the evidence is explicit.",
  "- A payment to another person is an expense and money received from another person is income. Use Transfers only when the evidence identifies another account owned by the same Clover user.",
  "- Reject page headers, footers, legal text, reward banners, and summary noise as transactions.",
  "- Ignore mobile status bars, search bars, filter chips, pagination chrome, and overlapping screenshot edges.",
  "- If multiple screenshots overlap, avoid duplicating the same transaction unless the evidence clearly shows two separate rows.",
  "- Lower confidence when the OCR is blurry or when a balance cannot be reconciled cleanly.",
  "- When OCR is character-spaced or fragmented, reconstruct the intended words first, then extract metadata and rows conservatively.",
  "- If the statement summary and the detailed rows disagree, prefer the rows that are visibly tied to dates and amounts, and mark low confidence instead of inventing extra activity.",
  "- If the page clearly shows a transaction table but the OCR is partial, return only the rows that can be supported by visible evidence instead of padding the list with guesswork.",
  "- Every returned row must include parser_evidence with source_text plus page, region, or another location hint when available; omit a row when no source evidence supports its date and amount.",
  "- Never manufacture dates, amounts, merchants, balances, or categories to make a statement reconcile. Use null and lower confidence when a field is unreadable.",
].join(" ");

const GENERIC_NORMALIZATION_GUIDANCE = [
  "Generic normalization guidance:",
  "- Keep raw_name separate from normalized_name and preserve the original statement text when it carries useful detail.",
  "- Normalize only when the merchant or code is clearly the same canonical entity.",
  "- Use these canonical categories when they fit the row: Income, Transfers, Food & Dining, Transport, Housing, Bills & Utilities, Travel & Lifestyle, Entertainment, Shopping, Subscriptions, Health & Wellness, Education, Gifts & Donations, Business, Financial, Cash & ATM, Opening Balance, Other.",
  "- Use keyword and context clues before falling back to Other: grocery, grocer, market, supermarket, mart, cafe, coffee, bar, restaurant, dumpling, sushi, burger, mini mart, seafood, tea, bakery -> Food & Dining; airport, parking, skybus, train, rail, fuel, petrol, transport -> Transport; opera house, theater, theatre, concert, museum, gallery, ticket sales -> Entertainment; souvenir, tourism, harbour gifts, sanctuary, tour, parks, travel desk, locker hire -> Travel & Lifestyle; relay, amazon, paypal, shopping mall, camera, marketplace, viator -> Shopping.",
  "- Use stronger transfer heuristics before defaulting to Other: if the row looks like a person's full name, payee alias, or handle and the statement does not clearly show a store or institution, prefer Transfers. Examples: Wanli Hu, Maria Harman, Maldo A F, Citibank Ire Fin S.",
  "- If a row says Payments, Paid, Sent, Received, Transfer, Bank Transfer, Remit, Remittance, Top Up, Cash In, Cash Out, Added, Refunded, Deposit, Withdrawal, or ATM, prefer Transfers or Cash & ATM based on the visible direction and wording instead of Other.",
  "- If the merchant implies groceries or daily food retail such as grocer, groceries, supermarket, woolworths, puregold, coles, 7-eleven, market, metro, mart, mini mart, or price club, prefer Food & Dining unless the screenshot clearly labels it as a non-food store.",
  "- If the merchant implies travel, attractions, tourism, souvenirs, parks, opera, harbour, airport, ticketing, great ocean road, or moonlit sanctuary, prefer Travel & Lifestyle or Entertainment before Other based on the venue.",
  "- If the merchant looks like a person's full name or payee handle, prefer Transfers.",
  "- If the row is an ATM withdrawal, cash withdrawal, withdrawal, cash-out, or cash advance, prefer Cash & ATM unless the statement explicitly labels it as a fee.",
  "- Common merchant/code normalizations include ATM WDL/ATMWD/W/D FR SAV/ET WDL/Cash Withdrawal/ATM Cash Withdrawal -> ATM Withdrawal; IBFT/Instapay/InstaPay/Interbank Fund Transfer/PESONet -> Bank Transfer; Cash Payment/Payment - Thank You/Card Payment -> Credit Card Payment; Service Charge/Finance Charge -> Service Charge or Finance Charge; Credit Interest -> Interest Earned; Discord Nitro/Google One -> Subscriptions; MLBB Top Up -> Entertainment.",
  "- If a row is real but the category is ambiguous, prefer Other with lower confidence rather than guessing.",
].join(" ");

const GENERIC_FEW_SHOT_EXAMPLES = [
  {
    source: "03/18/24 CASH PAYMENT 5,244.14-",
    parsed: {
      transactionName: "CASH PAYMENT",
      normalizedName: "Credit Card Payment",
      amount: 5244.14,
      type: "Credit",
      categoryName: "Financial",
    },
  },
  {
    source: "02/28/2022 ET IBFT SVCHG 25.00 14,075.00",
    parsed: {
      transactionName: "ET IBFT SVCHG",
      normalizedName: "Service Charge",
      amount: 25.0,
      type: "Debit",
      categoryName: "Financial",
    },
  },
  {
    source: "Credit Interest account PHP 0.96",
    parsed: {
      transactionName: "Credit Interest account",
      normalizedName: "Interest Earned",
      amount: 0.96,
      type: "Credit",
      categoryName: "Income",
    },
  },
  {
    source: "WANLI HU +77.50 GBP",
    parsed: {
      transactionName: "WANLI HU",
      normalizedName: "Wanli Hu",
      amount: 77.5,
      type: "Credit",
      categoryName: "Transfers",
    },
  },
  {
    source: "PEDRO THE GROCER MAKAT 295.00",
    parsed: {
      transactionName: "PEDRO THE GROCER MAKAT",
      normalizedName: "Pedro the Grocer Makat",
      amount: 295,
      type: "Debit",
      categoryName: "Food & Dining",
    },
  },
  {
    source: "SYDNEY OPERA HOUSE 2,983.48 PHP",
    parsed: {
      transactionName: "SYDNEY OPERA HOUSE",
      normalizedName: "Sydney Opera House",
      amount: 2983.48,
      type: "Debit",
      categoryName: "Entertainment",
    },
  },
  {
    source: "LS MELBOURNE SOUVENIR 252.31 PHP",
    parsed: {
      transactionName: "LS MELBOURNE SOUVENIR",
      normalizedName: "Ls Melbourne Souvenir",
      amount: 252.31,
      type: "Debit",
      categoryName: "Travel & Lifestyle",
    },
  },
  {
    source: "REVERSAL - RCBC ATM WITHDRAWAL 2,700.00",
    parsed: {
      transactionName: "REVERSAL - RCBC ATM WITHDRAWAL",
      normalizedName: "ATM Reversal",
      amount: 2700.0,
      type: "Credit",
      categoryName: "Transfers",
    },
  },
  {
    source: "Penalty Due 320.53",
    parsed: {
      transactionName: "Penalty Due",
      normalizedName: "Penalty Due",
      amount: 320.53,
      type: "Debit",
      categoryName: "Financial",
    },
  },
  {
    source: "2019-08-08 213KGA0097 DM1 1,900,000.00 0.00 972,264.92",
    parsed: {
      transactionName: "213KGA0097 DM1",
      normalizedName: "Bank Transfer",
      amount: 1900000.0,
      type: "Debit",
      categoryName: "Transfers",
    },
  },
  {
    source: "May 19 3445 InstaPay Transfer Fee 8.00 75,310.55",
    parsed: {
      transactionName: "3445 InstaPay Transfer Fee",
      normalizedName: "InstaPay Transfer Fee",
      amount: 8.0,
      type: "Debit",
      categoryName: "Financial",
    },
  },
  {
    source: "May 19 3445 InstaPay Transfer 10,000.00 75,318.55",
    parsed: {
      transactionName: "3445 InstaPay Transfer",
      normalizedName: "Bank Transfer",
      amount: 10000.0,
      type: "Debit",
      categoryName: "Transfers",
    },
  },
].map((example) => JSON.stringify(example)).join("\n");

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
  "Cash & ATM",
  "Food & Dining",
  "Gifts & Donations",
  "Health & Wellness",
  "Housing",
  "Other",
  "Shopping",
  "Subscriptions",
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
  currency: string | null;
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
  account_number: string | null;
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

type OpenAIParsedHolding = {
  asset_name: string;
  asset_symbol: string | null;
  asset_type: string | null;
  quantity: number | null;
  unit_price: number | null;
  cost_basis: number | null;
  market_value: number | null;
  current_value: number | null;
  gain_loss_value: number | null;
  gain_loss_percent: number | null;
  currency: string | null;
  status: string | null;
  confidence_score: number;
  parser_evidence: {
    page: number | null;
    source_text: string | null;
    reason: string;
  };
};

const toDeterministicHolding = (holding: DeterministicParsedHolding): OpenAIParsedHolding => ({
  asset_name: holding.asset_name,
  asset_symbol: holding.asset_symbol,
  asset_type: holding.asset_type,
  quantity: holding.quantity,
  unit_price: holding.unit_price,
  cost_basis: holding.cost_basis,
  market_value: holding.market_value,
  current_value: holding.current_value,
  gain_loss_value: holding.gain_loss_value,
  gain_loss_percent: holding.gain_loss_percent,
  currency: holding.currency,
  status: holding.status,
  confidence_score: holding.confidence_score,
  parser_evidence: holding.parser_evidence,
});

type OpenAIParsedReceiptLineItem = {
  description: string;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  currency: string | null;
  participant_allocations: Array<{
    participant_name: string;
    amount: number;
  }>;
  confidence_score: number;
  parser_evidence: {
    page: number | null;
    source_text: string | null;
    reason: string;
  };
};

type OpenAIParsedReceiptSplitAllocation = {
  participant_name: string;
  charged: number | null;
  paid: number | null;
  due: number | null;
  currency: string | null;
  confidence_score: number;
  parser_evidence: {
    page: number | null;
    source_text: string | null;
    reason: string;
  };
};

type OpenAIParsedReceiptDetails = {
  receipt_type: string | null;
  merchant_raw: string | null;
  merchant_clean: string | null;
  document_number: string | null;
  invoice_number: string | null;
  booking_reference: string | null;
  order_number: string | null;
  buyer_name: string | null;
  transaction_date: string | null;
  transaction_time: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  service_charge: number | null;
  discount: number | null;
  tip: number | null;
  total: number | null;
  payment_method: string | null;
  payer_name: string | null;
  line_items: OpenAIParsedReceiptLineItem[];
  split_allocations: OpenAIParsedReceiptSplitAllocation[];
  confidence_score: number;
  parser_evidence: {
    page: number | null;
    source_text: string | null;
    reason: string;
  };
};

type OpenAIImageTranscript = {
  document_type: "statement" | "receipt" | "notes" | "portfolio" | "account_detail";
  transcript: string;
  confidence_score: number;
  parser_evidence: {
    page: number | null;
    source_text: string | null;
    reason: string;
  };
};

type ImportMode = "statement" | "receipt" | "notes" | "portfolio" | "account_detail";

type OpenAIDocumentFamily =
  | "wallet_screenshot"
  | "investment_history"
  | "restaurant_receipt"
  | "tax_invoice"
  | "travel_ticket"
  | "bank_statement"
  | "account_summary"
  | "generic_document";

type OpenAIImportDifficulty = "easy" | "medium" | "hard";

type ReceiptAccountMatch = {
  account_name: string | null;
  account_last4: string | null;
  confidence: number;
  reason: string | null;
};

export const shouldUseColdVisualImportFastPath = (params: {
  importMode?: ImportMode | null;
  documentFamily: OpenAIDocumentFamily;
  pageImageCount: number;
  textLength: number;
  parsedRowsCount: number;
  metadataConfidence: number;
  hasInstitution: boolean;
  hasAccountIdentity: boolean;
}) =>
  (params.importMode ?? "statement") === "statement" &&
  params.pageImageCount > 0 &&
  params.parsedRowsCount === 0 &&
  (
    params.documentFamily === "generic_document" ||
    (
      params.textLength < 180 &&
      params.metadataConfidence < 75 &&
      (!params.hasInstitution || !params.hasAccountIdentity)
    )
  );

type ColdLayoutCandidate = {
  document_type?: string | null;
  institution?: string | null;
  account?: {
    display_name?: string | null;
    institution_name?: string | null;
    account_number?: string | null;
    account_last4?: string | null;
  } | null;
  transactions?: Array<{
    date?: string | null;
    post_date?: string | null;
    transaction_date?: string | null;
    amount?: number | null;
    raw_name?: string | null;
    parser_evidence?: {
      source_text?: string | null;
    } | null;
  }> | null;
  quality_checks?: {
    transaction_count?: number | null;
  } | null;
};

export const scoreColdLayoutCandidate = (candidate: ColdLayoutCandidate | null | undefined) => {
  if (!candidate) {
    return 0;
  }

  const transactions = Array.isArray(candidate.transactions) ? candidate.transactions : [];
  const datedRows = transactions.filter((row) => row.date || row.transaction_date || row.post_date).length;
  const supportedRows = transactions.filter(
    (row) =>
      typeof row.amount === "number" &&
      Number.isFinite(row.amount) &&
      Boolean(row.raw_name?.trim()) &&
      Boolean(row.parser_evidence?.source_text?.trim())
  ).length;
  const hasInstitution = Boolean(candidate.institution?.trim() || candidate.account?.institution_name?.trim());
  const hasAccountIdentity = Boolean(
    candidate.account?.account_number?.trim() ||
    candidate.account?.account_last4?.trim() ||
    candidate.account?.display_name?.trim()
  );
  const declaredCount = Math.max(0, Math.round(Number(candidate.quality_checks?.transaction_count ?? transactions.length) || 0));
  const coveragePenalty = declaredCount > transactions.length ? Math.min(20, (declaredCount - transactions.length) * 4) : 0;

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        Math.min(45, transactions.length * 9) +
        (transactions.length > 0 ? (datedRows / transactions.length) * 18 : 0) +
        (transactions.length > 0 ? (supportedRows / transactions.length) * 17 : 0) +
        (hasInstitution ? 10 : 0) +
        (hasAccountIdentity ? 10 : 0) -
        coveragePenalty
      )
    )
  );
};

export const coldLayoutCandidateNeedsStrongRetry = (params: {
  candidate: ColdLayoutCandidate | null | undefined;
  pageImageCount: number;
}) => {
  const candidate = params.candidate;
  if (!candidate || candidate.document_type === "statement" && !candidate.transactions?.length) {
    return true;
  }
  if (candidate.document_type && candidate.document_type !== "statement") {
    return false;
  }

  const transactions = Array.isArray(candidate.transactions) ? candidate.transactions : [];
  const datedRows = transactions.filter((row) => row.date || row.transaction_date || row.post_date).length;
  const hasInstitution = Boolean(candidate.institution?.trim() || candidate.account?.institution_name?.trim());
  const hasAccountIdentity = Boolean(
    candidate.account?.account_number?.trim() ||
    candidate.account?.account_last4?.trim() ||
    candidate.account?.display_name?.trim()
  );

  return (
    scoreColdLayoutCandidate(candidate) < 62 ||
    !hasInstitution ||
    !hasAccountIdentity ||
    datedRows / Math.max(1, transactions.length) < 0.6 ||
    (params.pageImageCount > 2 && transactions.length < 2)
  );
};

const importedStatementSchema = z.object({
  institution: z.string().nullable().optional().default(null),
  institution_raw: z.string().nullable().optional().default(null),
  statement_type: z.string().min(1).optional().default("unknown"),
  document_type: z.enum(["statement", "receipt", "notes", "portfolio", "account_detail"]).optional().default("statement"),
  receipt_account_match: z
    .object({
      account_name: z.string().nullable().optional().default(null),
      account_last4: z.string().nullable().optional().default(null),
      confidence: z.number().min(0).max(100).optional().default(0),
      reason: z.string().nullable().optional().default(null),
    })
    .nullable()
    .optional()
    .default(null),
  receipt_details: z
    .object({
      receipt_type: z.string().nullable().optional().default(null),
      merchant_raw: z.string().nullable().optional().default(null),
      merchant_clean: z.string().nullable().optional().default(null),
      document_number: z.string().nullable().optional().default(null),
      invoice_number: z.string().nullable().optional().default(null),
      booking_reference: z.string().nullable().optional().default(null),
      order_number: z.string().nullable().optional().default(null),
      buyer_name: z.string().nullable().optional().default(null),
      transaction_date: z.string().nullable().optional().default(null),
      transaction_time: z.string().nullable().optional().default(null),
      currency: z.string().nullable().optional().default(null),
      subtotal: z.number().nullable().optional().default(null),
      tax: z.number().nullable().optional().default(null),
      service_charge: z.number().nullable().optional().default(null),
      discount: z.number().nullable().optional().default(null),
      tip: z.number().nullable().optional().default(null),
      total: z.number().nullable().optional().default(null),
      payment_method: z.string().nullable().optional().default(null),
      payer_name: z.string().nullable().optional().default(null),
      line_items: z
        .array(
          z.object({
            description: z.string(),
            quantity: z.number().nullable().optional().default(null),
            unit_price: z.number().nullable().optional().default(null),
            amount: z.number().nullable().optional().default(null),
            currency: z.string().nullable().optional().default(null),
            participant_allocations: z
              .array(
                z.object({
                  participant_name: z.string(),
                  amount: z.number(),
                })
              )
              .default([]),
            confidence_score: z.number().min(0).max(100),
            parser_evidence: z.object({
              page: z.number().nullable().optional().default(null),
              source_text: z.string().nullable().optional().default(null),
              reason: z.string(),
            }),
          })
        )
        .default([]),
      split_allocations: z
        .array(
          z.object({
            participant_name: z.string(),
            charged: z.number().nullable().optional().default(null),
            paid: z.number().nullable().optional().default(null),
            due: z.number().nullable().optional().default(null),
            currency: z.string().nullable().optional().default(null),
            confidence_score: z.number().min(0).max(100),
            parser_evidence: z.object({
              page: z.number().nullable().optional().default(null),
              source_text: z.string().nullable().optional().default(null),
              reason: z.string(),
            }),
          })
        )
        .default([]),
      confidence_score: z.number().min(0).max(100).optional().default(0),
      parser_evidence: z.object({
        page: z.number().nullable().optional().default(null),
        source_text: z.string().nullable().optional().default(null),
        reason: z.string(),
      }),
    })
    .nullable()
    .optional()
    .default(null),
  payment_due_date: z.string().nullable().optional().default(null),
  total_amount_due: z.number().nullable().optional().default(null),
  account: z.object({
    display_name: z.string().nullable().optional().default(null),
    institution_name: z.string().nullable().optional().default(null),
    account_number: z.string().nullable().optional().default(null),
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
  holdings: z
    .array(
      z.object({
        asset_name: z.string(),
        asset_symbol: z.string().nullable().optional().default(null),
        asset_type: z.string().nullable().optional().default(null),
        quantity: z.number().nullable().optional().default(null),
        unit_price: z.number().nullable().optional().default(null),
        cost_basis: z.number().nullable().optional().default(null),
        market_value: z.number().nullable().optional().default(null),
        current_value: z.number().nullable().optional().default(null),
        gain_loss_value: z.number().nullable().optional().default(null),
        gain_loss_percent: z.number().nullable().optional().default(null),
        currency: z.string().nullable().optional().default(null),
        status: z.string().nullable().optional().default(null),
        confidence_score: z.number().min(0).max(100),
        parser_evidence: z.object({
          page: z.number().nullable().optional().default(null),
          source_text: z.string().nullable().optional().default(null),
          reason: z.string(),
        }),
      })
    )
    .default([]),
  transactions: z
    .array(
      z.object({
        date: z.string().nullable().optional().default(null),
        post_date: z.string().nullable().optional().default(null),
        transaction_date: z.string().nullable().optional().default(null),
        raw_name: z.string(),
        normalized_name: z.string().nullable().optional().default(null),
        amount: z.number(),
        currency: z.string().nullable().optional().default(null),
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

const openAIImageTranscriptSchema = z.object({
  document_type: z.enum(["statement", "receipt", "notes", "portfolio", "account_detail"]).optional().default("statement"),
  transcript: z.string().default(""),
  confidence_score: z.number().min(0).max(100).optional().default(0),
  parser_evidence: z.object({
    page: z.number().nullable().optional().default(null),
    source_text: z.string().nullable().optional().default(null),
    reason: z.string(),
  }),
});

const openAIJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    institution: { type: ["string", "null"] },
    institution_raw: { type: ["string", "null"] },
    statement_type: { type: "string" },
    document_type: { type: "string", enum: ["statement", "receipt", "notes", "portfolio", "account_detail"] },
    receipt_account_match: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: {
            account_name: { type: ["string", "null"] },
            account_last4: { type: ["string", "null"] },
            confidence: { type: "number" },
            reason: { type: ["string", "null"] },
          },
          required: ["account_name", "account_last4", "confidence", "reason"],
        },
        { type: "null" },
      ],
    },
    receipt_details: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: {
            receipt_type: { type: ["string", "null"] },
            merchant_raw: { type: ["string", "null"] },
            merchant_clean: { type: ["string", "null"] },
            document_number: { type: ["string", "null"] },
            invoice_number: { type: ["string", "null"] },
            booking_reference: { type: ["string", "null"] },
            order_number: { type: ["string", "null"] },
            buyer_name: { type: ["string", "null"] },
            transaction_date: { type: ["string", "null"] },
            transaction_time: { type: ["string", "null"] },
            currency: { type: ["string", "null"] },
            subtotal: { type: ["number", "null"] },
            tax: { type: ["number", "null"] },
            service_charge: { type: ["number", "null"] },
            discount: { type: ["number", "null"] },
            tip: { type: ["number", "null"] },
            total: { type: ["number", "null"] },
            payment_method: { type: ["string", "null"] },
            payer_name: { type: ["string", "null"] },
            line_items: {
              type: "array",
              default: [],
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  description: { type: "string" },
                  quantity: { type: ["number", "null"] },
                  unit_price: { type: ["number", "null"] },
                  amount: { type: ["number", "null"] },
                  currency: { type: ["string", "null"] },
                  participant_allocations: {
                    type: "array",
                    default: [],
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        participant_name: { type: "string" },
                        amount: { type: "number" },
                      },
                      required: ["participant_name", "amount"],
                    },
                  },
                  confidence_score: { type: "number" },
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
                required: ["description", "quantity", "unit_price", "amount", "currency", "participant_allocations", "confidence_score", "parser_evidence"],
              },
            },
            split_allocations: {
              type: "array",
              default: [],
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  participant_name: { type: "string" },
                  charged: { type: ["number", "null"] },
                  paid: { type: ["number", "null"] },
                  due: { type: ["number", "null"] },
                  currency: { type: ["string", "null"] },
                  confidence_score: { type: "number" },
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
                required: ["participant_name", "charged", "paid", "due", "currency", "confidence_score", "parser_evidence"],
              },
            },
            confidence_score: { type: "number" },
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
            "receipt_type",
            "merchant_raw",
            "merchant_clean",
            "document_number",
            "invoice_number",
            "booking_reference",
            "order_number",
            "buyer_name",
            "transaction_date",
            "transaction_time",
            "currency",
            "subtotal",
            "tax",
            "service_charge",
            "discount",
            "tip",
            "total",
            "payment_method",
            "payer_name",
            "line_items",
            "split_allocations",
            "confidence_score",
            "parser_evidence",
          ],
        },
        { type: "null" },
      ],
    },
    payment_due_date: { type: ["string", "null"] },
    total_amount_due: { type: ["number", "null"] },
    account: {
      type: "object",
      additionalProperties: false,
      properties: {
        display_name: { type: ["string", "null"] },
        institution_name: { type: ["string", "null"] },
        account_number: { type: ["string", "null"] },
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
        "account_number",
        "account_last4",
        "account_type",
        "currency",
        "statement_period",
        "statement_balance",
        "computed_balance",
        "source",
      ],
    },
    holdings: {
      type: "array",
      default: [],
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          asset_name: { type: "string" },
          asset_symbol: { type: ["string", "null"] },
          asset_type: { type: ["string", "null"] },
          quantity: { type: ["number", "null"] },
          unit_price: { type: ["number", "null"] },
          cost_basis: { type: ["number", "null"] },
          market_value: { type: ["number", "null"] },
          current_value: { type: ["number", "null"] },
          gain_loss_value: { type: ["number", "null"] },
          gain_loss_percent: { type: ["number", "null"] },
          currency: { type: ["string", "null"] },
          status: { type: ["string", "null"] },
          confidence_score: { type: "number" },
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
          "asset_name",
          "asset_symbol",
          "asset_type",
          "quantity",
          "unit_price",
          "cost_basis",
          "market_value",
          "current_value",
          "gain_loss_value",
          "gain_loss_percent",
          "currency",
          "status",
          "confidence_score",
          "parser_evidence",
        ],
      },
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
          currency: { type: ["string", "null"] },
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
          "currency",
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
  required: [
    "institution",
    "institution_raw",
    "statement_type",
    "document_type",
    "receipt_account_match",
    "receipt_details",
    "payment_due_date",
    "total_amount_due",
    "account",
    "holdings",
    "transactions",
    "quality_checks",
    "learning_candidates",
  ],
} as const;

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const wiseEvidenceAmountPattern =
  /([+−-]?\s*)?([0-9][0-9,]*(?:\.\d{1,2})?|0)\s+(AED|AUD|CAD|CHF|CNY|EUR|GBP|HKD|JPY|NZD|PHP|SGD|THB|USD)\b/gi;
const wiseVisibleDateHeaderPattern =
  /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i;

const parseOpenAIWiseAmount = (value: string) => {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) {
    return null;
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
};

const parseOpenAIWiseEvidenceAmounts = (value?: string | null) => {
  if (!value) {
    return [];
  }

  return Array.from(value.matchAll(wiseEvidenceAmountPattern))
    .map((match) => {
      const amount = parseOpenAIWiseAmount(match[2] ?? "");
      const currency = match[3]?.trim().toUpperCase();
      if (amount === null || !currency) {
        return null;
      }

      const sign = (match[1] ?? "").replace(/\s+/g, "");
      return {
        amount: Math.abs(amount),
        currency,
        sign: sign.startsWith("+") ? "credit" : sign.startsWith("-") || sign.startsWith("−") ? "debit" : null,
        text: match[0],
      };
    })
    .filter((entry): entry is { amount: number; currency: string; sign: "credit" | "debit" | null; text: string } =>
      Boolean(entry)
    );
};

const firstNonEmptyLine = (value?: string | null) =>
  typeof value === "string"
    ? value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean) ?? null
    : null;

const hasVisibleWiseDateHeader = (value?: string | null) => {
  const firstLine = firstNonEmptyLine(value);
  return Boolean(firstLine && wiseVisibleDateHeaderPattern.test(firstLine));
};

const parseVisibleWiseDateHeader = (value?: string | null) => {
  const firstLine = firstNonEmptyLine(value);
  if (!firstLine || !wiseVisibleDateHeaderPattern.test(firstLine)) {
    return null;
  }

  const normalized = firstLine.replace(/\bSept\b/i, "Sep").replace(/,/g, "").trim();
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
};

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

const OPENAI_VISION_MAX_LONGEST_EDGE = 1600;
const OPENAI_VISION_JPEG_QUALITY = 72;

const selectRepresentativeVisionPages = <T>(pages: T[], limit: number) => {
  if (pages.length <= limit) {
    return pages;
  }

  if (limit <= 1) {
    return pages.slice(0, 1);
  }

  const selectedIndexes = new Set<number>([0, pages.length - 1]);
  for (let index = 1; selectedIndexes.size < limit && index < pages.length - 1; index += 1) {
    const candidate = Math.round((index * (pages.length - 1)) / (limit - 1));
    selectedIndexes.add(candidate);
  }

  return Array.from(selectedIndexes)
    .sort((left, right) => left - right)
    .slice(0, limit)
    .map((index) => pages[index]);
};

const compactVisionImageDataUrl = async (dataUrl: string) => {
  if (!dataUrl.startsWith("data:image/")) {
    return dataUrl;
  }

  try {
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex < 0) {
      return dataUrl;
    }

    const sharpModule = await import("sharp");
    const sharp = sharpModule.default;
    const input = Buffer.from(dataUrl.slice(commaIndex + 1), "base64");
    const output = await sharp(input)
      .rotate()
      .resize({
        width: OPENAI_VISION_MAX_LONGEST_EDGE,
        height: OPENAI_VISION_MAX_LONGEST_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: OPENAI_VISION_JPEG_QUALITY, chromaSubsampling: "4:2:0" })
      .toBuffer();

    return `data:image/jpeg;base64,${output.toString("base64")}`;
  } catch {
    // The model request should still work in environments without sharp.
    return dataUrl;
  }
};

const compactVisionPageImages = async (pages: Array<{ page: number; dataUrl: string }>) =>
  Promise.all(
    pages.map(async (page) => ({
      page: page.page,
      dataUrl: await compactVisionImageDataUrl(page.dataUrl),
    }))
  );

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
    naming: "If the statement shows a full account number, preserve it exactly in account_number. Use last 4 digits only for display labels when the full number is not available.",
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
      credit_card_due_fields: "Capture payment due date and total amount due when visible",
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

  if (/metrobank/.test(normalized)) {
    return {
      ...base,
      institution: "Metrobank",
      notes: [
        "Metrobank savings statements may use ledger-style summary pages or certificate-style layouts with boilerplate at the top and bottom.",
        "Ignore PDIC, BSP, rate, fee, and summary banners that are not real transaction rows.",
        "Preserve the account number exactly when the statement image shows it clearly.",
      ],
    };
  }

  if (/security bank/.test(normalized)) {
    return {
      ...base,
      institution: "Security Bank",
      notes: [
        "Security Bank proof-of-account statements may show a CUSTOMER DETAILS page followed by a TRANSACTION DETAILS table.",
        "Use the statement summary and running balance to keep the final balance anchored correctly.",
        "Ignore boilerplate lines such as Member: PDIC and the bank support footer.",
      ],
    };
  }

  if (/(?:landbank|land\s+bank)/.test(normalized)) {
    return {
      ...base,
      institution: "Landbank",
      notes: [
        "Landbank statement tables may show In/Out columns and a closing balance. Use the table rows only and ignore pure balance-note lines.",
        "Treat cash deposits, PESONet, interbank transfers, and wallet funding as transfers unless the description clearly says salary or merchant spend.",
        "Preserve the full account number exactly when it is visible in the statement header.",
        "For OCR-heavy Landbank files, rely on the visible table structure and running balance instead of short OCR fragments. Keep each date row separate even if the description wraps onto the next line.",
        "When OCR splits a Landbank row across multiple lines, keep the date anchored to the first line and attach the following amount, in/out, and balance values to that same transaction instead of dropping the row.",
      ],
    };
  }

  if (/ucpb/.test(normalized)) {
    return {
      ...base,
      institution: "UCPB",
      notes: [
        "UCPB current-account statements often include a transaction code legend. Extract the legend before final classification.",
        "Use debit as outgoing and credit as incoming, and do not turn balance-forward or total rows into transactions.",
        "Preserve the raw transaction code plus the expanded meaning from the legend.",
        "For OCR-heavy UCPB files, use the legend and the row columns as the source of truth. Ignore footer noise and repeated summary blocks.",
        "If a UCPB row is split across OCR lines, keep the transaction together by matching the date, code, amount, and balance across adjacent lines before classifying it.",
      ],
    };
  }

  if (/chinabank|china bank/.test(normalized)) {
    return {
      ...base,
      institution: "Chinabank",
      notes: [
        "China Bank savings and credit-card statements may include housekeeping or reversal rows; keep those separate from normal spend.",
        "Cash payments on credit cards should be treated as payments/transfers, not income.",
        "Preserve the account number exactly when visible.",
        "For OCR-heavy China Bank files, trust the transaction table and account summary box over OCR fragments in the page margins or footers. Preserve long account-holder names when they wrap across lines.",
        "When China Bank OCR fragments a row into date, reference, amount, and balance pieces, reconstruct the full row before classifying it rather than dropping the transaction.",
      ],
    };
  }

  if (/psbank/.test(normalized)) {
    return {
      ...base,
      institution: "PSBank",
      notes: [
        "PSBank savings statements are running-balance ledgers; preserve the rows with real dates and do not convert housekeeping lines into spend.",
        "Treat transfers, fees, salary, and adjustment reversals conservatively and keep their movement type explicit.",
        "Preserve the full account number if the statement shows it clearly.",
      ],
    };
  }

  if (/maribank|seabank/.test(normalized)) {
    return {
      ...base,
      institution: "Maribank",
      notes: [
        "MariBank/SeaBank statements may split summary, transaction details, and interest/tax sections across pages.",
        "Extract transactions only from the transaction detail sections and ignore legal boilerplate pages.",
        "Treat internal transfers, pocket movements, and transfer fees conservatively.",
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
      notes: [
        "AUB statements may split rows across lines; preserve merchant text and join broken OCR text conservatively.",
        "For scanned AUB pages, the full account number is usually printed near the top under an 'Account Number' heading and may include hyphens. Keep every digit group; do not truncate it to the last 4 digits if the full number is visible.",
        "Prefer the final explicit ending balance or closing balance near the bottom of the last page, even if earlier pages show a different running balance.",
        "Do not stop after the first page; capture transaction rows from every page.",
      ],
    };
  }

  if (/cimb/.test(normalized)) {
    return {
      ...base,
      institution: "CIMB",
      notes: ["CIMB statements often include interest/tax summary lines; keep them out of the transaction stream unless they are real ledger movements."],
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
      notes: [
        "UnionBank statements should keep the account label simple and preserve the trailing account digits when visible.",
        "If the statement shows a full account number, return it in account.account_number with all digits preserved. Use account.account_last4 only as a display fallback.",
        "UnionBank statement images usually place the account summary in the upper-right box and the transaction table below it. Capture the summary box first, then transcribe each row in table order with the Date, Description, Debit, Credit, and Balance columns preserved.",
        "UnionBank mobile screenshots can show a dashboard account card with a product label, masked last four digits, and an Available Balance. Treat that as an account snapshot, not as three separate transactions.",
        "UnionBank mobile transaction-history screenshots usually show Account Details, Download, Transaction History, and All / Received / Sent controls at the top. Those are UI labels, not transactions.",
        "For UnionBank mobile transaction-history screenshots, each real row ends with a posted date such as April 13, 2026. The description may wrap across several lines before that date, and the amount can appear on the first wrapped line.",
        "Month labels like May 2026 or November 2025 are section headers, not transactions. Keep them only as grouping context while extracting rows.",
        "For UnionBank Bills Payment rows, BANKARD VISA on the next line belongs to the same transaction and should stay attached to the raw description or notes.",
        "Rows whose visible label is Not Applicable are ambiguous credits or balance adjustments. Preserve them as low-confidence rows instead of dropping them or inventing a clearer merchant.",
        "For noisy UnionBank word/excel/template PDFs, do not merge adjacent transactions into one row. Preserve each clearly visible date and amount pair as its own ledger entry, even when OCR splits the description across lines.",
        "If the OCR is too damaged to read a row confidently, return only the rows you can support from visible evidence instead of inventing balances or combining lines.",
        "Do not drop rows that repeat similar descriptors such as ONLINE FUND TRANSFER or ONLINE INSTAPAYSEND; those are separate ledger entries when their amounts or balances differ.",
      ],
    };
  }

  if (/gcash/.test(normalized)) {
    return {
      ...base,
      institution: "GCash",
      notes: [
        "GCash statements may show transfer-from and transfer-to phone numbers inside the description. Preserve the wallet number and classify cash movement conservatively.",
        "Use the final footer ending balance rather than a mid-statement running balance when the statement spans multiple pages.",
      ],
    };
  }

  if (/wise/.test(normalized)) {
    return {
      ...base,
      institution: "Wise",
      notes: [
        "Wise mobile transaction-history screenshots may not show an account number or ending balance. Use account.display_name = Wise, account.institution_name = Wise, account.account_type = wallet, and keep account_number null when it is not visible.",
        "If a Wise row has one amount, that amount is in one of the user's Wise account currencies and should be the transaction amount/currency.",
        "If a Wise row has two amounts, the bold/larger first amount is the merchant/spend currency, while the smaller second amount is the user's Wise account currency and the actual account amount. Use the second amount/currency as the transaction amount, and preserve the first amount/currency in notes or parser evidence.",
        "For Wise screenshots, only a visible plus sign or an explicit refund/received status means money came into the account. Added by itself does not imply income. Rows without a plus sign are outgoing spend unless the visible status clearly says Sent or transfer-like.",
        "Rows such as Card checked with 0 USD are verification rows; include only if clearly visible and mark review_required true.",
        "Do not require an account number for a Wise screenshot if transaction rows are visible.",
      ],
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

const mapMovementTypeToInternalType = (
  movementType: AllowedMovementType,
  notes: string | null,
  rawName: string,
  statementDirection: "Debit" | "Credit"
): "income" | "expense" => {
  if (movementType === "income" || movementType === "passive_income") {
    return "income";
  }
  if (movementType === "transfer" || movementType === "internal_movement" || movementType === "refund") {
    return statementDirection === "Credit" ? "income" : "expense";
  }
  if (movementType === "fee" || movementType === "real_spend") {
    return "expense";
  }

  const lower = `${notes ?? ""} ${rawName}`.toLowerCase();
  if (/interest|salary|payroll|deposit/.test(lower)) {
    return "income";
  }
  if (/fee|tax|charge|refund|payment|transfer|withdraw|cash in|cash out/.test(lower)) {
    return statementDirection === "Credit" ? "income" : "expense";
  }
  return "expense";
};

const normalizeAccountTypeValue = (
  value: string | null | undefined,
  institution: string | null,
  accountName: string | null,
  fallback: ImportedAccountType = "bank"
) => {
  const normalized = normalizeWhitespace(String(value ?? "")).toLowerCase().replace(/[\s-]+/g, "_");
  const supportedTypes: ImportedAccountType[] = [
    "bank",
    "wallet",
    "credit_card",
    "cash",
    "investment",
    "loan",
    "mortgage",
    "line_of_credit",
    "receivable",
    "payable",
    "bnpl",
    "prepaid",
    "insurance",
    "other",
  ];
  if (supportedTypes.includes(normalized as ImportedAccountType)) {
    return normalized as ImportedAccountType;
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

const deriveWiseScreenshotTypeAndCategory = (params: {
  rawName: string;
  description: string;
  evidenceText: string | null;
  normalizedCategory: AllowedCategory;
  movementType: AllowedMovementType;
}) => {
  const evidenceAmounts = parseOpenAIWiseEvidenceAmounts(params.evidenceText);
  const accountImpactAmount = evidenceAmounts.length > 0 ? evidenceAmounts[evidenceAmounts.length - 1] : null;
  const sign = accountImpactAmount?.sign ?? null;
  const signalText = `${params.rawName}\n${params.description}\n${params.evidenceText ?? ""}`;
  const isWalletTransfer = /\bTo\s+[A-Z]{3}\b/i.test(signalText);
  const isRefundOrReceive = /\b(?:Refunded|Received)\b/i.test(signalText);
  const isSent = /\bSent\b/i.test(signalText);
  const isIncoming = sign === "credit" || isRefundOrReceive;
  const type: "income" | "expense" | "transfer" = isWalletTransfer
    ? "transfer"
    : isIncoming
      ? "income"
      : isSent
        ? "transfer"
        : "expense";

  let category: AllowedCategory = params.normalizedCategory;
  if (isWalletTransfer || params.movementType === "transfer" || params.movementType === "internal_movement" || isSent) {
    category = "Transfers";
  } else if (/refund/i.test(signalText)) {
    category = "Income";
  } else if (
    category === "Other" ||
    category === "Income" ||
    category === "Transfers"
  ) {
    const guessedCategory = guessCategoryName(params.rawName, type);
    const allowedGuessedCategory = ALLOWED_CATEGORIES.find((value) => value === guessedCategory);
    if (allowedGuessedCategory) {
      category = allowedGuessedCategory;
    }
  }

  return { type, category };
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

const responseLooksUseful = (metadata: DetectedStatementMetadata | null, rows: ParsedImportRow[], importMode?: ImportMode | null) => {
  if (importMode && importMode !== "statement") {
    return true;
  }

  const confidence = metadata?.confidence ?? 0;
  const hasStrongIdentity = Boolean(metadata?.institution && metadata?.accountNumber);
  const genericName = normalizeWhitespace(String(metadata?.accountName ?? "")).toLowerCase();
  const fileNameLike = genericName.length > 0 && (genericName.includes("imported-file") || genericName === "account" || genericName === "statement");

  if (rows.length === 0) {
    return false;
  }

  if (rows.length <= 2 && confidence < 80) {
    return true;
  }

  const missingStatementAnchors =
    metadata?.openingBalance == null &&
    metadata?.endingBalance == null &&
    !metadata?.paymentDueDate &&
    metadata?.totalAmountDue == null;
  const weakDateCoverage = !metadata?.startDate || !metadata?.endDate;
  if (rows.length >= 50 && confidence < 95 && (missingStatementAnchors || weakDateCoverage)) {
    return false;
  }

  return confidence < 75 && (!hasStrongIdentity || fileNameLike);
};

export const buildOpenAIBackupSystemPrompt = (importMode: ImportMode | null | undefined, hasPageImages: boolean, hasPdfInput: boolean) => {
  const baseGuidance = [
    "You are Clover’s financial document extraction engine.",
    "You are acting as Clover’s backup parser because the deterministic parser was unsupported, weak, or incomplete.",
    "Extract transactions from financial documents into strict JSON.",
    "Do not invent data.",
    "Preserve raw text and preserve uncertainty conservatively.",
    "Mirror Clover's local parser contract: keep raw values separate from normalized values, preserve account identity, preserve transaction notes/evidence, and preserve confidence signals.",
    "Classify transactions using Clover’s allowed categories and movement types.",
    "Transfers, wallet funding, ATM withdrawals, card payments, and deposits are not spending or income by default.",
    "If a screenshot shows both a merchant currency amount and the user's wallet/account currency amount, use the wallet/account currency amount as the canonical amount when it is clearly the debited account amount.",
    "If the screenshot uses a + prefix, Added, Received, Deposit, Cash In, or Refunded, treat it as inbound movement. Otherwise default to outbound movement unless the document clearly says otherwise.",
    "Treat outgoing payments to other people as expenses and incoming payments from other people as income. Use Transfers only when the evidence identifies another account owned by the same Clover user.",
    "For crypto, fund, and investment screenshots, preserve visible asset names, symbols, quantities, order IDs, status labels, and wallet or trading-wallet references in notes or parser evidence instead of dropping them.",
    "For crypto, fund, and investment screenshots, Buy, Subscribe, and Convert Out are outbound investment activity by default; Sell, Redeem, and Convert In are inbound investment activity by default; wallet funding, settlement transfers, and withdrawals between visible internal wallets or accounts are transfers unless the screen clearly shows external spending or income.",
    "Never copy filename fragments, page numbers, mobile status text, search bars, or filter chips into transaction names or account numbers.",
    "Return JSON only.",
    "Use the schema exactly as given.",
    "Use only the allowed movement_type and category values.",
    "If a field is unknown, use null.",
    "Keep rows in source order.",
    "Prefer conservative parsing over guessing.",
    "Reconcile balances when possible and report mismatches clearly.",
  ];

  const familyGuidance =
    importMode === "receipt"
      ? [
          "Treat this as a receipt-like document first: receipt, invoice, e-receipt, restaurant bill, tax invoice, booking receipt, or wallet screenshot.",
          "Prioritize merchant, total, date, currency, payment/reference details, line items, invoice or booking numbers, and any visible wallet/account hint.",
          "If the image is a wallet screenshot, preserve recipient/sender identity, reference number, timestamp, and transfer direction conservatively.",
        ]
      : importMode === "statement"
        ? [
            "Treat this as a statement-like document first: bank statement, wallet history, card statement, or transaction-history screenshot.",
            "Prioritize statement rows, account identity, period coverage, and ending balance.",
            "For screenshots, focus on the visible transaction list and ignore app chrome or overlapping rows from stitched captures.",
            "If OCR is partial, return only the rows supported by visible evidence instead of padding the list.",
            "If the screenshot is an investment or crypto transaction history, preserve visible asset identity, quantity, order/reference IDs, and wallet or trading-wallet context while keeping transfers distinct from buys, sells, and redemptions.",
          ]
        : importMode === "portfolio"
          ? [
              "Treat this as a holdings or portfolio document first.",
              "Prefer holdings extraction over inventing ledger transactions.",
            ]
          : importMode === "account_detail"
            ? [
                "Treat this as an account-summary document first.",
                "Prefer balance, product, and account identity extraction over inventing ledger transactions.",
              ]
            : importMode === "notes"
              ? [
                  "Treat this as a notes or informal transaction list first.",
                  "Prefer conservative extraction with lower confidence when fields are incomplete.",
                  "For split-cost tables with items as rows and people as columns, return transactions: [] and populate receipt_details as a split_bill.",
                  "Put the verified bill total and menu rows in receipt_details.line_items. For every non-empty person cell in an item row, add participant_name and the exact visible cell amount to that line item's participant_allocations. Put one participant in split_allocations for each bottom-column total, using charged for the person's share; do not mark paid or due unless explicitly shown.",
                  "Set payer_name only when the table explicitly identifies who paid; otherwise keep it null.",
                  "Use Shared bill when no merchant is visible, leave the date null when absent, and never infer an account from the filename.",
                ]
              : [
                  "Classify the financial document from its visible content instead of assuming it is a bank statement.",
                  "Receipts and financial notes are valid Clover inputs even without an account number or ledger layout.",
                  "For a split-cost notes table with people as columns, return transactions: [] and put the total, item rows, and participant shares in receipt_details; do not reject it merely because it is not a bank statement.",
                ];

  const inputGuidance =
    hasPdfInput
      ? ["Use the PDF content directly and read all provided pages conservatively."]
      : hasPageImages
        ? [
            "Use the provided page images directly, not just the OCR text.",
            "For dense screenshots or noisy photos, reconstruct fragmented text conservatively before extracting rows.",
          ]
        : ["Use the provided text input conservatively."];

  return [...baseGuidance, ...familyGuidance, ...inputGuidance].join(" ");
};

const inferOpenAIDocumentFamily = (params: {
  fileName?: string | null;
  text?: string | null;
  detectedMetadata?: DetectedStatementMetadata | null;
  importMode?: ImportMode | null;
}) => {
  const combinedText = [params.fileName, params.text, params.detectedMetadata?.institution, params.detectedMetadata?.accountName]
    .filter(Boolean)
    .join("\n");
  const looksLikeInvestmentHistory =
    /gcrypto|gfunds|fund|portfolio|holdings|asset details|trading wallet|spot wallet|spot order|buy order|sell order|redeem|subscription|navpu|units|shares|market value|btc|eth|usdt|crypto/i.test(
      combinedText,
    );
  const genericImageFileName = /(?:^|[\\/])(?:img|image|photo|screenshot|screen\s*shot|dsc|pxl|\d{4}-\d{2}-\d{2}|\d{9,13})[^\\/]*\.(?:jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i.test(
    String(params.fileName ?? "")
  );
  const hasStatementEvidence = Boolean(
    params.detectedMetadata?.institution ||
      params.detectedMetadata?.accountNumber ||
      /\b(?:statement|account\s+(?:number|no\.?|balance)|transaction\s+history|available\s+balance|opening\s+balance|closing\s+balance)\b/i.test(
        String(params.text ?? "")
      )
  );

  if (params.importMode === "receipt") {
    if (/gcash|maya|wise|wallet/i.test(combinedText)) {
      return "wallet_screenshot" satisfies OpenAIDocumentFamily;
    }
    if (/ticket|booking|itinerary|electronic ticket/i.test(combinedText)) {
      return "travel_ticket" satisfies OpenAIDocumentFamily;
    }
    // Receipt photos are often cold, noisy, and named only with a camera
    // timestamp. Keep them on the compact visual route rather than promoting
    // incidental OCR terms (such as "official receipt") to a slower,
    // statement-sized schema. The receipt-specific system prompt and server
    // validation still govern the extraction, and stronger models remain in
    // the fallback chain if the compact result is unusable.
    return "generic_document" satisfies OpenAIDocumentFamily;
  }

  if (/sent via gcash|sent via maya|wallet transfer|express send|ref\.?\s*no/i.test(combinedText)) {
    if (/gcash|maya|wise|wallet/i.test(combinedText)) {
      return "wallet_screenshot" satisfies OpenAIDocumentFamily;
    }
  }

  if (params.importMode === "statement") {
    if (looksLikeInvestmentHistory) {
      return "investment_history" satisfies OpenAIDocumentFamily;
    }
    // A camera filename with no statement evidence may be a receipt, notes
    // table, or another trackable financial document. Keep the backup reader
    // in classification mode instead of forcing the bank-statement schema.
    if (genericImageFileName && !hasStatementEvidence) {
      return "generic_document" satisfies OpenAIDocumentFamily;
    }
    return "bank_statement" satisfies OpenAIDocumentFamily;
  }

  if (params.importMode === "account_detail" || params.importMode === "portfolio") {
    if (looksLikeInvestmentHistory) {
      return "investment_history" satisfies OpenAIDocumentFamily;
    }
    return "account_summary" satisfies OpenAIDocumentFamily;
  }

  return "generic_document" satisfies OpenAIDocumentFamily;
};

export const inferOpenAIImportDifficulty = (params: {
  fileName?: string | null;
  fileType?: string | null;
  text?: string | null;
  detectedMetadata?: DetectedStatementMetadata | null;
  parsedRows?: ParsedImportRow[] | null;
  importMode?: ImportMode | null;
  pageImagesCount?: number;
  documentFamily?: OpenAIDocumentFamily | null;
}) => {
  const normalizedText = String(params.text ?? "").replace(/\s+/g, " ").trim();
  const normalizedFileName = String(params.fileName ?? "").toLowerCase();
  const normalizedFileType = String(params.fileType ?? "").toLowerCase();
  const metadataConfidence = Number(params.detectedMetadata?.confidence ?? 0);
  const parsedRowsCount = Array.isArray(params.parsedRows) ? params.parsedRows.length : 0;
  const pageImagesCount = Math.max(0, Number(params.pageImagesCount ?? 0));
  const documentFamily = params.documentFamily ?? null;
  const isImageLike =
    normalizedFileType.startsWith("image/") || /\.(?:jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i.test(normalizedFileName);
  const looksLikeScreenshot =
    /screenshot|screen\s*shot|img_|received|express send|\d{4}-\d{2}-\d{2}/i.test(normalizedFileName);
  const weakText = normalizedText.length < 120;
  const veryWeakText = normalizedText.length < 50;
  const sparseRows = parsedRowsCount === 0;
  // New single-screen statements have no OCR or institution hint before the
  // first transcription. That absence is expected, not evidence that the
  // screenshot is difficult. Try the fast model first and retain the strong
  // model through the transcript quality gate when the first read is weak.
  const isSingleUnknownStatementScreenshot =
    params.importMode === "statement" &&
    isImageLike &&
    pageImagesCount === 1 &&
    sparseRows &&
    veryWeakText &&
    metadataConfidence < 55 &&
    documentFamily === "generic_document";

  if (
    (!isSingleUnknownStatementScreenshot && veryWeakText) ||
    (isImageLike && weakText && sparseRows && !isSingleUnknownStatementScreenshot) ||
    (isImageLike && metadataConfidence < 55 && !isSingleUnknownStatementScreenshot) ||
    (params.importMode === "receipt" && weakText) ||
    (documentFamily === "wallet_screenshot" && weakText) ||
    (documentFamily === "investment_history" && weakText) ||
    pageImagesCount >= 4
  ) {
    return "hard" satisfies OpenAIImportDifficulty;
  }

  if (
    looksLikeScreenshot ||
    weakText ||
    metadataConfidence < 75 ||
    documentFamily === "investment_history" ||
    documentFamily === "restaurant_receipt" ||
    documentFamily === "tax_invoice" ||
    pageImagesCount >= 2
  ) {
    return "medium" satisfies OpenAIImportDifficulty;
  }

  return "easy" satisfies OpenAIImportDifficulty;
};

const buildOpenAIDocumentFamilyGuidance = (family: OpenAIDocumentFamily) => {
  switch (family) {
    case "wallet_screenshot":
      return [
        "This is likely a wallet or payment-app screenshot.",
        "Prioritize recipient/sender name, phone, amount, transfer direction, reference number, timestamp, and wallet identity.",
        "Do not turn long screenshot text into the transaction title if a cleaner transfer label is supported by the evidence.",
      ].join(" ");
    case "investment_history":
      return [
        "This is likely a crypto, fund, or investment transaction-history or holdings screenshot.",
        "Prioritize provider and account identity, asset names or symbols, order or reference IDs, status labels, quantity or units, cash amount, fees, timestamps, and wallet or trading-wallet context.",
        "Do not invent balances or holdings when the visible screen only shows transaction rows, and do not collapse asset or order details into generic names when stronger evidence is visible.",
      ].join(" ");
    case "restaurant_receipt":
      return [
        "This is likely an itemized restaurant or merchant receipt.",
        "Prioritize merchant name, line items, subtotal, taxes, service charge, discount, payment method, and final total.",
      ].join(" ");
    case "tax_invoice":
      return [
        "This is likely an invoice or official receipt.",
        "Prioritize supplier, invoice/document number, subtotal, VAT/tax, discounts, and final payable amount.",
      ].join(" ");
    case "travel_ticket":
      return [
        "This is likely a travel or ticket receipt.",
        "Prioritize booking reference, carrier/provider, route, travel date, passenger/account identifiers, and total paid.",
      ].join(" ");
    case "bank_statement":
      return [
        "This is likely a statement or transaction-history document.",
        "Prioritize account identity, date coverage, transaction rows, and ending balance reconciliation.",
      ].join(" ");
    case "account_summary":
      return [
        "This is likely an account summary, balance screen, or holdings screen.",
        "Prefer balance and product identity extraction over inventing ledger transactions.",
      ].join(" ");
    default:
      return "This is a generic financial document. Prefer conservative extraction and preserve uncertainty.";
  }
};

const openAITranscriptLooksWeak = (transcript: { transcript: string; confidence: number } | null) => {
  if (!transcript) {
    return true;
  }

  const normalizedLength = transcript.transcript.replace(/\s+/g, " ").trim().length;
  return transcript.confidence < 72 || normalizedLength < 80;
};

const buildOpenAiReviewReasons = (params: {
  confidenceScore: number;
  category: AllowedCategory;
  movementType: AllowedMovementType;
  parserEvidenceText?: string | null;
  notes?: string | null;
}) => {
  const reasons = new Set<string>();
  const evidenceText = `${params.parserEvidenceText ?? ""} ${params.notes ?? ""}`.trim();

  if (params.confidenceScore < 85) {
    reasons.add("Low-confidence OCR or parser evidence");
  }

  if (params.category === "Other") {
    reasons.add("Needs category review");
  }

  if (params.movementType === "internal_movement") {
    reasons.add("Needs transfer direction review");
  }

  if (/\b(?:unclear|partial|blurry|cropped|fragmented)\b/i.test(evidenceText)) {
    reasons.add("Import evidence is partial");
  }

  return Array.from(reasons);
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
  fileDataBase64?: string | null;
  importMode?: ImportMode | null;
}) => {
  const institution = params.detectedMetadata?.institution ?? null;
  const accountType = params.detectedMetadata?.accountType ?? null;
  const documentFamily = inferOpenAIDocumentFamily({
    fileName: params.fileName ?? null,
    text: params.text,
    detectedMetadata: params.detectedMetadata,
    importMode: params.importMode ?? null,
  });
  const bankInstructionJson = buildBankInstructionJson({
    institution,
    accountType,
    accountName: params.detectedMetadata?.accountName ?? null,
  });

  return [
    "Parse this financial document for Clover.",
    "",
    `File name: ${params.fileName ?? "unknown"}`,
    `File type: ${params.fileType ?? "unknown"}`,
    `Import mode: ${params.importMode ?? "statement"}`,
    `Inferred document family: ${documentFamily}`,
    "",
    `Known institution: ${institution ?? "null"}`,
    `Known parser result: ${JSON.stringify(buildDeterministicParserSummary({ detectedMetadata: params.detectedMetadata, parsedRows: params.parsedRows }))}`,
    `Bank-specific instructions: ${JSON.stringify(bankInstructionJson)}`,
    `Document-family guidance: ${buildOpenAIDocumentFamilyGuidance(documentFamily)}`,
    GENERIC_PARSER_GUIDANCE,
    GENERIC_NORMALIZATION_GUIDANCE,
    "Generic few-shot examples:",
    GENERIC_FEW_SHOT_EXAMPLES,
    "For credit card statements, capture payment due date and total amount due whenever the statement shows them.",
    ...(params.importMode === "receipt"
      ? [
          "This input is a receipt, invoice, e-receipt, order confirmation, ticket receipt, manual receipt photo, or receipt-like PDF/email screenshot.",
          "Extract the merchant, date, total amount, currency, subtotal, tax, service charge, discounts, tips, and any visible account or card association.",
          "If the receipt is itemized, extract each line item with description, quantity, unit price, and amount.",
          "If the receipt is a split bill or group-summary receipt, extract each participant's charged/paid/due amounts when shown.",
          "If the receipt has a ticket, booking, invoice, order, or reference number, capture it in the matching field.",
          "If the receipt clearly mentions a card, wallet, or last 4 digits, set receipt_account_match with the best account_name/account_last4 guess and a confidence score. Use null if there is no clear match.",
          "If the account is not visible, keep the row conservative and preserve the receipt details for later matching.",
        ]
      : []),
    ...(params.importMode === "notes"
      ? [
          "This input is a notes-app screenshot of a transaction list. The layout may be informal, so prefer conservative extraction and lower confidence when fields are partial.",
          "For a split-cost table with items as rows and people as columns, return transactions: [] and populate receipt_details with receipt_type split_bill.",
          "Put the verified table total and each menu row in receipt_details.line_items. For every non-empty person cell in an item row, add participant_name and the exact visible cell amount to that line item's participant_allocations. Put one participant in split_allocations per bottom-column total, using charged for that person's share; keep paid and due null unless the table explicitly proves them.",
          "Set payer_name only when the note explicitly identifies who paid; otherwise keep it null.",
          "Use Shared bill when no merchant is visible, leave the date null when absent, and never infer an account from the filename.",
        ]
      : []),
    ...(params.importMode === "portfolio"
      ? [
          "This input is an investment portfolio or holdings screen. Preserve the visible account identity and extract holdings, balances, symbols, and gain/loss details conservatively.",
          "Put each visible position into the holdings array with asset name, symbol, units, market value, current value, and any visible gain/loss fields.",
          "For crypto or investment screenshots, preserve visible asset names or symbols, order IDs, units, settlement notes, and wallet or trading-wallet labels in notes or parser evidence.",
          "If the screen does not show true ledger transactions, keep the transaction array empty and do not invent spend rows.",
        ]
      : []),
    ...(params.importMode === "account_detail"
      ? [
          "This input is an account details or balance summary screen. Preserve the visible account identity, balance, and product details conservatively.",
          "If the screen shows investment positions or asset rows, put them into the holdings array instead of inventing transactions.",
          "For crypto or investment screenshots, preserve visible asset names or symbols, order IDs, units, settlement notes, and wallet or trading-wallet labels in notes or parser evidence.",
          "If the screen does not show true ledger transactions, keep the transaction array empty and do not invent spend rows.",
        ]
      : []),
    "",
    ...(params.fileDataBase64 && String(params.fileType ?? "").toLowerCase().includes("pdf")
      ? [
          "This PDF file itself was provided as input, so use the PDF content directly.",
          "Read the document pages in order and extract the visible financial details conservatively.",
        ]
      : params.pageImages?.length
      ? [
          "This is a scanned statement, screenshot, or image-heavy file. The text layer may be empty or incomplete.",
          "Read the page images directly and extract the visible financial details for the selected document family.",
          "If the document is a statement, extract every transaction row from the visible statement pages and anchor the final balance from the last page footer when present.",
          "If the image is a Wise mobile transaction-history screenshot, treat it as a wallet statement even when no account number or ending balance is visible. For rows with two amounts, use the second/lower smaller-font account-currency amount as the transaction amount, even when it is numerically larger than the bold merchant-currency amount. Preserve the bold first merchant-currency amount as supporting evidence.",
          "If the image is a crypto, fund, or investment transaction-history screenshot, preserve asset identity, quantity, order/reference IDs, status labels, and wallet or trading-wallet context. Do not invent holdings or balances when the screen only shows activity rows.",
          "If the document is a portfolio or account-detail page that shows holdings or positions, extract those into holdings instead of transaction rows.",
          "If the document is a receipt, portfolio screen, or account detail screen, keep the transaction array empty unless the page clearly shows true ledger rows.",
          "If it is a financial notes image, create conservative transaction rows for each clearly labeled paid, payable, due, final, or net-total amount that Clover can track.",
          "Exception: when the note is a split-cost table with items as rows and people as columns, return transactions: [] and populate receipt_details as a split_bill. Put the verified bill total and menu rows in receipt_details.line_items. For every non-empty person cell in an item row, add participant_name and the exact visible cell amount to that line item's participant_allocations. Put each person's bottom-column share in split_allocations.charged. Do not create one transaction per participant or per menu item.",
          "Keep date null when none is visible, set review_required true, and do not turn subtotal, fee, discount, participant shares, or intermediate arithmetic rows into extra transactions.",
          "Use the account number and balance shown in the page image, not any earlier summary-like number unless it is the final ending balance.",
          "",
        ]
      : []),
    "Extracted text:",
    params.text,
    "",
    ...(params.fileDataBase64 && String(params.fileType ?? "").toLowerCase().includes("pdf")
      ? ["PDF input provided via file_data."]
      : []),
    "",
    `Image pages: ${(params.pageImages ?? []).map((page) => page.page).join(", ") || "none"}`,
    "",
    "Return only valid JSON matching the schema.",
  ].join("\n");
};

// Cold, one-page images have no reliable local text or institution identity.
// Sending statement-specific examples and bank rules in that case costs a
// sizeable portion of the first vision request without improving extraction.
// Keep the same strict response schema and server-side validation, but give
// the model the focused instructions it needs to classify a receipt, note, or
// unfamiliar financial image quickly.
const buildCompactGenericImageInputPayload = (params: {
  fileName?: string | null;
  fileType?: string | null;
}) =>
  [
    "Parse this one-page financial image for Clover.",
    `File name: ${params.fileName ?? "unknown"}`,
    `File type: ${params.fileType ?? "unknown"}`,
    "Classify it as statement, receipt, notes, portfolio, or account_detail from visible evidence.",
    "Extract only clearly visible, trackable financial records. Do not invent data or use phone UI text as a record.",
    "For a handwritten or digital financial note, create one conservative transaction for each clearly labeled paid, payable, due, final, net-total, or allocated amount. Do not create subtotal, fee, discount, or intermediate arithmetic rows.",
    "Preserve raw names and supporting evidence. Use null for unavailable account, receipt, or holdings details. Set review_required when any material field is uncertain.",
    "Return only valid JSON matching the supplied schema.",
  ].join("\n");

const buildImageTranscriptionInputPayload = (params: {
  fileName?: string | null;
  fileType?: string | null;
  detectedMetadata: DetectedStatementMetadata | null;
  pageImages?: Array<{ page: number; dataUrl: string }> | null;
  fileDataBase64?: string | null;
  importMode?: ImportMode | null;
}) => {
  const institution = params.detectedMetadata?.institution ?? null;
  const accountType = params.detectedMetadata?.accountType ?? null;
  const documentFamily = inferOpenAIDocumentFamily({
    fileName: params.fileName ?? null,
    detectedMetadata: params.detectedMetadata,
    importMode: params.importMode ?? null,
  });
  const bankInstructionJson = buildBankInstructionJson({
    institution,
    accountType,
    accountName: params.detectedMetadata?.accountName ?? null,
  });

  return [
    "Transcribe this financial document image for Clover.",
    "",
    `File name: ${params.fileName ?? "unknown"}`,
    `File type: ${params.fileType ?? "unknown"}`,
    `Import mode: ${params.importMode ?? "statement"}`,
    `Inferred document family: ${documentFamily}`,
    "",
    `Known institution: ${institution ?? "null"}`,
    `Known parser result: ${JSON.stringify(buildDeterministicParserSummary({ detectedMetadata: params.detectedMetadata, parsedRows: [] }))}`,
    `Bank-specific instructions: ${JSON.stringify(bankInstructionJson)}`,
    `Document-family guidance: ${buildOpenAIDocumentFamilyGuidance(documentFamily)}`,
    GENERIC_PARSER_GUIDANCE,
    "Transcription guidance:",
    "- Produce a faithful OCR-style transcription in reading order.",
    "- Preserve line breaks, table rows, amounts, dates, account labels, merchant names, and page structure.",
    "- Do not summarize, normalize, or guess missing text.",
    "- Include page markers like [PAGE 1], [PAGE 2], etc. when multiple images are provided.",
    "- If the image is clearly a receipt, portfolio screen, account-detail screen, notes screenshot, or transaction-history screenshot, say so in document_type.",
    "- Wise mobile transaction-history screenshots are statement-like wallet histories; preserve date groupings, merchant names, statuses such as Added/Refunded/Sent, plus signs, bold merchant-currency amounts, and smaller account-currency amounts.",
    "- Crypto, fund, and investment screenshots are also statement-like when they show dated activity rows; preserve visible asset names, symbols, quantities, order IDs, status labels, wallet or trading-wallet labels, and cash amounts exactly as shown.",
    "- Keep the transcript compact but complete enough for the downstream parser to read it back into rows or receipt details.",
    "",
    ...(params.importMode === "receipt"
      ? [
          "The source is likely a receipt, invoice, order confirmation, or receipt-like photo.",
          "Keep merchant, dates, totals, taxes, service charges, payment method, and line items in the transcript.",
        ]
      : []),
    ...(params.importMode === "portfolio"
      ? [
          "The source is likely an investment portfolio or holdings screen.",
          "Keep symbols, shares/units, market value, current value, gain/loss, and account labels in the transcript.",
        ]
      : []),
    ...(params.importMode === "account_detail"
      ? [
          "The source is likely an account summary or balance detail screen.",
          "Keep account names, account numbers, balances, and visible product labels in the transcript.",
        ]
      : []),
    ...(params.importMode === "statement"
      ? [
          "The source is a bank statement. If it spans multiple pages, continue across the pages instead of stopping after the first visible balance box.",
          "Capture every visible transaction row, the account number, and the final ending balance from the last page footer or summary line when present.",
          "For mobile wallet transaction-history screenshots such as Wise, capture visible rows even when the screen has no account number or final balance.",
          "For crypto, fund, and investment transaction-history screenshots, capture visible rows even when the screen has no formal account number, and preserve asset names, symbols, order IDs, quantities, and status labels in the transcript.",
        ]
      : []),
    ...(params.fileDataBase64 && String(params.fileType ?? "").toLowerCase().includes("pdf")
      ? ["The PDF file itself was provided as input. Use it directly if helpful."]
      : []),
    "",
    "Extracted text:",
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
    paymentDueDate: null,
    totalAmountDue: null,
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
  fileDataBase64?: string | null;
  preferPrimary?: boolean;
  importMode?: ImportMode | null;
  pageImageLimit?: number | null;
  timeoutMs?: number | null;
  retryTimeoutMs?: number | null;
}): Promise<
  | {
      documentType: "statement" | "receipt" | "notes" | "portfolio" | "account_detail";
      metadata: DetectedStatementMetadata;
      holdings: OpenAIParsedHolding[];
      receiptAccountMatch: ReceiptAccountMatch | null;
      receiptDetails: OpenAIParsedReceiptDetails | null;
      rows: ParsedImportRow[];
      model: string;
      promptVersion: string;
      audit: {
        sourceFilename: string | null;
        confidence: number;
        schemaValidated: boolean;
        schemaValidationResult: string;
        rawResponse: string;
        quality?: ReturnType<typeof assessStatementExtractionQuality>;
      };
    }
  | null
> => {
  const deterministicGfundsAccountDetail =
    (params.importMode === "account_detail" || params.importMode === "statement")
      ? parseGfundsAccountDetailSnapshotText(params.text, params.fileName ?? "")
      : null;
  if (deterministicGfundsAccountDetail) {
    return {
      documentType: deterministicGfundsAccountDetail.documentType,
      metadata: deterministicGfundsAccountDetail.metadata,
      holdings: deterministicGfundsAccountDetail.holdings.map(toDeterministicHolding),
      receiptAccountMatch: null,
      receiptDetails: null,
      rows: [],
      model: "deterministic_gfunds_account_detail",
      promptVersion: OPENAI_PROMPT_VERSION,
      audit: {
        sourceFilename: params.fileName ?? null,
        confidence: deterministicGfundsAccountDetail.metadata.confidence ?? 0,
        schemaValidated: true,
        schemaValidationResult: "deterministic_gfunds_account_detail",
        rawResponse: JSON.stringify({
          document_type: deterministicGfundsAccountDetail.documentType,
          holdings: deterministicGfundsAccountDetail.holdings.length,
        }),
      },
    };
  }
  const deterministicGfundsPortfolio =
    (params.importMode === "portfolio" || params.importMode === "account_detail" || params.importMode === "statement")
      ? parseGfundsPortfolioSnapshotText(params.text, params.fileName ?? "")
      : null;
  if (deterministicGfundsPortfolio) {
    return {
      documentType: deterministicGfundsPortfolio.documentType,
      metadata: deterministicGfundsPortfolio.metadata,
      holdings: deterministicGfundsPortfolio.holdings.map(toDeterministicHolding),
      receiptAccountMatch: null,
      receiptDetails: null,
      rows: [],
      model: "deterministic_gfunds_portfolio",
      promptVersion: OPENAI_PROMPT_VERSION,
      audit: {
        sourceFilename: params.fileName ?? null,
        confidence: deterministicGfundsPortfolio.metadata.confidence ?? 0,
        schemaValidated: true,
        schemaValidationResult: "deterministic_gfunds_portfolio",
        rawResponse: JSON.stringify({
          document_type: deterministicGfundsPortfolio.documentType,
          holdings: deterministicGfundsPortfolio.holdings.length,
        }),
      },
    };
  }

  const env = getEnv();
  const apiKey = (env as { OPENAI_API_KEY?: string }).OPENAI_API_KEY?.trim();
  const isPrimaryMode =
    params.preferPrimary ?? isTruthyEnvValue((env as { OPENAI_IMPORT_PARSER_PRIMARY?: string }).OPENAI_IMPORT_PARSER_PRIMARY);
  const noisyVisionPreferredInstitutions = new Set(["Landbank", "EastWest", "UCPB", "Chinabank", "China Bank"]);
  const isNoisyVisionInstitution =
    typeof params.detectedMetadata?.institution === "string" && noisyVisionPreferredInstitutions.has(params.detectedMetadata.institution);
  const shouldForceOpenAIFallbackForNoisyInstitution =
    isNoisyVisionInstitution && (params.importMode ?? "statement") === "statement";
  if (
    !apiKey ||
    (!isPrimaryMode &&
      !shouldForceOpenAIFallbackForNoisyInstitution &&
      !responseLooksUseful(params.detectedMetadata, params.parsedRows, params.importMode ?? null))
  ) {
    return null;
  }

  const inputText = buildModelInputText(params.text);
  const inferredDocumentFamily = inferOpenAIDocumentFamily({
    fileName: params.fileName ?? null,
    text: inputText,
    detectedMetadata: params.detectedMetadata,
    importMode: params.importMode ?? null,
  });
  const inferredDifficulty = inferOpenAIImportDifficulty({
    fileName: params.fileName ?? null,
    fileType: params.fileType ?? null,
    text: inputText,
    detectedMetadata: params.detectedMetadata,
    parsedRows: params.parsedRows,
    importMode: params.importMode ?? null,
    pageImagesCount: params.pageImages?.length ?? 0,
    documentFamily: inferredDocumentFamily,
  });
  const promptImportMode =
    inferredDocumentFamily === "generic_document" &&
    params.importMode === "statement" &&
    (params.pageImages?.length ?? 0) > 0
      ? null
      : params.importMode ?? null;

  const pageImagesInput = params.pageImages ?? [];
  const isReceiptMode = params.importMode === "receipt";
  const pageImageLimit =
    typeof params.pageImageLimit === "number" && Number.isFinite(params.pageImageLimit)
      ? Math.max(1, Math.floor(params.pageImageLimit))
      : isReceiptMode
        ? inferredDifficulty === "hard"
          ? 3
          : 1
        : params.text.trim().length === 0
          ? inferredDifficulty === "hard"
            ? 8
            : 6
          : isNoisyVisionInstitution
            ? 8
            : 2;
  const selectedVisionPages = selectRepresentativeVisionPages(
    pageImagesInput,
    Math.min(pageImageLimit, pageImagesInput.length)
  );
  const pageImagesToSend = await compactVisionPageImages(selectedVisionPages);
  const pdfFileDataBase64 =
    params.fileDataBase64 &&
    String(params.fileType ?? "").toLowerCase().includes("pdf") &&
    pageImagesToSend.length === 0
      ? params.fileDataBase64
      : null;

  const isVisualImageImport =
    pageImagesToSend.length > 0 &&
    !pdfFileDataBase64;
  const isImageStatementMode =
    (params.importMode ?? "statement") === "statement" &&
    isVisualImageImport;
  const isSinglePageGenericImage =
    inferredDocumentFamily === "generic_document" &&
    isVisualImageImport &&
    pageImagesToSend.length === 1;
  const useColdVisualFastPath = shouldUseColdVisualImportFastPath({
    importMode: params.importMode ?? null,
    documentFamily: inferredDocumentFamily,
    pageImageCount: pageImagesToSend.length,
    textLength: inputText.trim().length,
    parsedRowsCount: params.parsedRows.length,
    metadataConfidence: Number(params.detectedMetadata?.confidence ?? 0),
    hasInstitution: Boolean(
      params.detectedMetadata?.institution &&
      params.detectedMetadata.institution !== "Unknown"
    ),
    hasAccountIdentity: Boolean(
      params.detectedMetadata?.accountNumber ||
      params.detectedMetadata?.accountName
    ),
  });

  const userPrompt = isSinglePageGenericImage && inputText.trim().length === 0
    ? buildCompactGenericImageInputPayload({
        fileName: params.fileName ?? null,
        fileType: params.fileType ?? null,
      })
    : buildOpenAIInputPayload({
        fileName: params.fileName ?? null,
        fileType: params.fileType ?? null,
        detectedMetadata: params.detectedMetadata,
        parsedRows: params.parsedRows,
        text: inputText,
        pageImages: pageImagesToSend,
        fileDataBase64: pdfFileDataBase64,
        importMode: promptImportMode,
      });
  const systemPrompt = buildOpenAIBackupSystemPrompt(promptImportMode, pageImagesToSend.length > 0, Boolean(pdfFileDataBase64));
  const fastModel = resolveOpenAIImportModel(
    (env as { OPENAI_IMPORT_PARSER_MODEL?: string }).OPENAI_IMPORT_PARSER_MODEL,
    OPENAI_IMPORT_FAST_MODEL_FALLBACK,
    "fast model",
  );
  const imageModel = resolveOpenAIImportModel(
    (env as { OPENAI_IMPORT_PARSER_IMAGE_MODEL?: string }).OPENAI_IMPORT_PARSER_IMAGE_MODEL,
    fastModel,
    "image model",
  );
  const textModel = fastModel;
  const strongModel = resolveOpenAIImportModel(
    (env as { OPENAI_IMPORT_PARSER_STRONG_MODEL?: string }).OPENAI_IMPORT_PARSER_STRONG_MODEL,
    OPENAI_IMPORT_STRONG_MODEL_FALLBACK,
    "strong model",
  );
  const genericDocumentModel = OPENAI_IMPORT_FAST_MODEL_FALLBACK;
  const pdfModel = resolveOpenAIImportModel(
    (env as { OPENAI_IMPORT_PARSER_PDF_MODEL?: string }).OPENAI_IMPORT_PARSER_PDF_MODEL,
    OPENAI_IMPORT_PDF_MODEL_FALLBACK,
    "pdf model",
  );
  const model = useColdVisualFastPath
    ? fastModel
    : pdfFileDataBase64
    ? pdfModel
    : pageImagesToSend.length > 0
      ? inferredDocumentFamily === "generic_document"
        ? genericDocumentModel
        : inferredDifficulty === "hard"
        ? strongModel
        : isReceiptMode || params.importMode === "notes" || params.importMode === "account_detail"
          ? imageModel
          : strongModel
      : textModel;
  const modelFallbackChain = dedupeOpenAIImportModels(
    useColdVisualFastPath
      ? [fastModel]
      : pdfFileDataBase64
      ? inferredDifficulty === "hard"
        ? [strongModel, pdfModel, OPENAI_IMPORT_LEGACY_PDF_MODEL_FALLBACK]
        : [model, strongModel, OPENAI_IMPORT_LEGACY_PDF_MODEL_FALLBACK]
      : pageImagesToSend.length > 0
        ? inferredDocumentFamily === "generic_document"
          ? [genericDocumentModel, imageModel, strongModel, textModel, OPENAI_IMPORT_LEGACY_IMAGE_MODEL_FALLBACK, OPENAI_IMPORT_LEGACY_TEXT_MODEL_FALLBACK]
          : inferredDifficulty === "hard"
          ? [strongModel, imageModel, textModel, OPENAI_IMPORT_LEGACY_IMAGE_MODEL_FALLBACK, OPENAI_IMPORT_LEGACY_TEXT_MODEL_FALLBACK]
          : inferredDocumentFamily === "wallet_screenshot" || inferredDocumentFamily === "investment_history"
            ? [strongModel, imageModel, textModel, OPENAI_IMPORT_LEGACY_IMAGE_MODEL_FALLBACK, OPENAI_IMPORT_LEGACY_TEXT_MODEL_FALLBACK]
            : [model, imageModel, textModel, OPENAI_IMPORT_LEGACY_IMAGE_MODEL_FALLBACK, OPENAI_IMPORT_LEGACY_TEXT_MODEL_FALLBACK]
        : [model, textModel, OPENAI_IMPORT_LEGACY_TEXT_MODEL_FALLBACK]
  );
  const fallbackChain = modelFallbackChain;
  // A one-page generic image (receipt, financial note, or unfamiliar phone
  // capture) needs a compact structured result, not a statement-sized output
  // budget. Keeping this below the general 3k cap reduces cold vision latency
  // while leaving multi-page and known-statement quality paths unchanged.
  const maxOutputTokens = isSinglePageGenericImage
    ? 2_400
    : isReceiptMode
      ? 2_500
      : inferredDocumentFamily === "generic_document"
        ? 3_000
        : pdfFileDataBase64
          ? 6_000
          : isImageStatementMode
            ? 8_000
            : pageImagesToSend.length > 0
              ? params.text.trim().length === 0
                ? 6_000
                : 2_500
              : 4_000;
  const buildUserContent = (pageImages: Array<{ page: number; dataUrl: string }>) => {
    const userContent: Array<Record<string, unknown>> = [{ type: "input_text", text: userPrompt }];
    if (pdfFileDataBase64) {
      userContent.unshift({
        type: "input_file",
        filename: params.fileName ?? "imported-file.pdf",
        file_data: `data:application/pdf;base64,${pdfFileDataBase64}`,
      });
      return userContent;
    }
    for (const pageImage of pageImages) {
      userContent.push({
        type: "input_image",
        image_url: pageImage.dataUrl,
      });
    }
    return userContent;
  };

  const callOpenAI = async (
    selectedModel: string,
    pageImages: Array<{ page: number; dataUrl: string }>,
    timeoutMs: number,
    systemInstructions = systemPrompt
  ) => {
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
          max_output_tokens: maxOutputTokens,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: systemInstructions }],
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

  const callOpenAIWithFallbackModels = async (
    models: string[],
    pageImages: Array<{ page: number; dataUrl: string }>,
    timeoutMs: number,
    deadlineMs: number
  ): Promise<{ response: Response; model: string } | null> => {
    for (const candidateModel of models) {
      const attemptTimeoutMs = getRemainingOpenAIImportAttemptTimeout({
        deadlineMs,
        requestedTimeoutMs: timeoutMs,
      });
      if (attemptTimeoutMs === null) {
        return null;
      }

      let response = await callOpenAI(candidateModel, pageImages, attemptTimeoutMs);
      let errorText = shouldReadOpenAIImportErrorBody(response)
        ? await response!.text().catch(() => "")
        : response
          ? ""
          : "timeout";

      if (response && shouldRetryWithFewerImages(response.status, errorText, pageImages.length)) {
        console.warn("OpenAI import fallback request retried with fewer page images", {
          model: candidateModel,
          status: response.status,
          statusText: response.statusText,
          imageCount: pageImages.length,
        });
        const reducedImageTimeoutMs = getRemainingOpenAIImportAttemptTimeout({
          deadlineMs,
          requestedTimeoutMs: timeoutMs,
        });
        if (reducedImageTimeoutMs === null) {
          return null;
        }
        response = await callOpenAI(candidateModel, pageImages.slice(0, 1), reducedImageTimeoutMs);
        errorText = shouldReadOpenAIImportErrorBody(response)
          ? await response!.text().catch(() => "")
          : response
            ? ""
            : "timeout";
      }

      if (response?.ok) {
        return { response, model: candidateModel };
      }

      console.warn("OpenAI import fallback model attempt failed", {
        model: candidateModel,
        status: response?.status ?? null,
        statusText: response?.statusText ?? null,
        errorText: errorText.slice(0, 2_000) || null,
      });

      if (!openAIImportFailureLooksRetryable(response?.status ?? null, errorText)) {
        break;
      }
    }

    return null;
  };

  try {
    const primaryTimeoutMs =
      typeof params.timeoutMs === "number" && Number.isFinite(params.timeoutMs)
        ? Math.max(10_000, Math.floor(params.timeoutMs))
        : useColdVisualFastPath
          ? 28_000
        : isReceiptMode
          ? inferredDifficulty === "hard"
            ? 40_000
            : model === imageModel
              ? 28_000
              : 18_000
          : model === imageModel
            ? inferredDifficulty === "hard"
              ? 90_000
              : params.text.trim().length === 0
                ? 120_000
                : 60_000
            : pdfFileDataBase64
              ? inferredDifficulty === "hard"
                ? 150_000
                : 120_000
              : inferredDifficulty === "hard"
                ? 60_000
                : 45_000;
    const retryTimeoutMs =
      typeof params.retryTimeoutMs === "number" && Number.isFinite(params.retryTimeoutMs)
        ? Math.max(10_000, Math.floor(params.retryTimeoutMs))
        : isReceiptMode
          ? inferredDifficulty === "hard"
            ? 24_000
            : 16_000
          : params.text.trim().length === 0
            ? inferredDifficulty === "hard"
              ? 75_000
              : 60_000
            : inferredDifficulty === "hard"
              ? 55_000
              : 45_000;
    const totalFallbackBudgetMs =
      typeof params.timeoutMs === "number" && Number.isFinite(params.timeoutMs)
        ? Math.max(10_000, Math.floor(params.timeoutMs))
        : useColdVisualFastPath
          ? 75_000
        : isReceiptMode
          ? 55_000
          : pdfFileDataBase64
            ? 100_000
            : pageImagesToSend.length > 0
              ? 120_000
              : 75_000;
    const fallbackDeadlineMs = Date.now() + totalFallbackBudgetMs;
    const initialPageImages =
      useColdVisualFastPath && pageImagesToSend.length > 2
        ? pageImagesToSend.slice(0, 2)
        : pageImagesToSend;
    const attempted = await callOpenAIWithFallbackModels(
      fallbackChain,
      initialPageImages,
      primaryTimeoutMs,
      fallbackDeadlineMs
    );
    const attemptedResult =
      attempted ??
      (useColdVisualFastPath
        ? await callOpenAIWithFallbackModels(
            dedupeOpenAIImportModels([strongModel, imageModel, OPENAI_IMPORT_LEGACY_IMAGE_MODEL_FALLBACK]),
            pageImagesToSend,
            retryTimeoutMs,
            fallbackDeadlineMs
          )
        : pageImagesToSend.length > 0 && model !== textModel
        ? await callOpenAIWithFallbackModels(
            dedupeOpenAIImportModels([textModel, OPENAI_IMPORT_LEGACY_TEXT_MODEL_FALLBACK]),
            pageImagesToSend.slice(0, 1),
            retryTimeoutMs,
            fallbackDeadlineMs
          )
        : null);
    if (!attemptedResult) {
      return null;
    }

    let selectedModel = attemptedResult.model;
    let payload = (await attemptedResult.response.json()) as Record<string, unknown>;
    let outputText = extractOutputText(payload);
    if (!outputText) {
      return null;
    }

    let parsedJson = parseStructuredJsonText(outputText);
    if (!parsedJson) {
      console.warn("OpenAI import fallback returned unparseable JSON", {
        sample: outputText.slice(0, 500),
      });
      return {
        documentType: params.importMode ?? "statement",
        metadata: buildFallbackMetadata(params.detectedMetadata),
        holdings: [],
        receiptAccountMatch: null,
        receiptDetails: null,
        rows: [],
        model: selectedModel,
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
    let validation = importedStatementSchema.safeParse(parsedJson);
    if (
      useColdVisualFastPath &&
      validation.success &&
      coldLayoutCandidateNeedsStrongRetry({
        candidate: validation.data,
        pageImageCount: pageImagesToSend.length,
      })
    ) {
      const initialCandidateScore = scoreColdLayoutCandidate(validation.data);
      const strongRetryTimeoutMs = getRemainingOpenAIImportAttemptTimeout({
        deadlineMs: fallbackDeadlineMs,
        requestedTimeoutMs: retryTimeoutMs,
      });
      const strongRetry =
        strongRetryTimeoutMs === null
          ? null
          : await callOpenAIWithFallbackModels(
              dedupeOpenAIImportModels([strongModel, imageModel, OPENAI_IMPORT_LEGACY_IMAGE_MODEL_FALLBACK]),
              pageImagesToSend,
              strongRetryTimeoutMs,
              fallbackDeadlineMs
            );
      if (strongRetry) {
        const strongPayload = (await strongRetry.response.json()) as Record<string, unknown>;
        const strongOutputText = extractOutputText(strongPayload);
        const strongParsedJson = strongOutputText ? parseStructuredJsonText(strongOutputText) : null;
        const strongValidation = strongParsedJson ? importedStatementSchema.safeParse(strongParsedJson) : null;
        if (
          strongOutputText &&
          strongParsedJson &&
          strongValidation?.success &&
          scoreColdLayoutCandidate(strongValidation.data) > initialCandidateScore
        ) {
          payload = strongPayload;
          outputText = strongOutputText;
          parsedJson = strongParsedJson;
          validation = strongValidation;
          selectedModel = strongRetry.model;
        }
      }
    }
    const splitBillDetailsMissingDespiteDetection =
      params.importMode === "notes" &&
      validation.success &&
      validation.data.receipt_details === null &&
      validation.data.transactions.length === 0 &&
      /\b(?:split[- ]?bill|shared bill|split-cost|participant totals?)\b/i.test(outputText);
    if (splitBillDetailsMissingDespiteDetection) {
      const repairTimeoutMs = getRemainingOpenAIImportAttemptTimeout({
        deadlineMs: fallbackDeadlineMs,
        requestedTimeoutMs: retryTimeoutMs,
      });
      const repairResponse =
        repairTimeoutMs === null
          ? null
          : await callOpenAI(
              selectedModel,
              pageImagesToSend,
              repairTimeoutMs,
              `${systemPrompt} CRITICAL REPAIR: You already recognized the image as a split-cost or shared-bill table. receipt_details MUST be a non-null object with receipt_type split_bill, total set to the visible grand total, every visible menu row in line_items, every non-empty person cell represented in that line item's participant_allocations, and every participant bottom-column total in split_allocations.charged. Keep payer_name null unless the payer is explicit. transactions MUST remain empty. Do not claim that details were captured while returning receipt_details null.`
            );
      if (repairResponse?.ok) {
        const repairPayload = (await repairResponse.json()) as Record<string, unknown>;
        const repairOutputText = extractOutputText(repairPayload);
        const repairParsedJson = repairOutputText ? parseStructuredJsonText(repairOutputText) : null;
        const repairValidation = repairParsedJson ? importedStatementSchema.safeParse(repairParsedJson) : null;
        if (repairOutputText && repairParsedJson && repairValidation?.success) {
          payload = repairPayload;
          outputText = repairOutputText;
          parsedJson = repairParsedJson;
          validation = repairValidation;
        }
      }
    }
    const schemaValidated = validation.success;
    const validationSummary = schemaValidated ? "valid" : validation.error.issues.slice(0, 5).map((issue) => issue.message).join("; ");
    if (!schemaValidated) {
      console.warn("OpenAI import fallback returned invalid schema", {
        issues: validation.error.issues.slice(0, 3),
      });
      return {
        documentType: params.importMode ?? "statement",
        metadata: buildFallbackMetadata(params.detectedMetadata),
        holdings: [],
        receiptAccountMatch: null,
        receiptDetails: null,
        rows: [],
        model: selectedModel,
        promptVersion: OPENAI_PROMPT_VERSION,
        audit: {
          sourceFilename: params.fileName ?? null,
          confidence: params.detectedMetadata?.confidence ?? 0,
          schemaValidated: false,
          schemaValidationResult: `${validationSummary}; family=${inferredDocumentFamily}; difficulty=${inferredDifficulty}; model=${selectedModel}`,
          rawResponse: outputText,
        },
      };
    }

    const value = validation.data;
    const documentType = value.document_type ?? "statement";
    const receiptAccountMatch: ReceiptAccountMatch | null = value.receipt_account_match ?? null;
    const receiptDetails: OpenAIParsedReceiptDetails | null = value.receipt_details ?? null;
    const holdings = Array.isArray((value as { holdings?: OpenAIParsedHolding[] }).holdings)
      ? ((value as { holdings?: OpenAIParsedHolding[] }).holdings ?? [])
      : [];
    const institution = simplifyInstitutionName(value.institution ?? value.account.institution_name ?? params.detectedMetadata?.institution ?? null);
    const institutionRaw = normalizeWhitespace(String(value.institution_raw ?? value.institution ?? institution ?? params.detectedMetadata?.institution ?? "")).trim() || null;
    const accountNumberFull =
      value.account.account_number?.replace(/\D/g, "").slice(0, 32) ??
      params.detectedMetadata?.accountNumber?.replace(/\D/g, "").slice(0, 32) ??
      null;
    const accountLast4 =
      value.account.account_last4?.replace(/\D/g, "").slice(-4) ??
      accountNumberFull?.slice(-4) ??
      params.detectedMetadata?.accountNumber?.slice(-4) ??
      null;
    const accountNumber = accountNumberFull ?? accountLast4 ?? params.detectedMetadata?.accountNumber ?? null;
    const accountNameCandidate =
      simplifyAccountLabel(value.account.display_name ?? null) ??
      (institution && accountLast4 ? `${institution} ${accountLast4}` : null) ??
      simplifyAccountLabel(params.detectedMetadata?.accountName ?? null) ??
      institution ??
      null;
    const accountType = normalizeAccountTypeValue(value.account.account_type ?? null, institution, accountNameCandidate, params.detectedMetadata?.accountType ?? "bank");
    const statementType = String(value.statement_type ?? "").trim().toLowerCase();
    const warningsText = value.quality_checks.warnings.filter(Boolean).join(" ");
    const transactionEvidenceText = value.transactions
      .map((row) => [row.raw_name, row.normalized_name, row.notes, row.parser_evidence.source_text].filter(Boolean).join("\n"))
      .join("\n");
    const wiseIdentityText = [
      params.detectedMetadata?.institution,
      params.detectedMetadata?.accountName,
      value.institution,
      value.institution_raw,
      value.account.display_name,
      value.account.institution_name,
      warningsText,
      transactionEvidenceText,
    ]
      .filter(Boolean)
      .join("\n");
    const looksLikeWiseWalletScreenshot =
      documentType === "statement" &&
      /^(?:wallet|transaction_history|wallet_statement|wallet_transaction_history)$/i.test(statementType) &&
      (/wise/i.test(wiseIdentityText) ||
        /\bIncludes hidden\b|\bDirection\b|\bTo\s+[A-Z]{3}\b|\bCard checked\b/i.test(transactionEvidenceText)) &&
      (/\b(?:wallet|app transaction|transaction-history|multi-currency|mixed currencies|screenshot)\b/i.test(
        `${warningsText} ${transactionEvidenceText}`
      ) ||
        /\b[0-9][0-9,]*(?:\.\d{1,2})?\s+(?:AED|AUD|CAD|CHF|CNY|EUR|GBP|HKD|JPY|NZD|PHP|SGD|THB|USD)\b/i.test(
          transactionEvidenceText
        ));
    const effectiveInstitution = looksLikeWiseWalletScreenshot ? "Wise" : institution;
    const effectiveInstitutionRaw = looksLikeWiseWalletScreenshot ? "Wise" : institutionRaw;
    const effectiveAccountNumber = looksLikeWiseWalletScreenshot ? null : accountNumber;
    const effectiveAccountNameCandidate = looksLikeWiseWalletScreenshot ? "Wise" : accountNameCandidate;
    const effectiveAccountType = looksLikeWiseWalletScreenshot ? "wallet" : accountType;
    const paymentDueDate =
      value.payment_due_date ??
      value.account.statement_period.end ??
      params.detectedMetadata?.paymentDueDate ??
      params.detectedMetadata?.endDate ??
      null;
    const totalAmountDue =
      value.total_amount_due ??
      params.detectedMetadata?.totalAmountDue ??
      value.account.statement_balance ??
      params.detectedMetadata?.endingBalance ??
      null;
    const statementBalance = totalAmountDue ?? value.account.statement_balance ?? params.detectedMetadata?.endingBalance ?? null;
    const computedBalance = value.account.computed_balance ?? statementBalance;
    const transactionConfidenceAverage =
      value.transactions.length > 0
        ? value.transactions.reduce((sum, row) => sum + row.confidence_score, 0) / value.transactions.length
        : 0;
    const qualityBoost = value.quality_checks.balance_reconciled ? 10 : 0;
    const metadata: DetectedStatementMetadata = {
      institution: effectiveInstitution ?? null,
      accountNumber: effectiveAccountNumber ?? null,
      accountName: effectiveAccountNameCandidate,
      accountType: effectiveAccountType,
      currency: looksLikeWiseWalletScreenshot
        ? null
        : ((value.account.currency?.trim().toUpperCase() || params.detectedMetadata?.currency) ?? null),
      openingBalance: params.detectedMetadata?.openingBalance ?? null,
      endingBalance: statementBalance,
      paymentDueDate,
      totalAmountDue,
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
      const evidenceText = row.parser_evidence.source_text ?? null;
      const wiseEvidenceAmounts = looksLikeWiseWalletScreenshot ? parseOpenAIWiseEvidenceAmounts(evidenceText) : [];
      const accountImpactAmount = wiseEvidenceAmounts.length > 0 ? wiseEvidenceAmounts[wiseEvidenceAmounts.length - 1] : null;
      const amount = accountImpactAmount ? accountImpactAmount.amount : Math.abs(Number(row.amount));
      if (!rawName || !Number.isFinite(amount)) {
        return null;
      }

      const rowInstitution =
        looksLikeWiseWalletScreenshot
          ? "Wise"
          : simplifyInstitutionName(institution ?? value.account.institution_name ?? params.detectedMetadata?.institution ?? null) ?? institution ?? null;
      const rowAccountName = looksLikeWiseWalletScreenshot ? "Wise" : accountNameCandidate ?? value.account.display_name ?? null;
      const recoveredWiseDate = looksLikeWiseWalletScreenshot ? parseVisibleWiseDateHeader(evidenceText) : null;
      const rowDate = row.date ?? row.transaction_date ?? row.post_date ?? recoveredWiseDate ?? null;
      const evidenceHasDate = hasVisibleWiseDateHeader(evidenceText);
      const todayIso = new Date().toISOString().slice(0, 10);
      const wiseUiNoise =
        looksLikeWiseWalletScreenshot &&
        (/\b(?:Search|Includes hidden|Type|Currency|Direction)\b/i.test(rawName) ||
          /^(?:83|\d{1,3}|Feb\s+\d{1,2},?\s+\d{4}|Mar\s+\d{1,2},?\s+\d{4})$/i.test(rawName));
      const wiseZeroVerification =
        looksLikeWiseWalletScreenshot &&
        amount === 0 &&
        /\b(?:Card checked|verification|checked)\b/i.test(`${rawName} ${description} ${evidenceText ?? ""}`);
      const wiseUndatedHallucination =
        looksLikeWiseWalletScreenshot &&
        !evidenceHasDate &&
        (!rowDate || rowDate === todayIso) &&
        !/\b(?:Added|Refunded|Received|Sent|To\s+[A-Z]{3})\b/i.test(`${rawName} ${description} ${evidenceText ?? ""}`);
      if (wiseUiNoise || wiseZeroVerification || wiseUndatedHallucination) {
        return null;
      }

      if (looksLikeWiseWalletScreenshot && !rowDate) {
        return null;
      }

      const movementType = row.movement_type;
      const normalizedCategory = normalizeOpenAICategory(row.category, movementType);
      const wiseSemantics = looksLikeWiseWalletScreenshot
        ? deriveWiseScreenshotTypeAndCategory({
            rawName,
            description,
            evidenceText,
            normalizedCategory,
            movementType,
          })
        : null;
      const category = wiseSemantics?.category ?? normalizedCategory;
      const statementDirectionType = row.type === "Credit" ? "income" : "expense";
      const internalType =
        wiseSemantics?.type === "transfer"
          ? statementDirectionType
          : wiseSemantics?.type ??
            mapMovementTypeToInternalType(movementType, row.notes ?? null, rawName, row.type);
      const merchantBase = row.normalized_name ?? row.raw_name ?? description;
      const merchantClean = summarizeMerchantText(merchantBase, rowInstitution);
      const reviewRequired = row.review_required || row.confidence_score < 85 || category === "Other" || movementType === "internal_movement";
      const genericReviewReasons = buildOpenAiReviewReasons({
        confidenceScore: row.confidence_score,
        category,
        movementType,
        parserEvidenceText: row.parser_evidence.source_text ?? null,
        notes: row.notes ?? null,
      });

      return {
        date: rowDate ?? undefined,
        amount: amount.toFixed(2),
        currency: accountImpactAmount?.currency ?? (row.currency?.trim().toUpperCase() || metadata.currency || undefined),
        merchantRaw: rawName,
        merchantClean,
        description: description || rawName,
        categoryName: category,
        accountName: rowAccountName ?? metadata.accountName ?? undefined,
        accountNumber: effectiveAccountNumber ?? undefined,
        institution: rowInstitution ?? undefined,
        type: internalType,
        confidence: Math.max(0, Math.min(100, Math.round(row.confidence_score ?? metadata.confidence ?? 0))),
        rawPayload: {
          source: "openai",
          model: selectedModel,
          promptVersion: OPENAI_PROMPT_VERSION,
          statementType: value.statement_type,
          documentType,
          receiptAccountMatch,
          importMode: params.importMode ?? "statement",
          institutionRaw: effectiveInstitutionRaw,
          originalInstitutionRaw: institutionRaw,
          accountName: rowAccountName ?? null,
          accountNumber: effectiveAccountNumber,
          ...(accountImpactAmount
            ? {
                accountCurrency: accountImpactAmount.currency,
                accountAmount: accountImpactAmount.amount,
                accountAmountText: accountImpactAmount.text,
                wiseAccountImpactInferredFromEvidence: true,
              }
            : {}),
          sourceLine: row.parser_evidence.source_text ?? null,
          parserEvidence: row.parser_evidence,
          normalizedName: row.normalized_name ?? null,
          currency: row.currency ?? null,
          movementType,
          category,
          reviewRequired,
          genericReviewReasons,
          notes: row.notes ?? null,
          amountType: row.type,
          parsedDirectionType: statementDirectionType,
          balanceReconciled,
          computedBalance,
          qualityChecks: value.quality_checks,
          learningCandidates: value.learning_candidates,
        },
      } satisfies ParsedImportRow;
    });

    const rows = mappedRows.filter((row): row is ParsedImportRow => row !== null);
    const quality = assessStatementExtractionQuality({
      rows,
      pageCount: pageImagesToSend.length,
      declaredTransactionCount: value.quality_checks.transaction_count,
      balanceReconciled,
    });

    const allowsEmptyRows = documentType !== "statement";

    if (rows.length === 0 && !allowsEmptyRows) {
      return null;
    }

    return {
      documentType,
      metadata,
      holdings,
      receiptAccountMatch,
      receiptDetails,
      rows,
      model: selectedModel,
      promptVersion: OPENAI_PROMPT_VERSION,
      audit: {
        sourceFilename: params.fileName ?? null,
        confidence: metadata.confidence,
        schemaValidated,
        schemaValidationResult: `${validationSummary}; quality=${quality.score}; qualityReasons=${quality.reasons.join(",") || "none"}; family=${inferredDocumentFamily}; difficulty=${inferredDifficulty}; model=${selectedModel}`,
        quality,
        rawResponse: outputText,
      },
    };
  } catch (error) {
    console.warn("OpenAI import fallback failed", error);
    return null;
  }
};

export const shouldPrioritizeStrongImageTranscriptModel = (params: {
  inferredDifficulty: "easy" | "medium" | "hard";
  promptImportMode: ImportMode | null;
  pageImageCount: number;
}) =>
  params.inferredDifficulty === "hard" ||
  (params.promptImportMode === "statement" && params.pageImageCount > 1);

export const transcribeImportImagesWithOpenAI = async (params: {
  fileName?: string | null;
  fileType?: string | null;
  detectedMetadata: DetectedStatementMetadata | null;
  pageImages: Array<{ page: number; dataUrl: string }>;
  importMode?: ImportMode | null;
  timeoutMs?: number | null;
  strategy?: "quality_fallback" | "fast_only" | "strong_only";
}): Promise<{
  documentType: "statement" | "receipt" | "notes" | "portfolio" | "account_detail";
  transcript: string;
  confidence: number;
  model: string;
  promptVersion: string;
} | null> => {
  const transcriptionStartedAt = Date.now();
  const env = getEnv();
  const apiKey = (env as { OPENAI_API_KEY?: string }).OPENAI_API_KEY?.trim();
  if (!apiKey || params.pageImages.length === 0) {
    return null;
  }

  const systemPrompt = [
    "You are Clover’s OCR transcription engine.",
    "Transcribe the visible text faithfully.",
    "Return JSON only.",
    "Do not summarize.",
    "Do not invent text.",
  ].join(" ");

  const inferredDocumentFamily = inferOpenAIDocumentFamily({
    fileName: params.fileName ?? null,
    detectedMetadata: params.detectedMetadata,
    importMode: params.importMode ?? null,
  });
  const inferredDifficulty = inferOpenAIImportDifficulty({
    fileName: params.fileName ?? null,
    fileType: params.fileType ?? null,
    text: null,
    detectedMetadata: params.detectedMetadata,
    parsedRows: [],
    importMode: params.importMode ?? null,
    pageImagesCount: params.pageImages.length,
    documentFamily: inferredDocumentFamily,
  });
  const promptImportMode =
    inferredDocumentFamily === "generic_document" && params.importMode === "statement"
      ? null
      : params.importMode ?? null;
  const userPrompt = buildImageTranscriptionInputPayload({
    fileName: params.fileName ?? null,
    fileType: params.fileType ?? null,
    detectedMetadata: params.detectedMetadata,
    pageImages: params.pageImages,
    importMode: promptImportMode,
  });

  const ocrModel = resolveOpenAIImportModel(
    (env as { OPENAI_IMPORT_PARSER_OCR_MODEL?: string }).OPENAI_IMPORT_PARSER_OCR_MODEL,
    OPENAI_IMPORT_FAST_MODEL_FALLBACK,
    "OCR model",
  );
  const imageModel = resolveOpenAIImportModel(
    (env as { OPENAI_IMPORT_PARSER_IMAGE_MODEL?: string }).OPENAI_IMPORT_PARSER_IMAGE_MODEL,
    ocrModel,
    "image transcription model",
  );
  const strongModel = resolveOpenAIImportModel(
    (env as { OPENAI_IMPORT_PARSER_STRONG_MODEL?: string }).OPENAI_IMPORT_PARSER_STRONG_MODEL,
    OPENAI_IMPORT_STRONG_MODEL_FALLBACK,
    "strong OCR model",
  );
  const pageImageLimit =
    params.importMode === "statement"
      ? inferredDifficulty === "hard"
        ? 8
        : 6
      : inferredDifficulty === "hard"
        ? 5
        : 4;
  const pageImagesToSend = await compactVisionPageImages(
    selectRepresentativeVisionPages(params.pageImages, pageImageLimit)
  );
  // A single mobile-bank screenshot is normally a compact, regular layout.
  // Starting every statement with the strongest model made those otherwise
  // deterministic-ready imports wait on the slowest available vision call.
  // Keep the stronger model first for genuinely hard or multi-page documents,
  // then retain it as the existing quality-gated fallback for fast transcripts.
  const shouldPrioritizeStrongTranscriptModel = shouldPrioritizeStrongImageTranscriptModel({
    inferredDifficulty,
    promptImportMode,
    pageImageCount: pageImagesToSend.length,
  });
  const transcriptionStrategy = params.strategy ?? "quality_fallback";
  const modelCandidates = dedupeOpenAIImportModels([
    ...(transcriptionStrategy === "strong_only"
      ? [strongModel]
      : transcriptionStrategy === "fast_only"
        ? [imageModel, ocrModel]
        : shouldPrioritizeStrongTranscriptModel
          ? [strongModel, imageModel, ocrModel]
          : [imageModel, ocrModel, strongModel]),
    OPENAI_IMPORT_LEGACY_IMAGE_MODEL_FALLBACK,
  ]);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(
      10_000,
      typeof params.timeoutMs === "number" && Number.isFinite(params.timeoutMs)
        ? params.timeoutMs
        : params.importMode === "receipt"
          ? inferredDifficulty === "hard"
            ? 45_000
            : 30_000
          : inferredDifficulty === "hard"
            ? 150_000
            : 120_000
    )
  );

  try {
    const fetchTranscript = async (selectedModel: string) =>
      fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          max_output_tokens: 6_000,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: systemPrompt }],
            },
            {
              role: "user",
              content: [
                { type: "input_text", text: userPrompt },
                ...pageImagesToSend.map((pageImage) => ({
                  type: "input_image",
                  image_url: pageImage.dataUrl,
                })),
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "bank_image_transcription",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  document_type: { type: "string", enum: ["statement", "receipt", "notes", "portfolio", "account_detail"] },
                  transcript: { type: "string" },
                  confidence_score: { type: "number" },
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
                required: ["document_type", "transcript", "confidence_score", "parser_evidence"],
              },
            },
          },
        }),
        signal: controller.signal,
      });

    const parseTranscriptResponse = async (response: Response, selectedModel: string) => {
      const payload = (await response.json()) as Record<string, unknown>;
      const outputText = extractOutputText(payload);
      if (!outputText) {
        return null;
      }

      const parsedJson = parseStructuredJsonText(outputText);
      if (!parsedJson) {
        return null;
      }

      const validation = openAIImageTranscriptSchema.safeParse(parsedJson);
      if (!validation.success) {
        return null;
      }

      const value = validation.data;
      return {
        documentType: value.document_type,
        transcript: value.transcript,
        confidence: value.confidence_score,
        model: selectedModel,
        promptVersion: OPENAI_IMAGE_TRANSCRIPTION_PROMPT_VERSION,
      };
    };

    let bestTranscript:
      | {
          documentType: "statement" | "receipt" | "notes" | "portfolio" | "account_detail";
          transcript: string;
          confidence: number;
          model: string;
          promptVersion: string;
        }
      | null = null;

    for (const candidateModel of modelCandidates) {
      const response = await fetchTranscript(candidateModel);
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.warn("OpenAI image transcription failed", {
          model: candidateModel,
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.slice(0, 1_000) || null,
        });
        if (!openAIImportFailureLooksRetryable(response.status, errorText)) {
          break;
        }
        continue;
      }

      const parsed = await parseTranscriptResponse(response, candidateModel);
      if (!parsed) {
        continue;
      }
      bestTranscript = parsed;
      if (transcriptionStrategy === "fast_only" || !openAITranscriptLooksWeak(parsed) || candidateModel === strongModel) {
        console.info("[import-performance] image transcription completed", {
          model: parsed.model,
          pageImageCount: pageImagesToSend.length,
          difficulty: inferredDifficulty,
          importMode: promptImportMode,
          durationMs: Date.now() - transcriptionStartedAt,
          escalatedToStrongModel: candidateModel === strongModel && !shouldPrioritizeStrongTranscriptModel,
        });
        return parsed;
      }
    }

    console.info("[import-performance] image transcription completed", {
      model: bestTranscript?.model ?? null,
      pageImageCount: pageImagesToSend.length,
      difficulty: inferredDifficulty,
      importMode: promptImportMode,
      durationMs: Date.now() - transcriptionStartedAt,
      escalatedToStrongModel: Boolean(bestTranscript?.model === strongModel && !shouldPrioritizeStrongTranscriptModel),
    });
    return bestTranscript;
  } catch (error) {
    console.warn("OpenAI image transcription threw", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
};
