export const shouldRefineReceiptCore = (input: {
  importMode: string;
  coreOnly: boolean;
  hasDocument: boolean;
  imageCount: number;
  itemCount: number;
  allocationCount: number;
}) => input.importMode === "receipt" && input.coreOnly && input.hasDocument &&
  input.imageCount > 0 && input.itemCount === 0 && input.allocationCount === 0;
