export type SplitBillTransactionLinkDraft = {
  groupId: string;
  participantNames: string[];
};

export type SplitBillTransactionLinkParams = {
  workspaceId: string;
  transactionId: string;
  transactionTitle: string;
  billDate: string;
  currency: string;
  amount: string;
  draft: SplitBillTransactionLinkDraft;
};

export const createSplitBillFromTransaction = async ({
  workspaceId,
  transactionId,
  transactionTitle,
  billDate,
  currency,
  amount,
  draft,
}: SplitBillTransactionLinkParams) => {
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
      items: [
        {
          description: transactionTitle || "Total",
          amount,
          participantIds: [],
        },
      ],
      payments: [],
      total: amount,
      rawPayload: {
        sourceTransactionId: transactionId,
        workspaceId,
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as { bill?: unknown; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to create split bill.");
  }

  return payload.bill;
};
