export type ReceiptLineItemValue = {
  description: string;
  quantity?: string | null;
  currency?: string | null;
  unitPrice?: string | null;
  amount?: string | null;
};

export type ReceiptLineItemDraftValue = {
  description: string;
  quantity: string;
  currency: string;
  unitPrice: string;
  amount: string;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export const createEmptyReceiptLineItem = (): ReceiptLineItemDraftValue => ({
  description: "",
  quantity: "",
  currency: "",
  unitPrice: "",
  amount: "",
});

export const normalizeReceiptLineItemText = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  return typeof value === "string" ? value.trim() : "";
};

export const parseReceiptLineItemsFromPayload = (rawPayload: unknown): ReceiptLineItemValue[] => {
  const payload = asRecord(rawPayload);
  if (!payload) {
    return [];
  }

  const candidateSources: unknown[] = [];
  if (Array.isArray(payload.receiptLineItems)) {
    candidateSources.push(payload.receiptLineItems);
  }

  const receiptDetails = asRecord(payload.receiptDetails);
  if (receiptDetails) {
    if (Array.isArray(receiptDetails.lineItems)) {
      candidateSources.push(receiptDetails.lineItems);
    }

    if (Array.isArray(receiptDetails.line_items)) {
      candidateSources.push(receiptDetails.line_items);
    }
  }

  for (const source of candidateSources) {
    const lineItems = (source as unknown[]).flatMap((entry) => {
      const record = asRecord(entry);
      if (!record) {
        return [];
      }

      const description = normalizeReceiptLineItemText(record.description ?? record.name ?? record.label);
      if (!description) {
        return [];
      }

      return [
        {
          description,
          quantity: normalizeReceiptLineItemText(record.quantity) || null,
          currency: normalizeReceiptLineItemText(record.currency) || null,
          unitPrice: normalizeReceiptLineItemText(record.unitPrice ?? record.unit_price) || null,
          amount: normalizeReceiptLineItemText(record.amount ?? record.total) || null,
        },
      ];
    });

    if (lineItems.length > 0) {
      return lineItems;
    }
  }

  return [];
};

export const parseReceiptLineItemNumber = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

export const getReceiptLineItemComputedAmount = (item: ReceiptLineItemDraftValue | ReceiptLineItemValue) => {
  const amount = parseReceiptLineItemNumber(item.amount);
  if (amount !== null) {
    return amount;
  }

  const unitPrice = parseReceiptLineItemNumber(item.unitPrice);
  const quantity = parseReceiptLineItemNumber(item.quantity);
  return unitPrice !== null && quantity !== null ? unitPrice * quantity : null;
};

export const getManualReceiptLineItemTotal = (lineItems: ReceiptLineItemDraftValue[]) =>
  lineItems.reduce((total, item) => total + (getReceiptLineItemComputedAmount(item) ?? 0), 0);

export const sanitizeReceiptLineItems = (lineItems: ReceiptLineItemDraftValue[]): ReceiptLineItemValue[] =>
  lineItems
    .map((item) => ({
      description: item.description.trim(),
      quantity: item.quantity.trim(),
      currency: item.currency.trim(),
      unitPrice: item.unitPrice.trim(),
      amount: item.amount.trim(),
    }))
    .filter((item) => Boolean(item.description))
    .map((item) => ({
      description: item.description,
      quantity: item.quantity || null,
      currency: item.currency || null,
      unitPrice: item.unitPrice || null,
      amount: item.amount || null,
    }));

export const receiptLineItemToDraft = (lineItem: ReceiptLineItemValue): ReceiptLineItemDraftValue => ({
  description: lineItem.description ?? "",
  quantity: lineItem.quantity ?? "",
  currency: lineItem.currency ?? "",
  unitPrice: lineItem.unitPrice ?? "",
  amount: lineItem.amount ?? "",
});

export const receiptLineItemSignature = (lineItems: Array<ReceiptLineItemDraftValue | ReceiptLineItemValue>) =>
  JSON.stringify(
    sanitizeReceiptLineItems(
      lineItems.map((lineItem) => ({
        description: lineItem.description ?? "",
        quantity: lineItem.quantity ?? "",
        currency: lineItem.currency ?? "",
        unitPrice: lineItem.unitPrice ?? "",
        amount: lineItem.amount ?? "",
      }))
    )
  );

export const mergeReceiptLineItemsIntoPayload = (
  rawPayload: unknown,
  lineItems: ReceiptLineItemDraftValue[],
  fallbackCurrency: string
) => {
  const sanitizedLineItems = sanitizeReceiptLineItems(
    lineItems.map((lineItem) => ({
      ...lineItem,
      currency: lineItem.currency.trim() || fallbackCurrency,
    }))
  );
  const nextPayload: Record<string, unknown> = asRecord(rawPayload) ? { ...(rawPayload as Record<string, unknown>) } : {};
  nextPayload.receiptLineItems = sanitizedLineItems;

  const receiptDetails = asRecord(nextPayload.receiptDetails);
  if (receiptDetails) {
    nextPayload.receiptDetails = {
      ...receiptDetails,
      lineItems: sanitizedLineItems,
    };
  }

  return nextPayload;
};
