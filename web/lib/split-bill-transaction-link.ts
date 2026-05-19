export type SplitBillTransactionLinkDraft = {
  groupId: string;
  participantNames: string[];
};

export type SplitBillTransactionLinkItem = {
  description: string;
  amount: string;
};

export type SplitBillTransactionLinkParams = {
  workspaceId: string;
  transactionId: string;
  transactionTitle: string;
  billDate: string;
  currency: string;
  amount: string;
  draft: SplitBillTransactionLinkDraft;
  receiptLineItems?: SplitBillTransactionLinkItem[];
};

export const createSplitBillFromTransaction = async ({
  workspaceId,
  transactionId,
  transactionTitle,
  billDate,
  currency,
  amount,
  draft,
  receiptLineItems = [],
}: SplitBillTransactionLinkParams) => {
  const items =
    receiptLineItems.length > 0
      ? receiptLineItems.map((lineItem, index) => ({
          id: `${transactionId}-line-${index}`,
          description: lineItem.description,
          amount: lineItem.amount,
          participantIds: [],
        }))
      : [
          {
            description: transactionTitle || "Total",
            amount,
            participantIds: [],
          },
        ];

  const response = await fetch("/api/split-bills", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: transactionTitle || "Split Bill",
      billDate,
      currency,
      sourceType: "manual",
      transactionId,
      groupId: draft.groupId || null,
      participants: draft.participantNames.map((name) => ({ name })),
      items,
      payments: [],
      total: amount,
      rawPayload: {
        sourceTransactionId: transactionId,
        workspaceId,
        receiptLineItems: receiptLineItems.map((item) => ({
          description: item.description,
          amount: item.amount,
        })),
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as { bill?: unknown; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to create split bill.");
  }

  return payload.bill;
};
