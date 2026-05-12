export type AccountType =
  | "bank"
  | "wallet"
  | "credit_card"
  | "cash"
  | "investment"
  | "loan"
  | "mortgage"
  | "line_of_credit"
  | "receivable"
  | "payable"
  | "bnpl"
  | "prepaid"
  | "insurance"
  | "other";

export type TransactionType = "income" | "expense" | "transfer";

export type JsonValue = unknown;
