type PaymentDisplay = {
  label: string;
  provider: string;
  currency: string;
  accountName: string | null;
  accountNumber: string | null;
};

export function paymentLines(profile: PaymentDisplay) {
  const bank = profile.provider.trim();
  const account = profile.accountName?.trim();
  const metadata = [/^other$/i.test(bank) ? "" : bank, profile.currency.trim()].filter(Boolean).join(" · ");
  const repeatsLabel = [profile.label, bank].some(label => label.trim().toLowerCase() === account?.toLowerCase());
  return [
    { key: "metadata", value: metadata },
    { key: "accountName", value: repeatsLabel ? "" : account },
    { key: "accountNumber", value: profile.accountNumber?.trim() },
  ].filter((line): line is { key: string; value: string } => Boolean(line.value));
}
