type BillMark = { merchantRaw: string; merchantClean: string | null; categoryName: string | null; merchantLogoUrl?: string | null; merchantLogoNameKey?: string };
export type PendingSplitBill = { id: string; title: string; currency: string; remaining: number; mark?: BillMark; avatars?: PendingSplitBillAvatar[] };
export type PendingSplitBillAvatar = { name: string; avatarUrl: string | null; isSelf?: boolean };
type AvatarContext = { currentUserId?: string; groups: readonly { id: string; name: string; avatarUrl: string | null }[]; people: readonly { name: string; avatarUrl: string | null }[]; currentUserName: string };
export function homePendingSplitBills(bills: readonly {
  id: string; title: string; currency: string; resolved?: boolean;
  userId?: string; transaction?: {merchantRaw: string; merchantClean: string | null} | null;
  merchantName?: string | null; categoryName?: string | null;
  groupId?: string | null; participants?: readonly { name: string }[];
  settlement: { transfers: readonly { amount: number }[] };
}[], context?: AvatarContext, resolveLogo?: (mark: BillMark) => Pick<BillMark, "merchantLogoUrl" | "merchantLogoNameKey">): { count: number; bills: PendingSplitBill[] } {
  const pending = bills.filter(b => !b.resolved).map(bill => ({
    bill, remaining: bill.settlement.transfers.reduce((sum, t) =>
      sum + (Number.isFinite(t.amount) && t.amount > 0 ? t.amount : 0), 0),
  })).filter(row => row.remaining > 0.005);
  const visible = pending.slice(0,3).map(({ bill:b, remaining }) => {
    const linked = context?.currentUserId && context.currentUserId === b.userId ? b.transaction : null;
    const mark = { merchantRaw: linked?.merchantRaw || b.merchantName?.trim() || b.title,
      merchantClean: linked?.merchantClean ?? null, categoryName: b.categoryName ?? null };
    return {
    remaining, ...(resolveLogo ? {mark:{...mark, ...resolveLogo(mark)}} : {}),
    id:b.id,title:b.title,currency:b.currency,
    ...(context ? { avatars: (() => {
      const group = context.groups.find(group => group.id === b.groupId);
      if (group) return [{ name: group.name, avatarUrl: group.avatarUrl }];
      return (b.participants ?? []).slice(0, 5).map(person => {
        const name = person.name.trim();
        const isSelf = /^(you|me)$/i.test(name) || name.toLocaleLowerCase() === context.currentUserName.trim().toLocaleLowerCase();
        return { name: isSelf ? context.currentUserName : name, isSelf,
          avatarUrl: isSelf ? null : context.people.find(p => p.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())?.avatarUrl ?? null };
      });
    })() } : {}),
    };
  });
  return { count: pending.length, bills: visible };
}
