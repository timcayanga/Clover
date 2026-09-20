export type PositionView = {
  id: string;
  accountId: string;
  accountName: string;
  institution?: string | null;
  assetName: string;
  symbol: string | null;
  subtype: string;
  currency: string;
  quantity: string;
  costBasis: string;
  value: string | null;
  valueDate: string | null;
  sourceHoldingId: string | null;
  updatedAt: string;
};
export function positionHoldingView(p: PositionView) {
  const gain = p.value === null ? null : Number(p.value) - Number(p.costBasis);
  return {
    id: p.id,
    positionId: p.id,
    rowIndex: null,
    assetName: p.assetName,
    assetSymbol: p.symbol,
    assetType: p.subtype,
    quantity: p.quantity,
    unitPrice: null,
    costBasis: p.costBasis,
    marketValue: null,
    currentValue: p.value,
    gainLossValue: gain === null ? null : String(gain),
    gainLossPercent:
      gain === null || !Number(p.costBasis)
        ? null
        : String(gain / Number(p.costBasis)),
    currency: p.currency,
    status: "confirmed",
    confidence: 100,
    updatedAt: p.updatedAt,
  };
}
