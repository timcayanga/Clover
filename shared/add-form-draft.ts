/** Suggestions only. These fields must pass the destination form's validation and explicit Save. */
export type AddFormDraft = {
  kind: "recurring" | "split" | "trade";
  fields: Record<string, string>;
};
export const addFormFields = {
  recurring: [
    "kind",
    "title",
    "amount",
    "currency",
    "dueDate",
    "recurrence",
    "counterparty",
    "accountId",
    "notes",
  ],
  trade: [
    "assetName",
    "date",
    "type",
    "quantity",
    "amount",
    "currency",
    "costBasis",
    "notes",
  ],
  split: ["title", "amount", "currency", "date", "people"],
} as const;
export function parseAddFormDraft(input: unknown): AddFormDraft | null {
  if (!input || typeof input !== "object") return null;
  const { kind, fields } = input as AddFormDraft;
  if (
    (kind !== "recurring" && kind !== "split" && kind !== "trade") ||
    !fields ||
    typeof fields !== "object" ||
    Array.isArray(fields)
  )
    return null;
  if (
    Object.keys(fields).some(
      (k) =>
        !(addFormFields[kind] as readonly string[]).includes(k) ||
        typeof fields[k] !== "string" ||
        fields[k].length > 500,
    )
  )
    return null;
  return { kind, fields };
}
