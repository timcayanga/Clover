import { useState } from "react";
import { Body, Card, Notice, money } from "./ui";
import { PlanAction, usePlanData } from "./plan-ui";
import { remainingDebts, simplifyDebts } from "../../shared/split-debts";

import type { EditableBill } from "./bill-details";
type LedgerBill = EditableBill & {
  recorder?: string;
  group?: { id: string; name: string } | null;
};
export const ledgerSample = {
  bills: [] as LedgerBill[],
  viewerName: "",
  hasMore: false,
};
export function DebtList({
  bills,
  person,
}: {
  bills: LedgerBill[];
  person?: string;
}) {
  const groups = new Map<string, LedgerBill[]>();
  for (const bill of bills) {
    const key = bill.group?.id ?? "";
    const group = groups.get(key) ?? [];
    group.push(bill);
    groups.set(key, group);
  }
  const plans = [...groups.values()]
    .map((rows) => ({
      group: rows[0].group,
      debts: simplifyDebts(remainingDebts(rows)).filter(
        (d) =>
          !person ||
          [d.from, d.to].some((n) => n.toLowerCase() === person.toLowerCase()),
      ),
    }))
    .filter((p) => p.debts.length);
  return (
    <Card>
      <Body muted={false}>Simplified Debt</Body>
      {plans.length ? (
        plans.map((plan) => (
          <Card key={plan.group?.id ?? ""}>
            {groups.size > 1 ? (
              <Body>{plan.group?.name ?? "Personal Bills"}</Body>
            ) : null}
            {plan.debts.map((d) => (
              <Body key={JSON.stringify([d.currency, d.from, d.to])}>
                {d.from} → {d.to} · {money(String(d.cents / 100), d.currency)}
              </Body>
            ))}
          </Card>
        ))
      ) : (
        <Body>No outstanding debt.</Body>
      )}
    </Card>
  );
}
function AllDebts() {
  const { data, error } = usePlanData("split-bills?view=ledger", ledgerSample);
  if (error) return <Notice>{error}</Notice>;
  return data ? (
    <DebtList bills={data.bills} />
  ) : (
    <Body>Loading balances…</Body>
  );
}
export function SimplifyAction({ bills }: { bills?: LedgerBill[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PlanAction
        title={open ? "Hide Simplified Debts" : "Simplify Debts"}
        onPress={() => setOpen(!open)}
      />
      {open ? bills ? <DebtList bills={bills} /> : <AllDebts /> : null}
    </>
  );
}
