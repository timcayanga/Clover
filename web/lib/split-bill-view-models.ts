import type { SplitBillSerializedBill } from "@/lib/split-bill";

export const getSplitBillBillsForGroup = (bills: SplitBillSerializedBill[], groupId: string) =>
  bills.filter((bill) => bill.group?.id === groupId);

export const getSplitBillBillsForPerson = (bills: SplitBillSerializedBill[], personName: string) =>
  bills.filter((bill) => bill.participants.some((participant) => participant.name === personName));

/** Remaining amount owed to this person after recorded settlements. */
export const getParticipantOutstandingBalance = (bill: SplitBillSerializedBill, participantId: string) =>
  bill.settlement.transfers.reduce((balance, transfer) => balance
    + (transfer.toParticipantId === participantId ? transfer.amount : 0)
    - (transfer.fromParticipantId === participantId ? transfer.amount : 0), 0);
