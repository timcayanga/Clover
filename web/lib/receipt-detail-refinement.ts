export const shouldRefineReceiptCore = (input: {
  importMode: string;
  coreOnly: boolean;
  localItemsDeferred?: boolean;
  hasDocument: boolean;
  imageCount: number;
  itemCount: number;
  allocationCount: number;
}) => input.importMode === "receipt" && (input.coreOnly || input.localItemsDeferred) && input.hasDocument &&
  input.imageCount > 0 && (input.itemCount === 0 || input.localItemsDeferred) && input.allocationCount === 0;


export function hasIndependentReceiptCore(evidence: {
  merchant: { status: string };
  date: { status: string };
  currency: { status: string };
  total: { status: string };
}) {
  return [evidence.merchant, evidence.date, evidence.currency, evidence.total]
    .every(field => field.status === "supported");
}
