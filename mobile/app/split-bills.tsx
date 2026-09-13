import { SplitGroupDetails, type SplitGroup } from "../src/split-group-details";
import * as DocumentPicker from "expo-document-picker";
import { BillDetails, type BillItem } from "../src/bill-details";
import { Platform, View, Text, Pressable, Image } from "react-native";
import { fileProblem, removeUploadCopy } from "../src/upload";
import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useSession } from "../src/session";
import {
  Body,
  Card,
  CategoryMark,
  Field,
  Notice,
  Screen,
  money,
  useTheme,
} from "../src/ui";
import {
  PlanAction,
  PlanHeader,
  PlanTabs,
  SummaryCard,
  usePlanData,
} from "../src/plan-ui";
type Bill = {
  id: string;
  title: string;
  note: string;
  billDate: string;
  currency: string;
  total: string;
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
    transfers: {
      fromParticipantId: string;
      toParticipantId: string;
      fromParticipantName: string;
      toParticipantName: string;
      amount: number;
    }[];
  };
};
const sample = { bills: [] as Bill[], hasMore: false, page: 1 };
const optionsSample = {
  groups: [] as {
    id: string;
    name: string;
    members: { id: string; name: string }[];
    _count: { bills: number };
  }[],
  people: [] as { id: string; name: string }[],
  profiles: [] as {
    id: string;
    label: string;
    provider: string;
    currency: string;
    accountName: string | null;
    accountNumber: string | null;
    qrImageData: string | null;
    isDefault: boolean;
  }[],
};
export default function SplitBills() {
  const params=useLocalSearchParams<{billId?:string}>();
  const session = useSession();
  const { colors } = useTheme();
  const [statusFilter, setStatusFilter] = useState("All");
  const [entity,setEntity] = useState<{group?:SplitGroup;person?:string}|null>(null);
  const [page, setPage] = useState(1);
  const { data, setData, error, reload } = usePlanData(
    `split-bills?page=${page}`,
    sample,
  );
  const options = usePlanData("together-options", optionsSample);
  const [paymentDetail, setPaymentDetail] = useState<
    (typeof optionsSample.profiles)[number] | null
  >(null);
  const [deletePayment, setDeletePayment] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [tab, setTab] = useState("Bills");
  const [selected, setSelected] = useState<Bill | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [detailError, setDetailError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setPage(1);
    setSelected(null);
    setAdding(false);
    setSearch("");
    setEntity(null);
    setPaymentDetail(null);
    setDeletePayment(false);
    setPaymentError("");
  }, [session.profileId]);
  useEffect(()=>{if(params.billId)setSelected({id:params.billId,title:"Bill",note:"",billDate:"",currency:"PHP",total:"0",settlementStatus:"open"});},[params.billId]);
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId || session.demo) return;
    let active = true;
    setLoading(true);
    setDetailError("");
    void session
      .request<{ bill: Bill }>(
        `split-bills/${selectedId}?workspaceId=${encodeURIComponent(session.profileId)}`,
      )
      .then((r) => {
        if (active) setSelected(r.bill);
      })
      .catch((e) => {
        if (active) setDetailError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId, session.demo, session.profileId, session.request]);
  if(entity) return <SplitGroupDetails key={session.profileId} {...entity} onClose={()=>setEntity(null)} onChanged={()=>options.reload()} onBill={id=>{setEntity(null);setSelected({id,title:"Bill",note:"",billDate:"",currency:"PHP",total:"0",settlementStatus:"open"});}}/>;
  if (adding)
    return (
      <BillEditor
        key={session.profileId}
        onClose={() => setAdding(false)}
        onSaved={(bill) => {
          setAdding(false);
          if (session.demo)
            setData((current) => ({
              ...sample,
              bills: [bill, ...(current?.bills ?? [])],
            }));
          else reload();
        }}
      />
    );
  if (paymentDetail)
    return (
      <Screen>
        <PlanHeader
          title="Payment Details"
          back={() => {
            setPaymentDetail(null);
            setDeletePayment(false);
          }}
        />
        <Card>
          <Body muted={false}>{paymentDetail.label}</Body>
          <Body>
            {paymentDetail.provider} · {paymentDetail.currency}
          </Body>
          <Body>{paymentDetail.accountName}</Body>
          <Body>{paymentDetail.accountNumber}</Body>
          {paymentDetail.qrImageData ? (
            <Image
              source={{ uri: paymentDetail.qrImageData }}
              accessibilityLabel="Payment QR code"
              style={{ width: 200, height: 200, alignSelf: "center" }}
              resizeMode="contain"
            />
          ) : null}
        </Card>
        {paymentError ? <Notice>{paymentError}</Notice> : null}
        {deletePayment ? (
          <>
            <Body>Delete this payment option?</Body>
            <PlanAction
              title="Cancel deletion"
              disabled={paymentBusy}
              onPress={() => setDeletePayment(false)}
            />
          </>
        ) : null}
        <PlanAction
          title={deletePayment ? "Confirm delete" : "Delete payment option"}
          tone="delete"
          disabled={paymentBusy}
          onPress={async () => {
            if (!deletePayment) {
              setDeletePayment(true);
              return;
            }
            setPaymentBusy(true);
            try {
              await session.request(
                `split-bill-payment-profiles/${paymentDetail.id}?workspaceId=${encodeURIComponent(session.profileId)}`,
                { method: "DELETE" },
              );
              setPaymentDetail(null);
              setDeletePayment(false);
              options.reload();
            } catch (e) {
              setPaymentError(
                e instanceof Error
                  ? e.message
                  : "Unable to delete payment option.",
              );
            } finally {
              setPaymentBusy(false);
            }
          }}
        />
      </Screen>
    );
  return (
    <Screen>
      <PlanHeader
        title={selected ? "Bill Details" : "Split Bills"}
        back={selected ? () => setSelected(null) : undefined}
        add={() => setAdding(true)}
      />
      {selected ? (
        <>
          {loading ? (
            <Body>Loading bill…</Body>
          ) : detailError ? (
            <Notice>{detailError}</Notice>
          ) : (
            <BillDetails
              key={`${selected.id}-${JSON.stringify(selected.items)}`}
              bill={selected}
              onSaved={(bill) => {
                setSelected(bill as Bill);
                reload();
              }}
              onDeleted={() => {
                setSelected(null);
                reload();
              }}
            />
          )}
        </>
      ) : (
        <>
          <PlanTabs
            items={["Bills", "Groups", "People", "Payment options"]}
            value={tab}
            onChange={setTab}
          />
          {tab === "Bills" ? (
            <>
              {error ? (
                <>
                  <Notice>{error}</Notice>
                  <PlanAction title="Try again" onPress={reload} />
                </>
              ) : !data ? (
                <Body>Loading bills…</Body>
              ) : (
                <>
                  <Field
                    label="Search bills on this page"
                    value={search}
                    onChangeText={setSearch}
                  />
                  <PlanTabs
                    items={["All", "Open", "Settled", "Resolved"]}
                    value={statusFilter}
                    onChange={setStatusFilter}
                  />
                  {data.bills.length ? (
                    data.bills
                      .filter(
                        (b) =>
                          b.title
                            .toLowerCase()
                            .includes(search.toLowerCase()) &&
                          (statusFilter === "All" ||
                            (statusFilter === "Resolved" && b.resolved) ||
                            (!b.resolved && (statusFilter === "Settled" ? b.settlementStatus === "settled" : statusFilter === "Open" && b.settlementStatus !== "settled"))),
                      )
                      .map((bill) => (
                        <Pressable
                          key={bill.id}
                          accessibilityRole="button"
                          accessibilityLabel={`View ${bill.title}`}
                          onPress={() => setSelected(bill)}
                          style={{
                            flexDirection: "row",
                            gap: 12,
                            alignItems: "center",
                            paddingVertical: 14,
                            borderBottomWidth: 1,
                            borderColor: colors.line,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Body muted={false}>{bill.title}</Body>
                            <Body>{bill.billDate.slice(0, 10)}</Body>
                          </View>
                          <View style={{ alignItems: "flex-end" }}>
                            <Body muted={false}>
                              {money(bill.total, bill.currency)}
                            </Body>
                            <Body>{bill.resolved ? "Resolved" : bill.settlementStatus}</Body>
                          </View>
                        </Pressable>
                      ))
                  ) : (
                    <>
                      <Notice>
                        No bills yet. Upload a receipt or add a bill manually.
                      </Notice>
                      <PlanAction
                        title="Upload receipt"
                        tone="primary"
                        onPress={() => setAdding(true)}
                      />
                      <PlanAction
                        title="Add bill manually"
                        onPress={() => setAdding(true)}
                      />
                    </>
                  )}
                  {page > 1 ? (
                    <PlanAction
                      title="Previous bills"
                      onPress={() => setPage((value) => value - 1)}
                    />
                  ) : null}
                  {data.hasMore ? (
                    <PlanAction
                      title="Next bills"
                      onPress={() => setPage((value) => value + 1)}
                    />
                  ) : null}
                  <Body>Page {page}</Body>
                </>
              )}
            </>
          ) : options.error ? (
            <>
              <Notice>{options.error}</Notice>
              <PlanAction title="Retry" onPress={options.reload} />
            </>
          ) : !options.data ? (
            <Body>Loading {tab.toLowerCase()}…</Body>
          ) : tab === "Groups" ? (
            <>
              {options.data.groups.length ? (
                options.data.groups.map((group) => (
                  <Card key={group.id}>
                    <Body muted={false}>{group.name}</Body>
                    <PlanAction title="View Group" onPress={()=>setEntity({group})}/>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {group.members.slice(0, 5).map((member) => (
                        <Text
                          accessibilityLabel={member.name}
                          key={member.id}
                          style={{
                            padding: 10,
                            borderRadius: 20,
                            backgroundColor: colors.bright,
                            color: colors.ink,
                          }}
                        >
                          {member.name
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")}
                        </Text>
                      ))}
                      {group.members.length > 5 ? (
                        <Body>+{group.members.length - 5}</Body>
                      ) : null}
                    </View>
                  </Card>
                ))
              ) : (
                <Notice>No groups yet.</Notice>
              )}
            </>
          ) : tab === "People" ? (
            <>
              {options.data.people.length ? (
                options.data.people.map((person) => (
                  <Card key={person.id}>
                    <Body muted={false}>{person.name}</Body>
                    <PlanAction title="View person" onPress={()=>setEntity({person:person.name})}/>
                  </Card>
                ))
              ) : (
                <Notice>No people saved yet.</Notice>
              )}
            </>
          ) : (
            <>
              {options.data.profiles.length ? (
                options.data.profiles.map((profile) => (
                  <Card key={profile.id}>
                    <Body muted={false}>
                      {profile.label}
                      {profile.isDefault ? " · Default" : ""}
                    </Body>
                    <Body>
                      {profile.provider} · {profile.currency}
                    </Body>
                    <Body>{profile.accountName}</Body>
                    <Body>{profile.accountNumber}</Body>
                    {profile.qrImageData ? (
                      <Image
                        source={{ uri: profile.qrImageData }}
                        accessibilityLabel={`${profile.label} QR code`}
                        style={{ width: 120, height: 120 }}
                        resizeMode="contain"
                      />
                    ) : null}
                    <PlanAction
                      title="View payment option"
                      onPress={() => setPaymentDetail(profile)}
                    />
                  </Card>
                ))
              ) : (
                <Notice>No payment options saved yet.</Notice>
              )}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
function BillEditor({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (bill: Bill) => void;
}) {
  const session = useSession();
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("");
  const [currency, setCurrency] = useState("PHP");
  const [date, setDate] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }),
  );
  const [receipt, setReceipt] = useState<{
    fileName: string;
    mimeType: string;
    storageKey: string;
    text: string;
    confidence: number;
    items: { description: string; amount: string }[];
  } | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const uploadReceipt = async () => {
    if (inFlight.current) return;
    if (session.demo) {
      setError(
        "Receipt upload requires signing in. You can test a manual split with sample data.",
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    let copiedUri = "";
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !alive.current) return;
      const file = picked.assets[0];
      copiedUri = file.uri;
      const problem = fileProblem(file);
      if (problem) throw new Error(problem);
      const form = new FormData();
      if (Platform.OS === "web")
        form.append("file", await (await fetch(file.uri)).blob(), file.name);
      else
        form.append("file", {
          uri: file.uri,
          name: file.name,
          type: file.mimeType ?? "application/octet-stream",
        } as unknown as Blob);
      const result = await session.request<{
        receiptStorageKey: string;
        preview: {
          merchantName: string | null;
          billDate: string | null;
          currency: string;
          total: string | null;
          receiptText: string;
          confidence: number;
          currencyWarning?: string | null;
          items: { description: string; amount: string }[];
        };
      }>(
        `split-bill-receipts/preview?workspaceId=${encodeURIComponent(session.profileId)}`,
        { method: "POST", body: form },
      );
      if (!alive.current) return;
      const p = result.preview;
      setReceipt({
        fileName: file.name,
        mimeType: file.mimeType ?? "application/octet-stream",
        storageKey: result.receiptStorageKey,
        text: p.receiptText,
        confidence: p.confidence,
        items: p.items.map((i) => ({
          description: i.description,
          amount: i.amount,
        })),
      });
      setTitle(p.merchantName ?? "");
      setTotal(p.total ?? "");
      setCurrency(p.currency);
      if (p.billDate) setDate(p.billDate.slice(0, 10));
      if (p.currencyWarning) setError(p.currencyWarning);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Receipt upload failed.");
    } finally {
      if (copiedUri) removeUploadCopy(copiedUri);
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const [names, setNames] = useState("You\n");
  const [payer, setPayer] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const participants = names
    .split("\n")
    .map((name) => ({ name: name.trim() }))
    .filter((p) => p.name);
  const save = async () => {
    if (inFlight.current) return;
    const parsedDate = new Date(`${date}T00:00:00Z`);
    if (
      !title.trim() ||
      !/^\d+(\.\d{1,2})?$/.test(total) ||
      Number(total) <= 0 ||
      !/^[A-Z]{3}$/.test(currency) ||
      participants.length < 2 ||
      new Set(participants.map((p) => p.name.toLowerCase())).size !==
        participants.length ||
      !Number.isFinite(+parsedDate) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      setError(
        "Enter a title, positive amount, valid date/currency and at least two distinct people.",
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = {
        title: title.trim(),
        note,
        billDate: date,
        currency,
        total,
        participants,
        paidByIndex: payer,
        ...(receipt ? { receipt } : {}),
      };
      const result = session.demo
        ? {
            bill: {
              ...payload,
              participants: payload.participants.map((p, index) => ({
                ...p,
                id: `demo-person-${index}`,
              })),
              id: `demo-${Date.now()}`,
              settlementStatus: "open",
            },
          }
        : await session.request<{ bill: Bill }>(
            `split-bills?workspaceId=${encodeURIComponent(session.profileId)}`,
            { method: "POST", body: JSON.stringify(payload) },
          );
      if (alive.current) onSaved(result.bill);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create bill.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <Screen>
      <PlanHeader
        title="Add Split Bill"
        back={() => {
          if (!busy) onClose();
        }}
      />
      <PlanAction
        title={busy ? "Please wait…" : "Choose receipt"}
        disabled={busy}
        tone="primary"
        onPress={() => void uploadReceipt()}
      />
      {receipt ? (
        <Card>
          <Body>
            {receipt.fileName} · {receipt.confidence}% extraction confidence
          </Body>
          <Notice>
            Review the title, total, currency and date before creating the bill.
            The confirmed total is split equally; the original receipt and
            extracted items are retained separately.
          </Notice>
          {receipt.items.map((item, index) => (
            <Body key={index}>
              {item.description} · {item.amount}
            </Body>
          ))}
        </Card>
      ) : null}
      <Field
        label="Bill title"
        value={title}
        onChangeText={setTitle}
        maxLength={100}
      />
      <Field
        label="Total"
        value={total}
        onChangeText={setTotal}
        keyboardType="decimal-pad"
      />
      <Field
        label="Currency"
        value={currency}
        onChangeText={(v) => setCurrency(v.toUpperCase())}
        maxLength={3}
      />
      <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
      <Field
        label="People (one name per line)"
        value={names}
        onChangeText={(value) => {
          setNames(value);
          setPayer(null);
        }}
        multiline
      />
      <Body>Split equally between these people.</Body>
      <Body>Who paid?</Body>
      <PlanAction
        title={payer === null ? "Not paid yet ✓" : "Not paid yet"}
        onPress={() => setPayer(null)}
      />
      {participants.map((person, index) => (
        <PlanAction
          key={index}
          title={`${person.name}${payer === index ? " ✓" : ""}`}
          onPress={() => setPayer(index)}
        />
      ))}
      <Field
        label="Note"
        value={note}
        onChangeText={setNote}
        maxLength={1000}
      />
      {error ? <Notice>{error}</Notice> : null}
      <PlanAction title="Cancel" disabled={busy} onPress={onClose} />
      <PlanAction
        title={busy ? "Creating…" : "Create bill"}
        tone="primary"
        disabled={busy}
        onPress={() => void save()}
      />
    </Screen>
  );
}
