import { useEffect, useRef, useState } from "react";
import { apiBase } from "./api";
import { Pressable, View, Text, Share } from "react-native";
import { useSession } from "./session";
import { Body, Card, Field, Notice, useTheme, money } from "./ui";
import { PlanAction, SummaryCard } from "./plan-ui";
export type BillItem = {
  id: string;
  description: string;
  amount: string;
  participantIds: string[];
  splitMethod?: "equal" | "exact" | "percentage" | "shares";
  allocations?: { participantId: string; value: string }[];
};
type Transfer = {
  fromParticipantId: string;
  toParticipantId: string;
  fromParticipantName: string;
  toParticipantName: string;
  amount: number;
};
export type EditableBill = {
  id: string;
  title: string;
  total: string;
  currency: string;
  billDate: string;
  settlementStatus: string;
  resolved?: boolean;
  participants?: { id: string; name: string }[];
  items?: BillItem[];
  settlement?: {
    participants: {
      id: string;
      name: string;
      paid: number;
      owed: number;
      balance: number;
    }[];
    transfers: Transfer[];
  };
};
export function BillDetails({
  bill,
  onSaved,
  onDeleted,
}: {
  bill: EditableBill;
  onSaved: (bill: EditableBill) => void;
  onDeleted: () => void;
}) {
  const session = useSession();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const { colors } = useTheme();
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [showSplit, setShowSplit] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [title, setTitle] = useState(bill.title);
  const [items, setItems] = useState(() =>
    (bill.items ?? []).map((i) => ({
      ...i,
      participantIds: i.participantIds?.length
        ? i.participantIds
        : (bill.participants ?? []).map((p) => p.id),
      splitMethod: i.splitMethod ?? "equal",
      allocations: i.allocations ?? [],
    })),
  );
  const [preview, setPreview] = useState(bill.settlement);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<
    "delete" | "resolve" | Transfer | null
  >(null);
  const [request, setRequest] = useState<Transfer | null>(null);
  const [requestAmount, setRequestAmount] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const payload = JSON.stringify({ title, items });
  const changed =
    title !== bill.title ||
    JSON.stringify(items) !==
      JSON.stringify(
        (bill.items ?? []).map((i) => ({
          ...i,
          participantIds: i.participantIds?.length
            ? i.participantIds
            : (bill.participants ?? []).map((p) => p.id),
          splitMethod: i.splitMethod ?? "equal",
          allocations: i.allocations ?? [],
        })),
      );
  useEffect(() => {
    if (!changed || session.demo) {
      setPreview(bill.settlement);
      return;
    }
    let active = true;
    setPreview(undefined);
    const timer = setTimeout(() => {
      session
        .request<{ settlement: EditableBill["settlement"] }>(
          `split-bills/${bill.id}/preview?workspaceId=${encodeURIComponent(session.profileId)}`,
          { method: "POST", body: payload },
        )
        .then((r) => {
          if (active) {
            setPreview(r.settlement);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    payload,
    changed,
    bill.id,
    bill.settlement,
    session.demo,
    session.profileId,
    session.request,
  ]);
  async function action(path: string, method: string, body?: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (session.demo)
        throw new Error("Use a signed-in account to save bill changes.");
      const result = await session.request<{
        bill?: EditableBill;
        request?: { id: string; shareUrl?: string };
      }>(`${path}?workspaceId=${encodeURIComponent(session.profileId)}`, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!alive.current) return;
      if (method === "DELETE") onDeleted();
      else if (result.bill) onSaved(result.bill);
      else {
        setMessage("Payment request created.");
        setShareUrl(result.request?.shareUrl ?? "");
        setRequest(null);
      }
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update bill.");
    } finally {
      setBusy(false);
    }
  }
  const update = (id: string, patch: Partial<BillItem>) =>
    setItems((current) =>
      current.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    );
  const people = bill.participants ?? [];
  return (
    <>
      <SummaryCard
        title="Bill total"
        value={money(bill.total, bill.currency)}
        detail={`${bill.billDate.slice(0, 10)} · ${bill.resolved ? "Resolved" : bill.settlementStatus}`}
      />
      <Field label="Bill name" value={title} onChangeText={setTitle} />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Body muted={false}>
          Items ·{" "}
          {money(
            String(items.reduce((s, i) => s + (Number(i.amount) || 0), 0)),
            bill.currency,
          )}
        </Body>
        <PlanAction
          title="Auto split"
          onPress={() => setShowSplit(!showSplit)}
        />
      </View>
      {showSplit ? (
        <Card>
          <Body>
            Choose a method for every item. Then tap an item to adjust
            allocations.
          </Body>
          {(["equal", "exact", "percentage", "shares"] as const).map(
            (method) => (
              <PlanAction
                key={method}
                title={
                  method === "equal"
                    ? "Split equally"
                    : method === "exact"
                      ? "Split by amount"
                      : method === "percentage"
                        ? "Split by percentage"
                        : "Split by shares"
                }
                onPress={() => {
                  setItems((current) =>
                    current.map((i) => ({
                      ...i,
                      splitMethod: method,
                      allocations:
                        method === "equal"
                          ? []
                          : i.participantIds.map((participantId) => ({
                              participantId,
                              value: method === "shares" ? "1" : "0",
                            })),
                    })),
                  );
                  setShowSplit(false);
                  setEditingItem(items[0]?.id ?? null);
                }}
              />
            ),
          )}
        </Card>
      ) : null}
      {items.map((item) => (
        <Card key={item.id}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.description}`}
            onPress={() =>
              setEditingItem(editingItem === item.id ? null : item.id)
            }
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <Body muted={false}>{item.description}</Body>
            <Body>{money(item.amount, bill.currency)}</Body>
          </Pressable>
          {editingItem === item.id ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 2 }}>
                <Field
                  label="Item name"
                  value={item.description}
                  onChangeText={(description) =>
                    update(item.id, { description })
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Amount"
                  value={item.amount}
                  keyboardType="decimal-pad"
                  onChangeText={(amount) => update(item.id, { amount })}
                />
              </View>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {people.map((person) => (
              <Pressable
                key={person.id}
                accessibilityRole="checkbox"
                accessibilityLabel={`${item.description}: ${person.name}`}
                accessibilityState={{
                  checked: item.participantIds.includes(person.id),
                }}
                onPress={() =>
                  update(item.id, {
                    participantIds: item.participantIds.includes(person.id)
                      ? item.participantIds.filter((id) => id !== person.id)
                      : [...item.participantIds, person.id],
                    allocations: [],
                  })
                }
                style={{
                  padding: 8,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: colors.ink }}>
                  {item.participantIds.includes(person.id) ? "☑" : "☐"}{" "}
                  {person.name}
                </Text>
              </Pressable>
            ))}
          </View>
          {editingItem === item.id ? (
            <>
              <Body>Split method</Body>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {(["equal", "exact", "percentage", "shares"] as const).map(
                  (method) => (
                    <PlanAction
                      key={method}
                      title={
                        method === "exact"
                          ? "By amount"
                          : method === "equal"
                            ? "Equally"
                            : method === "percentage"
                              ? "By percent"
                              : "By shares"
                      }
                      tone={item.splitMethod === method ? "primary" : "view"}
                      onPress={() =>
                        update(item.id, {
                          splitMethod: method,
                          allocations:
                            method === "equal"
                              ? []
                              : item.participantIds.map((participantId) => ({
                                  participantId,
                                  value: method === "shares" ? "1" : "0",
                                })),
                        })
                      }
                    />
                  ),
                )}
              </View>
              {item.splitMethod !== "equal"
                ? item.participantIds.map((id) => (
                    <Field
                      key={id}
                      label={`${people.find((p) => p.id === id)?.name ?? "Person"} ${item.splitMethod === "percentage" ? "%" : item.splitMethod === "shares" ? "shares" : "amount"}`}
                      value={
                        item.allocations.find((a) => a.participantId === id)
                          ?.value ?? "0"
                      }
                      keyboardType="decimal-pad"
                      onChangeText={(value) =>
                        update(item.id, {
                          allocations: item.participantIds.map(
                            (participantId) => ({
                              participantId,
                              value:
                                participantId === id
                                  ? value
                                  : (item.allocations.find(
                                      (a) => a.participantId === participantId,
                                    )?.value ?? "0"),
                            }),
                          ),
                        })
                      }
                    />
                  ))
                : null}
            </>
          ) : null}
        </Card>
      ))}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Body>{message}</Body> : null}
      {shareUrl ? (
        <PlanAction
          title="Share payment request"
          onPress={() =>
            void Share.share({ message: `${apiBase()}${shareUrl}` })
          }
        />
      ) : null}
      <Body muted={false}>
        {changed ? "Preview · not saved" : "People and balances"}
      </Body>
      {preview?.participants.map((p) => (
        <View
          key={p.id}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderColor: colors.line,
          }}
        >
          <Body muted={false}>{p.name}</Body>
          <Body>{money(String(p.owed), bill.currency)} share</Body>
        </View>
      ))}
      <PlanAction
        title={busy ? "Saving…" : "Save changes"}
        tone="primary"
        disabled={busy || !changed || !preview}
        onPress={() =>
          action(`split-bills/${bill.id}`, "PATCH", JSON.parse(payload))
        }
      />
      {bill.resolved ? (
        <Notice>
          Bill resolved. Payment reminders stopped; no payment recorded.
        </Notice>
      ) : changed ? (
        <Body>
          Save your item changes before requesting or recording payments.
        </Body>
      ) : (
        <>
          {bill.settlement?.transfers.map((t) => (
            <Card key={`${t.fromParticipantId}-${t.toParticipantId}`}>
              <Body>
                {t.fromParticipantName} owes {t.toParticipantName}{" "}
                {money(String(t.amount), bill.currency)}
              </Body>
              <PlanAction
                title="Request payment"
                tone="primary"
                onPress={() => {
                  setRequest(t);
                  setRequestAmount(String(t.amount));
                  setNote("");
                }}
              />
              <PlanAction
                title="Record payment received"
                onPress={() => setConfirm(t)}
              />
            </Card>
          ))}
        </>
      )}
      {request ? (
        <Card>
          <Body muted={false}>
            Request payment from {request.fromParticipantName}
          </Body>
          <Field
            label="Amount requested"
            value={requestAmount}
            keyboardType="decimal-pad"
            onChangeText={setRequestAmount}
          />
          <Field label="Note" value={note} onChangeText={setNote} />
          <PlanAction
            title="Cancel request"
            disabled={busy}
            onPress={() => setRequest(null)}
          />
          <PlanAction
            title="Create payment request"
            tone="primary"
            disabled={busy}
            onPress={() =>
              action(`split-bills/${bill.id}/payment-requests`, "POST", {
                recipientParticipantId: request.fromParticipantId,
                payeeParticipantId: request.toParticipantId,
                amount: requestAmount,
                note,
              })
            }
          />
        </Card>
      ) : null}
      {!bill.resolved ? (
        <PlanAction
          title="Mark as resolved"
          disabled={busy}
          onPress={() => setConfirm("resolve")}
        />
      ) : null}
      <PlanAction
        title="Delete bill"
        tone="delete"
        disabled={busy}
        onPress={() => setConfirm("delete")}
      />
      {confirm ? (
        <Card>
          <Body>
            {confirm === "delete"
              ? "Delete this split bill?"
              : confirm === "resolve"
                ? "Resolve this bill and stop payment reminders? This will not record a payment."
                : "Confirm this payment has been received."}
          </Body>
          <PlanAction
            title="Cancel"
            disabled={busy}
            onPress={() => setConfirm(null)}
          />
          <PlanAction
            title="Confirm"
            tone={confirm === "delete" ? "delete" : "primary"}
            disabled={busy}
            onPress={() =>
              confirm === "delete"
                ? action(`split-bills/${bill.id}`, "DELETE")
                : confirm === "resolve"
                  ? action(`split-bills/${bill.id}/resolution`, "POST")
                  : action(
                      `split-bills/${bill.id}/transfer-settlements`,
                      "POST",
                      confirm,
                    )
            }
          />
        </Card>
      ) : null}
    </>
  );
}
