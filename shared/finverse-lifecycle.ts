/** Product policy, independent of provider billing units. */
export const BANK_INACTIVITY_DAYS = 90;
export const BANK_WARNING_DAYS = [14, 3] as const;
const DAY = 86_400_000;
export function inactivityDeadline(lastSuccess: Date | null, createdAt: Date, days = BANK_INACTIVITY_DAYS) {
  return new Date(+(lastSuccess ?? createdAt) + days * DAY);
}
export function bankWarningStage(deadline: Date, now = new Date()) {
  const days = (+deadline - +now) / DAY;
  return days <= 3 ? 3 : days <= 14 ? 14 : null;
}
export function retainedBankLinks<T extends { id: string; retainOnDowngrade: boolean; lastSeenAt: Date }>(links: T[], limit: number) {
  return [...links].sort((a,b) => Number(b.retainOnDowngrade)-Number(a.retainOnDowngrade) || +b.lastSeenAt-+a.lastSeenAt || a.id.localeCompare(b.id)).slice(0,limit);
}

export function bankDisconnectDeadline(lastSuccess:Date|null,createdAt:Date,warnedAt:Date|null,failureSince:Date|null){
 return new Date(Math.max(+inactivityDeadline(lastSuccess,createdAt),warnedAt?+warnedAt+14*DAY:0,failureSince?+failureSince+14*DAY:0));
}
