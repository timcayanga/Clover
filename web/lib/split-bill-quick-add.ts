export type SplitBillQuickAddMode = "you-paid" | "you-owed" | "person-paid" | "person-owed";

export function getQuickAddItemParticipantIds(
  splitMode: SplitBillQuickAddMode,
  participants: Array<{ id: string; name: string }>,
  payerName: string
) {
  if (splitMode === "you-paid" || splitMode === "person-paid") {
    return participants.map((participant) => participant.id);
  }

  return participants
    .filter((participant) => participant.name !== payerName)
    .map((participant) => participant.id);
}
