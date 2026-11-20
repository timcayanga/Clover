export type PendingSplitBill = { id: string; title: string; currency: string; remaining: number; avatars?: PendingSplitBillAvatar[] };
export type PendingSplitBillAvatar = { name: string; avatarUrl: string | null; isSelf?: boolean };
type AvatarContext = { groups: readonly { id: string; name: string; avatarUrl: string | null }[]; people: readonly { name: string; avatarUrl: string | null }[]; currentUserName: string };
export function homePendingSplitBills(bills: readonly {
  id: string; title: string; currency: string; resolved?: boolean;
  groupId?: string | null; participants?: readonly { name: string }[];
  settlement: { transfers: readonly { amount: number }[] };
}[], context?: AvatarContext): { count: number; bills: PendingSplitBill[] } {
  const pending = bills.filter(b => !b.resolved).map(b => ({
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
    remaining:b.settlement.transfers.reduce((sum,t)=>sum+(Number.isFinite(t.amount) && t.amount > 0 ? t.amount : 0),0),
  })).filter(b => b.remaining > 0.005);
  return {count:pending.length,bills:pending.slice(0,3)};
}
