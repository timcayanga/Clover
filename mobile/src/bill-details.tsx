import { ChoiceField } from "./transaction-entry";
import { PersonAvatar } from "./person-avatar";
import { ScrollView } from "react-native";
import { useUser } from "@clerk/expo";
import { SplitItemGrid } from "./split-item-grid";
import { PaymentOptionMark } from "./payment-option-mark";
import {
  splitItemTotals,
  paymentRequestMessage,
} from "../../shared/split-bill-experience";
import { Text } from "./app-text";
import { useEffect, useRef, useState } from "react";
import { apiBase } from "./api";
import { Pressable, View, Share } from "react-native";
import { useSession } from "./session";
import { Body, Card, Field, Notice, useTheme, money } from "./ui";
import { PlanAction } from "./plan-ui";
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
  payments?: {
    id: string;
    participantId: string;
    amount: string;
    note?: string | null;
  }[];
  transferSettlements?: {
    id: string;
    fromParticipantId: string;
    toParticipantId: string;
    fromParticipantName: string;
    toParticipantName: string;
    amount: string;
    createdAt: string;
  }[];
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
  paymentProfiles,
  peopleProfiles = [],
  relatedBills = [],
  onManagePaymentOptions,
}: {
  bill: EditableBill;
  peopleProfiles?: { name: string; avatarUrl?: string | null }[];
  relatedBills?: EditableBill[];
  paymentProfiles: {
    id: string;
    label: string;
    provider: string;
    currency: string;
    isDefault: boolean;
  }[];
  onManagePaymentOptions: () => void;
  onSaved: (bill: EditableBill) => void;
  onDeleted: () => void;
}) {
  const session = useSession();
  const { user } = useUser();
  const [addedParticipants, setAddedParticipants] = useState<
    { id: string; name: string }[]
  >([]);
  const [addingPerson, setAddingPerson] = useState(false);
  const [personName, setPersonName] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const { colors } = useTheme();
  const [shareUrl, setShareUrl] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [requestCurrency, setRequestCurrency] = useState(bill.currency);
  const [billAmount, setBillAmount] = useState("");
  const [paymentOptionsOpen, setPaymentOptionsOpen] = useState(false);
  const [paymentProfileId, setPaymentProfileId] = useState("");
  const availableProfiles = paymentProfiles.filter(
    (profile) => profile.currency === requestCurrency,
  );
  const [currency, setCurrency] = useState(bill.currency);
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
  const adjustment =
    Number(bill.total) -
    (bill.items ?? []).reduce((sum, item) => sum + Number(item.amount), 0);
  const instantTotals = splitItemTotals(
    [...(bill.participants ?? []), ...addedParticipants],
    items,
    adjustment,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<
    Transfer | null
  >(null);
  const [request, setRequest] = useState<Transfer | null>(null);
  const [requestAmount, setRequestAmount] = useState("");
  const [extraBills, setExtraBills] = useState<string[]>([]);
  const candidates = (requestCurrency === bill.currency ? relatedBills : [])
    .filter(
      (b) => b.id !== bill.id && !b.resolved && b.currency === bill.currency,
    )
    .flatMap((b) => {
      const transfer = b.settlement?.transfers.find(
        (t) =>
          t.fromParticipantName === request?.fromParticipantName &&
          t.toParticipantName === request?.toParticipantName &&
          t.amount > 0,
      );
      return transfer ? [{ bill: b, transfer }] : [];
    });
  const requestLock = useRef(false);
  const prepareRequests = async () => {
    if (requestLock.current || busy || !request) return;
    requestLock.current = true;
    setBusy(true);
    setError("");
    const ready: {
      title: string;
      amount: string;
      currency: string;
      date: string;
      url: string;
      note: string;
    }[] = [];
    try {
      for (const entry of [
        { bill, transfer: request },
        ...candidates.filter((c) => extraBills.includes(c.bill.id)),
      ]) {
        const amount =
          entry.bill.id === bill.id
            ? requestAmount
            : String(entry.transfer.amount);
        const result = await session.request<{ request: { shareUrl: string } }>(
          `split-bills/${entry.bill.id}/payment-requests?workspaceId=${encodeURIComponent(session.profileId)}`,
          {
            method: "POST",
            body: JSON.stringify({
              recipientParticipantId: entry.transfer.fromParticipantId,
              payeeParticipantId: entry.transfer.toParticipantId,
              amount,
              currency: requestCurrency,
              billAmount:
                requestCurrency === bill.currency ? undefined : billAmount,
              paymentProfileId,
              note,
            }),
          },
        );
        ready.push({
          title: entry.bill.title,
          amount,
          currency: requestCurrency,
          date: entry.bill.billDate,
          url: `${apiBase()}${result.request.shareUrl}`,
          note,
        });
      }
      const text = paymentRequestMessage(request.fromParticipantName, ready);
      setShareMessage(text);
      setShareUrl(ready[0]?.url ?? "");
      setRequest(null);
      setMessage("Your request is ready. Choose a contact or app to send it.");
      await Share.share({ message: text }).catch(() =>
        setMessage(
          "Requests saved. Tap Share payment request to choose a contact or app.",
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to prepare requests.");
      if (ready.length) {
        setShareMessage(
          paymentRequestMessage(request.fromParticipantName, ready),
        );
        setShareUrl(ready[0].url);
        setMessage(
          "Some requests are ready below. Retry to finish the remaining requests; existing requests will be reused.",
        );
      }
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  };
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const payload = JSON.stringify({
    title,
    ...(currency !== bill.currency ? { currency } : {}),
    items,
    ...(addedParticipants.length ? { addedParticipants } : {}),
  });
  const changed =
    addedParticipants.length > 0 ||
    currency !== bill.currency ||
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
  const actionPending = useRef(false);
  async function action(path: string, method: string, body?: unknown) {
    if (busy || actionPending.current) return;
    actionPending.current = true;
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
      else if (result.bill) {
        setAddedParticipants([]);
        onSaved(result.bill);
      } else {
        const url = result.request?.shareUrl ?? "";
        const text = paymentRequestMessage(request?.fromParticipantName ?? "", [
          {
            title: bill.title,
            amount: requestAmount,
            currency: requestCurrency,
            date: bill.billDate,
            url: `${apiBase()}${url}`,
            note,
          },
        ]);
        setShareUrl(url);
        setShareMessage(text);
        setMessage(
          "Your request is ready. Choose a contact or app to send it, or share it again below.",
        );
        setRequest(null);
        if (url)
          await Share.share({ message: text }).catch(() =>
            setMessage(
              "Your request is saved. Tap Share payment request to choose a contact or app.",
            ),
          );
      }
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update bill.");
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }
  const update = (id: string, patch: Partial<BillItem>) =>
    setItems((current) =>
      current.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    );
  const people = [...(bill.participants ?? []), ...addedParticipants];
  return (
    <>
      <Card>
        <Field label="Bill name" value={title} onChangeText={setTitle} />
        <Text style={{ color: colors.ink, fontFamily: "Poppins-SemiBold", fontSize: 22 }}>{money(bill.total, currency)}</Text>
        <Body>{bill.billDate.slice(0, 10)}</Body>
        <ChoiceField label="Bill currency" value={currency} onChange={setCurrency}
          options={[...new Set([bill.currency, ...(session.data?.currencyChoices ?? []).map(c => c.code), "PHP", "USD", "EUR", "SGD", "THB", "JPY", "GBP", "IDR"])].map(code => ({ value: code, label: code }))} />
        {currency !== bill.currency ? <Body>Saving changes the bill currency and keeps the amounts you entered.</Body> : null}
      </Card>
      {addingPerson ? (
        <Card>
          <Field
            label="Person Name"
            value={personName}
            onChangeText={setPersonName}
          />
          <PlanAction
            title="Add Person"
            onPress={() => {
              const name = personName.trim();
              if (
                !name ||
                people.some((p) => p.name.toLowerCase() === name.toLowerCase())
              ) {
                setError("Choose a distinct person name.");
                return;
              }
              setAddedParticipants((old) => [
                ...old,
                {
                  id: `person-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  name,
                },
              ]);
              setPersonName("");
              setAddingPerson(false);
            }}
          />
        </Card>
      ) : null}
      <SplitItemGrid
        people={people.map((p) => ({
          ...p,
          avatarUrl:
            /^(you|me)$/i.test(p.name) || p.name === user?.fullName
              ? user?.imageUrl
              : peopleProfiles.find((profile) => profile.name === p.name)
                  ?.avatarUrl,
        }))}
        onAddPerson={() => setAddingPerson(true)}
        items={items}
        adjustment={adjustment}
        currency={currency}
        onChange={(next) =>
          setItems(
            next.map((item, index) => ({
              ...item,
              id: item.id ?? `new-${index}`,
              splitMethod: item.splitMethod ?? "equal",
              allocations: item.allocations ?? [],
            })),
          )
        }
      />
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Body>{message}</Body> : null}
      {shareUrl ? (
        <PlanAction
          title="Share payment request"
          onPress={() =>
            void Share.share({ message: shareMessage }).catch(() =>
              setError("Unable to open sharing. Please try again."),
            )
          }
        />
      ) : null}
      <Body muted={false}>
        {changed ? "Preview · not saved" : "People and balances"}
      </Body>
      <ScrollView horizontal>
        <View style={{ minWidth: 510 }}>
          <View style={{ flexDirection: "row", paddingVertical: 10 }}>
            {["Person", "Paid", "Share", "Owed"].map((label, i) => (
              <Text
                key={label}
                style={{ width: i === 0 ? 174 : 112, color: colors.muted }}
              >
                {label}
              </Text>
            ))}
          </View>
          {(preview?.participants ?? bill.settlement?.participants ?? []).map(
            (p) => {
              const paid = p.paid;
              const share = changed ? (instantTotals[p.id] ?? 0) : p.owed;
              const settled = (bill.transferSettlements ?? []).reduce(
                (sum, t) =>
                  sum +
                  (t.fromParticipantId === p.id
                    ? Number(t.amount)
                    : t.toParticipantId === p.id
                      ? -Number(t.amount)
                      : 0),
                0,
              );
              const balance = paid - share + settled;
              return (
                <View
                  key={p.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderColor: colors.line,
                  }}
                >
                  <View
                    style={{
                      width: 174,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <PersonAvatar
                      name={p.name}
                      imageUrl={
                        /^(you|me)$/i.test(p.name) || p.name === user?.fullName
                          ? user?.imageUrl
                          : peopleProfiles.find(
                              (person) => person.name === p.name,
                            )?.avatarUrl
                      }
                    />
                    <Text style={{ flex: 1, color: colors.ink }}>{p.name}</Text>
                  </View>
                  {[
                    money(String(paid), currency),
                    money(String(share), currency),
                    Math.abs(balance) < 0.005
                      ? "Settled"
                      : `${balance > 0 ? "Is owed" : "Owes"} ${money(String(Math.abs(balance)), currency)}`,
                  ].map((v, i) => (
                    <Text key={i} style={{ width: 112, color: colors.ink }}>
                      {v}
                    </Text>
                  ))}
                </View>
              );
            },
          )}
        </View>
      </ScrollView>
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
              <Body>{t.fromParticipantName} → {t.toParticipantName}</Body>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <PlanAction
                title="Request Payment"
                tone="primary"
                onPress={() => {
                  setPaymentProfileId(
                    (
                      paymentProfiles.find(
                        (profile) =>
                          profile.currency === bill.currency &&
                          profile.isDefault,
                      ) ??
                      paymentProfiles.find(
                        (profile) => profile.currency === bill.currency,
                      )
                    )?.id ?? "",
                  );
                  setExtraBills([]);
                  setRequestCurrency(bill.currency);
                  setBillAmount("");
                  setRequest(t);
                  setRequestAmount(String(t.amount));
                  setNote("");
                }}
              />
              <PlanAction
                title="Paid"
                onPress={() => setConfirm(t)}
              />
              </View>
            </Card>
          ))}
        </>
      )}
      {request ? (
        <Card>
          <Body muted={false}>Request From</Body>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <PersonAvatar
              name={request.toParticipantName}
              imageUrl={
                /^(you|me)$/i.test(request.toParticipantName) ||
                request.toParticipantName === user?.fullName
                  ? user?.imageUrl
                  : peopleProfiles.find(
                      (p) => p.name === request.toParticipantName,
                    )?.avatarUrl
              }
            />
            <Body muted={false}>{request.toParticipantName}</Body>
          </View>
          <Body>Request To: {request.fromParticipantName}</Body>
          <ChoiceField
            label="Currency"
            value={requestCurrency}
            options={Array.from(
              new Set([
                bill.currency,
                ...paymentProfiles.map((p) => p.currency),
                ...(session.data?.currencyChoices ?? []).map((c) => c.code),
                "PHP",
                "USD",
                "IDR",
                "SGD",
                "EUR",
                "GBP",
                "THB",
                "JPY",
              ]),
            ).map((c) => ({ value: c, label: c }))}
            onChange={(c) => {
              setRequestCurrency(c);
              setRequestAmount("");
              setBillAmount("");
              setPaymentProfileId("");
              setExtraBills([]);
            }}
          />
          {requestCurrency !== bill.currency ? (
            <Field
              label={`Amount Settled in ${bill.currency}`}
              value={billAmount}
              keyboardType="decimal-pad"
              onChangeText={setBillAmount}
            />
          ) : null}
          <Field
            label="Agreed Amount"
            value={requestAmount}
            keyboardType="decimal-pad"
            onChangeText={setRequestAmount}
          />
          {candidates.length ? (
            <Body muted={false}>
              Include other bills for {request.fromParticipantName}
            </Body>
          ) : null}
          {candidates.map((entry) => (
            <Pressable
              key={entry.bill.id}
              accessibilityRole="checkbox"
              accessibilityState={{
                checked: extraBills.includes(entry.bill.id),
              }}
              onPress={() =>
                setExtraBills((ids) =>
                  ids.includes(entry.bill.id)
                    ? ids.filter((id) => id !== entry.bill.id)
                    : [...ids, entry.bill.id],
                )
              }
            >
              <Body>
                {extraBills.includes(entry.bill.id) ? "☑" : "☐"}{" "}
                {entry.bill.title} ·{" "}
                {money(String(entry.transfer.amount), entry.bill.currency)}
              </Body>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: paymentOptionsOpen }}
            onPress={() => setPaymentOptionsOpen((v) => !v)}
          >
            <Body muted={false}>Payment Option ⌄</Body>
            {availableProfiles.find((p) => p.id === paymentProfileId) ? (
              <PaymentOptionMark
                provider={
                  availableProfiles.find((p) => p.id === paymentProfileId)!
                    .provider
                }
                label={
                  availableProfiles.find((p) => p.id === paymentProfileId)!
                    .label
                }
              />
            ) : (
              <Body>Choose Payment Option</Body>
            )}
          </Pressable>
          {paymentOptionsOpen ? (
            <>
              {availableProfiles.map((profile) => (
                <Pressable
                  key={profile.id}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: paymentProfileId === profile.id,
                  }}
                  onPress={() => {
                    setPaymentProfileId(profile.id);
                    setPaymentOptionsOpen(false);
                  }}
                  style={{
                    padding: 14,
                    borderWidth: 1,
                    borderRadius: 12,
                    borderColor:
                      paymentProfileId === profile.id
                        ? colors.teal
                        : colors.line,
                  }}
                >
                  <PaymentOptionMark
                    provider={profile.provider}
                    identity={profile}
                    label={profile.label}
                    selected={paymentProfileId === profile.id}
                  />
                </Pressable>
              ))}
              {!availableProfiles.length ? (
                <Body>
                  Save bank details or a QR image in Payments so they appear
                  with your request.
                </Body>
              ) : null}
              <PlanAction
                title="+ Add Payment Option"
                onPress={onManagePaymentOptions}
              />
            </>
          ) : null}
          <Field label="Note" value={note} onChangeText={setNote} />
          <PlanAction
            title="Cancel request"
            disabled={busy}
            onPress={() => setRequest(null)}
          />
          <PlanAction
            title={busy ? "Preparing…" : "Choose contact or share"}
            tone="primary"
            disabled={
              busy ||
              !availableProfiles.some(
                (profile) => profile.id === paymentProfileId,
              )
            }
            onPress={() => void prepareRequests()}
          />
        </Card>
      ) : null}
      <PlanAction
        title="Delete bill"
        tone="delete"
        disabled={busy}
        onPress={() => void action(`split-bills/${bill.id}`, "DELETE")}
      />
      {confirm ? (
        <Card>
          <Body>
            {`Confirm receipt of ${money(String(confirm.amount), bill.currency)} from ${confirm.fromParticipantName} for ${confirm.toParticipantName}?`}
          </Body>
          <PlanAction
            title="Cancel"
            disabled={busy}
            onPress={() => setConfirm(null)}
          />
          <PlanAction
            title="Confirm"
            tone="primary"
            disabled={busy}
            onPress={() =>
              action(
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
