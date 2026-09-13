import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useSession } from "./session";
import { Body, Card, Field, Notice, Screen, money, useTheme } from "./ui";
import {
  PlanAction,
  PlanHeader,
  PlanTabs,
  SummaryCard,
  usePlanData,
} from "./plan-ui";
import type { EditableBill } from "./bill-details";
export type SplitGroup = {
  id: string;
  name: string;
  members: { id: string; name: string }[];
};
const sample = { bills: [] as EditableBill[], hasMore: false };
export function SplitGroupDetails({
  group,
  person,
  onClose,
  onBill,
  onChanged,
}: {
  group?: SplitGroup;
  person?: string;
  onClose: () => void;
  onBill: (id: string) => void;
  onChanged: () => void;
}) {
  const session = useSession();
  const { colors } = useTheme();
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState("Bills");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group?.name ?? "");
  const [members, setMembers] = useState(
    group?.members.map((m) => m.name).join("\n") ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const {
    data,
    error: loadError,
    reload,
  } = usePlanData(
    `split-bills?page=${page}${group ? `&groupId=${encodeURIComponent(group.id)}` : ""}${person ? `&person=${encodeURIComponent(person)}` : ""}`,
    sample,
  );
  const balances = new Map<string, Map<string, number>>();
  for (const bill of data?.bills ?? [])
    for (const p of bill.settlement?.participants ?? []) {
      const currencies = balances.get(p.name) ?? new Map<string, number>();
      currencies.set(
        bill.currency,
        (currencies.get(bill.currency) ?? 0) + p.balance,
      );
      balances.set(p.name, currencies);
    }
  async function save(method: "PATCH" | "DELETE") {
    if (!group || busy) return;
    setBusy(true);
    try {
      await session.request(
        `split-bill-groups/${group.id}?workspaceId=${encodeURIComponent(session.profileId)}`,
        {
          method,
          ...(method === "PATCH"
            ? {
                body: JSON.stringify({
                  name,
                  members: members
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((name) => ({ name })),
                }),
              }
            : {}),
        },
      );
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update group.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <PlanHeader title={person ?? group?.name ?? "Group"} back={onClose} />
      {group ? (
        <PlanTabs
          items={["Bills", "People & balances"]}
          value={tab}
          onChange={setTab}
        />
      ) : null}
      {loadError ? <Notice>{loadError}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      {editing ? (
        <Card>
          <Field label="Group name" value={name} onChangeText={setName} />
          <Field
            label="People (one name per line)"
            value={members}
            multiline
            onChangeText={setMembers}
          />
          <PlanAction
            title="Cancel edit"
            disabled={busy}
            onPress={() => setEditing(false)}
          />
          <PlanAction
            title="Save group"
            tone="primary"
            disabled={busy}
            onPress={() => save("PATCH")}
          />
        </Card>
      ) : null}
      {person
        ? Array.from(balances.get(person) ?? [], ([currency, value]) => (
            <View key={currency} style={{ flexDirection: "row", gap: 8 }}>
              <SummaryCard
                title="Owes"
                value={money(String(Math.max(0, -value)), currency)}
                detail="Bills on this page"
              />
              <SummaryCard
                title="Is owed"
                value={money(String(Math.max(0, value)), currency)}
                detail="Bills on this page"
              />
            </View>
          ))
        : null}
      {tab === "Bills" || person ? (
        <>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Body>Bill</Body>
            <Body>Total</Body>
          </View>
          {data?.bills.map((bill) => (
            <Pressable
              key={bill.id}
              accessibilityRole="button"
              accessibilityLabel={`View ${bill.title}`}
              onPress={() => onBill(bill.id)}
              style={{
                flexDirection: "row",
                gap: 12,
                borderBottomWidth: 1,
                borderColor: colors.line,
                paddingVertical: 14,
              }}
            >
              <View style={{ flex: 1 }}>
                <Body muted={false}>{bill.title}</Body>
                <Body>{bill.billDate.slice(0, 10)}</Body>
              </View>
              <Body>{money(bill.total, bill.currency)}</Body>
            </Pressable>
          ))}
          {data && !data.bills.length ? (
            <Notice>No bills here yet.</Notice>
          ) : null}
        </>
      ) : (
        <>
          <Body>
            Balances for bills on this page. Open a bill to edit its items and
            amounts.
          </Body>
          {Array.from(balances, ([person, totals]) => (
            <View
              key={person}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderColor: colors.line,
              }}
            >
              <Body muted={false}>{person}</Body>
              <View>
                {Array.from(totals, ([currency, amount]) => (
                  <Body key={currency}>
                    {amount < 0 ? "Owes" : "Is owed"}{" "}
                    {money(String(Math.abs(amount)), currency)}
                  </Body>
                ))}
              </View>
            </View>
          ))}
        </>
      )}
      {page > 1 ? (
        <PlanAction title="Previous bills" onPress={() => setPage(page - 1)} />
      ) : null}
      {data?.hasMore ? (
        <PlanAction title="Next bills" onPress={() => setPage(page + 1)} />
      ) : null}
      {group && !person ? (
        <>
          <PlanAction title="Edit group" onPress={() => setEditing(true)} />
          <PlanAction
            title="Delete group"
            tone="delete"
            onPress={() => setConfirm(true)}
          />
          {confirm ? (
            <Card>
              <Body>
                Remove this group from active groups? Its bills remain in your
                history.
              </Body>
              <PlanAction
                title="Cancel deletion"
                disabled={busy}
                onPress={() => setConfirm(false)}
              />
              <PlanAction
                title="Confirm delete group"
                tone="delete"
                disabled={busy}
                onPress={() => save("DELETE")}
              />
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
