export type BankLinkPreview = {
  kind: "balance" | "transaction";
  id: string;
  label: string;
  amount: string;
  currency: string;
};
