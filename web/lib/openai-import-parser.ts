import { z } from "zod";
import { getEnv } from "@/lib/env";
import {
  type DetectedStatementMetadata,
  inferAccountTypeFromStatement,
  type ParsedImportRow,
} from "@/lib/import-parser";
import { summarizeMerchantText } from "@/lib/merchant-labels";

const OPENAI_PROMPT_VERSION = "clover_bank_statement_extraction_v1";
const OPENAI_IMAGE_TRANSCRIPTION_PROMPT_VERSION = "clover_bank_statement_transcription_v1";

const GENERIC_PARSER_GUIDANCE = [
  "Generic parser guidance:",
  "- Use the shared Clover parser system: local rules first, OpenAI fallback for unknown banks or OCR failures, then validation.",
  "- Preserve raw transaction text and only normalize names/categories when the statement layout makes the meaning clear.",
  "- If the statement looks like a bank, wallet, credit card, loan, or certificate-style account but no bank-specific rule exists, still extract the rows conservatively.",
  "- Keep account number, opening balance, ending balance, payment due date, and amount due when visible.",
  "- Reject page headers, footers, legal text, reward banners, and summary noise as transactions.",
  "- Lower confidence when the OCR is blurry or when a balance cannot be reconciled cleanly.",
  "- When OCR is character-spaced or fragmented, reconstruct the intended words first, then extract metadata and rows conservatively.",
  "- If the statement summary and the detailed rows disagree, prefer the rows that are visibly tied to dates and amounts, and mark low confidence instead of inventing extra activity.",
  "- If the page clearly shows a transaction table but the OCR is partial, return only the rows that can be supported by visible evidence instead of padding the list with guesswork.",
].join(" ");

const GENERIC_NORMALIZATION_GUIDANCE = [
  "Generic normalization guidance:",
  "- Keep raw_name separate from normalized_name and preserve the original statement text when it carries useful detail.",
  "- Normalize only when the merchant or code is clearly the same canonical entity.",
  "- Use these canonical categories when they fit the row: Income, Transfers, Food & Dining, Transport, Housing, Bills & Utilities, Travel & Lifestyle, Entertainment, Shopping, Health & Wellness, Education, Gifts & Donations, Business, Financial, Cash & ATM, Opening Balance, Other.",
  "- Common merchant/code normalizations include ATM WDL/ATMWD/W/D FR SAV/ET WDL/Cash Withdrawal/ATM Cash Withdrawal -> ATM Withdrawal; IBFT/Instapay/InstaPay/Interbank Fund Transfer/PESONet -> Bank Transfer; Cash Payment/Payment - Thank You/Card Payment -> Credit Card Payment; Service Charge/Finance Charge -> Service Charge or Finance Charge; Credit Interest -> Interest Earned.",
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

type OpenAIParsedReceiptLineItem = {
  description: string;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  currency: string | null;
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

type ReceiptAccountMatch = {
  account_name: string | null;
  account_last4: string | null;
  confidence: number;
  reason: string | null;
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
      line_items: z
        .array(
          z.object({
            description: z.string(),
            quantity: z.number().nullable().optional().default(null),
            unit_price: z.number().nullable().optional().default(null),
            amount: z.number().nullable().optional().default(null),
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
                required: ["description", "quantity", "unit_price", "amount", "currency", "confidence_score", "parser_evidence"],
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
  required: [
    "institution",
    "institution_raw",
    "statement_type",
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

  if (/landbank/.test(normalized)) {
    return {
      ...base,
      institution: "Landbank",
      notes: [
        "Landbank statement tables may show In/Out columns and a closing balance. Use the table rows only and ignore pure balance-note lines.",
        "Treat cash deposits, PESONet, interbank transfers, and wallet funding as transfers unless the description clearly says salary or merchant spend.",
        "Preserve the full account number exactly when it is visible in the statement header.",
        "For OCR-heavy Landbank files, rely on the visible table structure and running balance instead of short OCR fragments. Keep each date row separate even if the description wraps onto the next line.",
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
  importMode?: ImportMode | null;
}) => {
  const institution = params.detectedMetadata?.institution ?? null;
  const accountType = params.detectedMetadata?.accountType ?? null;
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
    "",
    `Known institution: ${institution ?? "null"}`,
    `Known parser result: ${JSON.stringify(buildDeterministicParserSummary({ detectedMetadata: params.detectedMetadata, parsedRows: params.parsedRows }))}`,
    `Bank-specific instructions: ${JSON.stringify(bankInstructionJson)}`,
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
        ]
      : []),
    ...(params.importMode === "portfolio"
      ? [
          "This input is an investment portfolio or holdings screen. Preserve the visible account identity and extract holdings, balances, symbols, and gain/loss details conservatively.",
          "Put each visible position into the holdings array with asset name, symbol, units, market value, current value, and any visible gain/loss fields.",
          "If the screen does not show true ledger transactions, keep the transaction array empty and do not invent spend rows.",
        ]
      : []),
    ...(params.importMode === "account_detail"
      ? [
          "This input is an account details or balance summary screen. Preserve the visible account identity, balance, and product details conservatively.",
          "If the screen shows investment positions or asset rows, put them into the holdings array instead of inventing transactions.",
          "If the screen does not show true ledger transactions, keep the transaction array empty and do not invent spend rows.",
        ]
      : []),
    "",
    ...(params.pageImages?.length
      ? [
          "This is a scanned statement, screenshot, or image-heavy file. The text layer may be empty or incomplete.",
          "Read the page images directly and extract the visible financial details for the selected document family.",
          "If the document is a statement, extract every transaction row from the visible statement pages and anchor the final balance from the last page footer when present.",
          "If the document is a portfolio or account-detail page that shows holdings or positions, extract those into holdings instead of transaction rows.",
          "If the document is a receipt, portfolio screen, account detail screen, or notes screenshot, keep the transaction array empty unless the page clearly shows true ledger rows.",
          "Use the account number and balance shown in the page image, not any earlier summary-like number unless it is the final ending balance.",
          "",
        ]
      : []),
    "Extracted text:",
    params.text,
    "",
    `Image pages: ${(params.pageImages ?? []).map((page) => page.page).join(", ") || "none"}`,
    "",
    "Return only valid JSON matching the schema.",
  ].join("\n");
};

const buildImageTranscriptionInputPayload = (params: {
  fileName?: string | null;
  fileType?: string | null;
  detectedMetadata: DetectedStatementMetadata | null;
  pageImages?: Array<{ page: number; dataUrl: string }> | null;
  importMode?: ImportMode | null;
}) => {
  const institution = params.detectedMetadata?.institution ?? null;
  const accountType = params.detectedMetadata?.accountType ?? null;
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
    "",
    `Known institution: ${institution ?? "null"}`,
    `Known parser result: ${JSON.stringify(buildDeterministicParserSummary({ detectedMetadata: params.detectedMetadata, parsedRows: [] }))}`,
    `Bank-specific instructions: ${JSON.stringify(bankInstructionJson)}`,
    GENERIC_PARSER_GUIDANCE,
    "Transcription guidance:",
    "- Produce a faithful OCR-style transcription in reading order.",
    "- Preserve line breaks, table rows, amounts, dates, account labels, merchant names, and page structure.",
    "- Do not summarize, normalize, or guess missing text.",
    "- Include page markers like [PAGE 1], [PAGE 2], etc. when multiple images are provided.",
    "- If the image is clearly a receipt, portfolio screen, account-detail screen, notes screenshot, or transaction-history screenshot, say so in document_type.",
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
        ]
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
  preferPrimary?: boolean;
  importMode?: ImportMode | null;
}): Promise<
  | {
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
      };
    }
  | null
> => {
  const env = getEnv();
  const apiKey = (env as { OPENAI_API_KEY?: string }).OPENAI_API_KEY?.trim();
  const isPrimaryMode =
    params.preferPrimary ?? isTruthyEnvValue((env as { OPENAI_IMPORT_PARSER_PRIMARY?: string }).OPENAI_IMPORT_PARSER_PRIMARY);
  if (!apiKey || (!isPrimaryMode && !responseLooksUseful(params.detectedMetadata, params.parsedRows, params.importMode ?? null))) {
    return null;
  }

  const inputText = buildModelInputText(params.text);
  const systemPrompt = [
    "You are Clover’s financial document extraction engine.",
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
    importMode: params.importMode ?? null,
  });

  const pageImagesInput = params.pageImages ?? [];
  const noisyVisionPreferredInstitutions = new Set(["Landbank", "EastWest", "UCPB", "Chinabank"]);
  const isNoisyVisionInstitution =
    typeof params.detectedMetadata?.institution === "string" && noisyVisionPreferredInstitutions.has(params.detectedMetadata.institution);
  const pageImageLimit = params.text.trim().length === 0 ? 6 : isNoisyVisionInstitution ? 6 : 2;
  const pageImagesToSend = pageImagesInput.slice(0, Math.min(pageImageLimit, pageImagesInput.length));
  const textModel = (env as { OPENAI_IMPORT_PARSER_MODEL?: string }).OPENAI_IMPORT_PARSER_MODEL?.trim() || "gpt-4.1";
  const imageModel =
    (env as { OPENAI_IMPORT_PARSER_IMAGE_MODEL?: string }).OPENAI_IMPORT_PARSER_IMAGE_MODEL?.trim() || "gpt-4.1";
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
          max_output_tokens:
            pageImages.length > 0 ? (params.text.trim().length === 0 ? 6_000 : 2_500) : 4_000,
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
    const primaryTimeoutMs = model === imageModel ? (params.text.trim().length === 0 ? 120_000 : 60_000) : 45_000;
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
        response = await callOpenAI(textModel, pageImagesToSend.slice(0, 1), params.text.trim().length === 0 ? 60_000 : 45_000);
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
        holdings: [],
        receiptAccountMatch: null,
        receiptDetails: null,
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
        holdings: [],
        receiptAccountMatch: null,
        receiptDetails: null,
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
      institution: institution ?? null,
      accountNumber: accountNumber ?? null,
      accountName: accountNameCandidate,
      accountType,
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
      const amount = Math.abs(Number(row.amount));
      if (!rawName || !Number.isFinite(amount)) {
        return null;
      }

      const rowInstitution =
        simplifyInstitutionName(institution ?? value.account.institution_name ?? params.detectedMetadata?.institution ?? null) ?? institution ?? null;
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
          documentType,
          receiptAccountMatch,
          importMode: params.importMode ?? "statement",
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

    const allowsEmptyRows = documentType !== "statement";

    if (rows.length === 0 && !allowsEmptyRows) {
      return null;
    }

    return {
      metadata,
      holdings,
      receiptAccountMatch,
      receiptDetails,
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

export const transcribeImportImagesWithOpenAI = async (params: {
  fileName?: string | null;
  fileType?: string | null;
  detectedMetadata: DetectedStatementMetadata | null;
  pageImages: Array<{ page: number; dataUrl: string }>;
  importMode?: ImportMode | null;
}): Promise<{
  documentType: "statement" | "receipt" | "notes" | "portfolio" | "account_detail";
  transcript: string;
  confidence: number;
  model: string;
  promptVersion: string;
} | null> => {
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

  const userPrompt = buildImageTranscriptionInputPayload({
    fileName: params.fileName ?? null,
    fileType: params.fileType ?? null,
    detectedMetadata: params.detectedMetadata,
    pageImages: params.pageImages,
    importMode: params.importMode ?? null,
  });

  const imageModel =
    (env as { OPENAI_IMPORT_PARSER_IMAGE_MODEL?: string }).OPENAI_IMPORT_PARSER_IMAGE_MODEL?.trim() || "gpt-4.1";
  const pageImagesToSend = params.pageImages.slice(0, params.importMode === "statement" ? 6 : 4);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: imageModel,
        temperature: 0,
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

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.warn("OpenAI image transcription failed", {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText.slice(0, 1_000) || null,
      });
      return null;
    }

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
      model: imageModel,
      promptVersion: OPENAI_IMAGE_TRANSCRIPTION_PROMPT_VERSION,
    };
  } catch (error) {
    console.warn("OpenAI image transcription threw", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
};
