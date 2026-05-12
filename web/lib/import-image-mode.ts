export type ImportImageMode = "statement" | "receipt" | "notes" | "portfolio" | "account_detail";

export const IMPORT_IMAGE_MODES: Array<{
  value: ImportImageMode;
  label: string;
  helper: string;
}> = [
  {
    value: "statement",
    label: "Statement screenshot",
    helper: "Use when the image is a bank statement, wallet history, transaction history, or account summary.",
  },
  {
    value: "receipt",
    label: "Receipt",
    helper: "Use when the image is a receipt or purchase proof you want matched to an account.",
  },
  {
    value: "notes",
    label: "Notes screenshot",
    helper: "Use when the image comes from a notes app or checklist with transaction entries.",
  },
  {
    value: "portfolio",
    label: "Portfolio screen",
    helper: "Use when the image shows holdings, positions, market value, or investment performance instead of a transaction ledger.",
  },
  {
    value: "account_detail",
    label: "Account details",
    helper: "Use when the image is an account summary, time deposit screen, balance detail page, or product snapshot.",
  },
];

export const isImportImageMode = (value: unknown): value is ImportImageMode =>
  value === "statement" || value === "receipt" || value === "notes" || value === "portfolio" || value === "account_detail";

export const normalizeImportImageMode = (value: unknown): ImportImageMode => {
  if (isImportImageMode(value)) {
    return value;
  }

  return "statement";
};

export const getImportModeDisplayNoun = (mode: ImportImageMode | null | undefined) => {
  switch (mode ?? "statement") {
    case "receipt":
      return "receipt";
    case "notes":
      return "notes";
    case "portfolio":
      return "portfolio";
    case "account_detail":
      return "account details";
    case "statement":
    default:
      return "statement";
  }
};

export const getImportModeUploadLabel = (mode: ImportImageMode | null | undefined) => {
  switch (mode ?? "statement") {
    case "receipt":
      return "receipt";
    case "notes":
      return "notes screenshot";
    case "portfolio":
      return "portfolio screenshot";
    case "account_detail":
      return "account details";
    case "statement":
    default:
      return "statement";
  }
};
