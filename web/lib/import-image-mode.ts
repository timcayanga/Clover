export type ImportImageMode = "statement" | "receipt" | "notes";

export const IMPORT_IMAGE_MODES: Array<{
  value: ImportImageMode;
  label: string;
  helper: string;
}> = [
  {
    value: "statement",
    label: "Statement screenshot",
    helper: "Use when the image is a bank statement, transaction history, or account summary.",
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
];

export const isImportImageMode = (value: unknown): value is ImportImageMode =>
  value === "statement" || value === "receipt" || value === "notes";

export const normalizeImportImageMode = (value: unknown): ImportImageMode => {
  if (isImportImageMode(value)) {
    return value;
  }

  return "statement";
};
