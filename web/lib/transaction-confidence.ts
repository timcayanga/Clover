export type TransactionConfidenceInput = {
  parserConfidence?: number | null;
  categoryConfidence?: number | null;
  accountMatchConfidence?: number | null;
  transferConfidence?: number | null;
  type?: string;
};

export function getRecordedTransactionConfidence(transaction: TransactionConfidenceInput): number | null {
  // Duplicate likelihood is a review signal, not extraction accuracy. Transfer
  // likelihood is relevant only when the transaction was classified as a transfer.
  const scores = [transaction.parserConfidence, transaction.categoryConfidence,
    transaction.accountMatchConfidence, transaction.type === "transfer" ? transaction.transferConfidence : null]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .map(value => Math.max(0, Math.min(100, value <= 1 ? value * 100 : value)));
  return scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
}
