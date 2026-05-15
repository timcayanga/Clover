import type { SplitBillSerializedBill } from "@/lib/split-bill";

export const getSplitBillBillsForGroup = (bills: SplitBillSerializedBill[], groupId: string) =>
  bills.filter((bill) => bill.group?.id === groupId);

export const getSplitBillBillsForPerson = (bills: SplitBillSerializedBill[], personName: string) =>
  bills.filter((bill) => bill.participants.some((participant) => participant.name === personName));
