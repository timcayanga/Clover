/** Placeholder labels are not categories; a missing cleaned merchant is a separate concern. */
export function needsTransactionCategory(name: string | null | undefined) {
  return !name?.trim() || /^(uncategorized|needs category review)$/i.test(name.trim());
}
