export type TransactionDisplayType = "income" | "expense" | "transfer";

type TransactionDisplayTypeInput = {
  type: TransactionDisplayType;
  isTransfer?: boolean;
  rawPayload?: unknown;
};

const normalizeDigits = (value?: string | null) => String(value ?? "").replace(/\D/g, "");

const getTransferCounterpartNumbers = (rawPayload: unknown) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return { from: null as string | null, to: null as string | null };
  }

  const payload = rawPayload as Record<string, unknown>;
  const from =
    typeof payload.transferFromAccountNumber === "string" && payload.transferFromAccountNumber.trim()
      ? payload.transferFromAccountNumber.trim()
      : null;
  const to =
    typeof payload.transferToAccountNumber === "string" && payload.transferToAccountNumber.trim()
      ? payload.transferToAccountNumber.trim()
      : null;

  return { from, to };
};

const isInternalWorkspaceTransfer = (
  transaction: TransactionDisplayTypeInput,
  currentAccountNumber: string | null,
  workspaceAccountNumbers: Set<string>
) => {
  const normalizedCurrentAccountNumber = normalizeDigits(currentAccountNumber);
  if (!normalizedCurrentAccountNumber) {
    return false;
  }

  const { from, to } = getTransferCounterpartNumbers(transaction.rawPayload);
  const fromDigits = normalizeDigits(from);
  const toDigits = normalizeDigits(to);
  const counterpartNumber =
    fromDigits && normalizedCurrentAccountNumber === fromDigits
      ? toDigits
      : toDigits && normalizedCurrentAccountNumber === toDigits
        ? fromDigits
        : null;

  return Boolean(counterpartNumber && workspaceAccountNumbers.has(counterpartNumber));
};

export const getTransactionDisplayType = (
  transaction: TransactionDisplayTypeInput,
  currentAccountNumber: string | null,
  workspaceAccountNumbers: Set<string>
): TransactionDisplayType => {
  if (isInternalWorkspaceTransfer(transaction, currentAccountNumber, workspaceAccountNumbers)) {
    return "transfer";
  }

  if (transaction.type === "transfer" || transaction.isTransfer) {
    return "transfer";
  }

  return transaction.type;
};
