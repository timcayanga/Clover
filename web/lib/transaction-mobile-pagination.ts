type MobilePaginationExhaustionInput = {
  previousTransactionCount: number;
  nextTransactionCount: number;
  fetchedTransactionCount: number;
  totalTransactionCount: number;
};

const normalizeCount = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export const getNextMobileTransactionPage = (
  loadedTransactionCount: number,
  serverPageSize: number
) => {
  const normalizedPageSize = Math.max(1, normalizeCount(serverPageSize));
  const normalizedLoadedCount = Math.max(
    normalizedPageSize,
    normalizeCount(loadedTransactionCount)
  );

  return Math.floor(normalizedLoadedCount / normalizedPageSize) + 1;
};

export const isMobileTransactionPaginationExhausted = ({
  previousTransactionCount,
  nextTransactionCount,
  fetchedTransactionCount,
  totalTransactionCount,
}: MobilePaginationExhaustionInput) => {
  const previousCount = normalizeCount(previousTransactionCount);
  const nextCount = normalizeCount(nextTransactionCount);
  const fetchedCount = normalizeCount(fetchedTransactionCount);
  const totalCount = normalizeCount(totalTransactionCount);

  return (
    fetchedCount === 0 ||
    nextCount <= previousCount ||
    (totalCount > 0 && nextCount >= totalCount)
  );
};
