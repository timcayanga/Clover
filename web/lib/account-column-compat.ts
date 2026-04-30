export const isMissingAccountNumberColumnError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("account.accountnumber") &&
    message.includes("does not exist") &&
    message.includes("current database")
  );
};

export const omitAccountNumberField = <T extends Record<string, unknown>>(data: T) => {
  const { accountNumber: _accountNumber, ...rest } = data;
  return rest as Omit<T, "accountNumber">;
};
