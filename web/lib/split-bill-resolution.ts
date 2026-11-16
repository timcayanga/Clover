export function isSplitBillResolved(raw: unknown): boolean {
  return Boolean(
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    (raw as Record<string, unknown>).billResolvedAt,
  );
}
