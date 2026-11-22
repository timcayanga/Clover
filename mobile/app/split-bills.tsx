import { AddSplitPerson, type DirectoryPerson } from "../src/add-split-person";
import {PaymentDetailsEditor} from "../src/payment-details-editor";
import {SimplifyAction} from "../src/simplified-debts";
import { TogetherToolbar } from "../src/together-toolbar";
import { TogetherEntry } from "../src/together-entry";
import { onContextBillEntry } from "../src/bill-entry-events";
import { BillEditor } from "../src/direct-bill-editor";
import { usePageAskScope } from "../src/page-ask-context";
import { useUser } from "@clerk/expo";
import { type AccountCardPalette, accountCardPalette } from "../../shared/visual-identity";
import { SplitItemGrid } from "../src/split-item-grid";
import { paymentLines } from "../../shared/payment-display";
import { suggestBillCategory, type SplitItem } from "../../shared/split-bill-experience";
import { SwipeDeleteRow } from "../src/swipe-delete-row";
import { AdaptiveGrid } from "../src/adaptive";
import { CloverEmptyState } from "../src/clover-mascot";
import { EntryOverlay } from "../src/entry-overlay";
import type { Transaction } from "../src/types";
import { Text } from "../src/app-text";
import { AddEntryMethods } from "../src/add-entry-methods";
import { LinearGradient } from "expo-linear-gradient";
import { PersonAvatar } from "../src/person-avatar";
import { AccountTypeMark } from "../src/account-type-mark";
import { SplitGroupDetails, type SplitGroup } from "../src/split-group-details";
import * as DocumentPicker from "expo-document-picker";
import { BillDetails, type BillItem } from "../src/bill-details";
import { Platform, View, Pressable, Image } from "react-native";
import { fileProblem, removeUploadCopy } from "../src/upload";
import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useSession } from "../src/session";
import {
  Body,
  Button,
  Card,
  CategoryMark,
  Icon,
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

  usePlanData,
} from "../src/plan-ui";
import { AccountSummaryGrid } from "../src/account-summary-grid";
import { GroupCover } from "../src/group-cover";
type Bill = {
  id: string;
  title: string;
  note: string;
  billDate: string;
  currency: string;
  total: string;
  settlementStatus: string;
  resolved?: boolean;
  group?: { id: string; name: string } | null;
  categoryName?: string | null;
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
const balanceSample = { personBalances: {} as Record<string,{owed:string;owes:string}>, summary: { youOwe: "₱0.00", owedToYou: "₱0.00" } };
const sample = { bills: [] as Bill[], hasMore: false, page: 1 };
const optionsSample = {
  groups: [] as {
    id: string;
    name: string;
    members: { id: string; name: string }[];
    avatarUrl?: string | null;
    _count: { bills: number };
  }[],
  people: [] as DirectoryPerson[],
  profiles: [] as {
    id: string;
    label: string;
    provider: string;
    currency: string;
    accountName: string | null;
    accountNumber: string | null;
    qrImageData: string | null;
    qrThumbnail?: string | null;
    isDefault: boolean;
    brandLogoUrl?:string|null;
    brandPalette?:AccountCardPalette;
  }[],
};
function BillPeople({ demo, ...props }: {demo: boolean; participants: {id: string; name: string}[]; people: {id: string; name: string; avatarUrl?: string | null}[]}) {
  return demo ? <BillAvatars {...props}/> : <SignedInBillAvatars {...props}/>;
}
function SignedInBillAvatars(props: {participants: {id: string; name: string}[]; people: {id: string; name: string; avatarUrl?: string | null}[]}) {
  const { user } = useUser();
  return <BillAvatars {...props} ownName={user?.firstName ?? user?.fullName ?? undefined} ownPhoto={user?.imageUrl}/>;
}
function BillAvatars({participants, people, ownName, ownPhoto}: {participants: {id:string; name:string}[]; people: {id:string; name:string; avatarUrl?:string|null}[]; ownName?:string; ownPhoto?:string}) {
  return <View accessibilityLabel={participants.map(p => /^(you|me)$/i.test(p.name) ? ownName ?? p.name : p.name).join(", ")} style={{flexDirection:"row"}}>
    {participants.slice(0,5).map((person,index) => <View key={person.id} style={{marginLeft:index ? -7 : 0, borderWidth:2, borderColor:"white",borderRadius:14}}>
      <PersonAvatar name={/^(you|me)$/i.test(person.name) ? ownName ?? person.name : person.name}
        imageUrl={/^(you|me)$/i.test(person.name) ? ownPhoto : people.find(p=>p.id===person.id || p.name===person.name)?.avatarUrl} size={22}/>
    </View>)}
  </View>;
}
export default function SplitBills() {
  const params = useLocalSearchParams<{ billId?: string; transactionId?: string }>();
  const session = useSession();
  const { colors, dark } = useTheme();
  const [statusFilter, setStatusFilter] = useState("All");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entity, setEntity] = useState<{
    group?: SplitGroup;
    person?: string;
  } | null>(null);
  const [page, setPage] = useState(1);
  const {
    data,
    setData,
    error,
    reload: reloadBills,
  } = usePlanData(`split-bills?page=${page}`, sample);
  const balance = usePlanData("split-bills?summaryOnly=true", balanceSample);
  const reload = () => {
    reloadBills();
    balance.reload();
  };
  const options = usePlanData("together-options", optionsSample);
  const [paymentDetail, setPaymentDetail] = useState<
    (typeof optionsSample.profiles)[number] | null
  >(null);
  const [deletePayment, setDeletePayment] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [creating,setCreating]=useState<"Group"|"Payment"|null>(null);
  const [addingPerson,setAddingPerson] = useState(false);
  const [tab, setTab] = useState("Bills");
  const [selected, setSelected] = useState<Bill | null>(null);
  const [adding, setAdding] = useState(false);
  const [initialMethod,setInitialMethod] = useState<"manual"|"upload">("manual");
  function openTabAdd() {
    if (tab === "Bills") { setInitialMethod("manual"); setAdding(true); }
    else if (tab === "People") setAddingPerson(true);
    else setCreating(tab === "Groups" ? "Group" : "Payment");
  }
  useEffect(()=>onContextBillEntry(()=>{if(!entity)openTabAdd();}),[entity,tab]);
  const [sourceTransaction, setSourceTransaction] = useState<Transaction | null>(null);
  useEffect(() => {
    let active = true;
    setSourceTransaction(null);
    if (!params.transactionId || !session.profileId) return;
    void session.request<{ transaction: Transaction }>(`transactions/${encodeURIComponent(params.transactionId)}?workspaceId=${encodeURIComponent(session.profileId)}`).then(({ transaction }) => {
      if (active) { setSourceTransaction(transaction); setAdding(true); }
    }).catch((e: Error) => { if (active) setDetailError(e.message); });
    return () => { active = false; };
  }, [params.transactionId, session.profileId, session.request]);

  const [search, setSearch] = useState("");
  const [detailError, setDetailError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setPage(1);
    setSelected(null);
    setAdding(false);
    setSearch("");
    setAddingPerson(false);
    setEntity(null);
    setPaymentDetail(null);
    setDeletePayment(false);
    setPaymentError("");
  }, [session.profileId]);
  useEffect(() => {
    if (params.billId)
      setSelected({
        id: params.billId,
        title: "Bill",
        note: "",
        billDate: "",
        currency: "PHP",
        total: "0",
        settlementStatus: "open",
      });
  }, [params.billId]);
  usePageAskScope({page:"split-bills",title:selected?.title || "Split Bills",billId:selected?.id,currency:selected?.currency});
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId || session.demo || selected?.items?.length) return;
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
  if (entity && !selected)
    return (
      <SplitGroupDetails
        key={session.profileId}
        {...entity}
        group={options.data?.groups.find(g=>g.id===entity.group?.id)??entity.group}
        savedPeople={options.data?.people ?? []}
        onPersonSaved={updated=>options.setData(current=>current && ({...current,people:current.people.map(p=>p.id===updated.id ? updated : p)}))}
        onClose={() => setEntity(null)}
        onChanged={() => { if (!session.demo) { options.reload(); reload(); } }}
        onBill={(id) => {
          setSelected({
            id,
            title: "Bill",
            note: "",
            billDate: "",
            currency: "PHP",
            total: "0",
            settlementStatus: "open",
          });
        }}
      />
    );
  const entryOverlay = adding ? (
    <BillEditor
        key={sourceTransaction?.id || session.profileId}
        initialMethod={initialMethod}
        sourceTransaction={sourceTransaction}
        onClose={() => { setAdding(false); setSourceTransaction(null); }}
        onSaved={(bill) => {
          setAdding(false);
          setSourceTransaction(null);
          if (session.demo)
            setData((current) => ({
              ...sample,
              bills: [bill, ...(current?.bills ?? [])],
            }));
          else { reload(); options.reload(); }
        }}
      />
  ) : null;
  if (paymentDetail)
    return (
      <Screen layout="dashboard">
        <PlanHeader
          title="Payment Details"
          back={() => {
            setPaymentDetail(null);
            setDeletePayment(false);
          }}
        />
        <PaymentDetailsEditor key={paymentDetail.id} profile={paymentDetail} onSaved={p=>{setPaymentDetail(p);options.reload();}}/>
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
    <Screen layout="dashboard">
      {entryOverlay}
      {creating?<EntryOverlay onClose={()=>setCreating(null)}><TogetherEntry savedPeople={options.data?.people ?? []} kind={creating} onClose={()=>setCreating(null)} onSaved={() => {options.reload(); reload();}}/></EntryOverlay>:null}
      <PlanHeader
        title={selected ? "Bill Details" : "Split Bills"}
        back={selected ? () => setSelected(null) : undefined}
        add={openTabAdd}
      />
      {selected ? (
        <>
          {loading && !selected.items?.length ? (
            <Body>Loading bill…</Body>
          ) : detailError ? (
            <Notice>{detailError}</Notice>
          ) : (
            <BillDetails
              key={`${selected.id}-${JSON.stringify(selected.items)}`}
              bill={selected}
              peopleProfiles={options.data?.people ?? []}
              relatedBills={data?.bills ?? []}
              paymentProfiles={options.data?.profiles ?? []}
              onManagePaymentOptions={() => { setEntity(null); setSelected(null); setTab("Payments"); }}
              onSaved={(bill) => {
                setSelected(bill as Bill);
                options.reload();
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
            items={["Bills", "Groups", "People", "Payments"]}
            value={tab}
            onChange={value => {setTab(value);setAddingPerson(false);setSearch("");}}
          />
          {tab === "People" && addingPerson ? <AddSplitPerson initial={search} people={options.data?.people ?? []}
            onCancel={()=>setAddingPerson(false)} onSaved={person=>{
              options.setData(current => current && ({...current,people:[...current.people.filter(p=>p.id!==person.id),person]}));
              setSearch(person.displayName || person.name);
              setAddingPerson(false);
              if (!session.demo) options.reload();
            }}/> : tab !== "Bills" ? <TogetherToolbar search={search} onSearch={setSearch}
            placeholder={`Search ${tab.toLowerCase()}`} action={`Add ${tab==="Groups"?"Group":tab==="People"?"Person":"Payment"}`} onAdd={openTabAdd}/> : null}
          {tab === "Bills" ? (
            <>
              <AccountSummaryGrid metrics={[
                {label:"You Owe",value:balance.data?.summary?.youOwe ?? "—"},
                {label:"Owed to You",value:balance.data?.summary?.owedToYou ?? "—"},
              ]}/>

              {balance.error ? (
                <>
                  <Notice>Balance summary is unavailable.</Notice>
                  <Button
                    title="Retry balance summary"
                    secondary
                    onPress={balance.reload}
                  />
                </>
              ) : null}
              {error ? (
                <>
                  <Notice>{error}</Notice>
                  <PlanAction title="Try again" onPress={reloadBills} />
                </>
              ) : !data ? (
                <Body>Loading bills…</Body>
              ) : (
                <>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Field
                        accessibilityLabel="Search bills"
                        placeholder="Search bills"
                        style={{ height: 44, minHeight: 44, borderRadius: 22, paddingVertical: 0 }}
                        value={search}
                        onChangeText={setSearch}
                      />
                    </View>
                    <Button
                      title="Filters"
                      icon="options-outline"
                      secondary
                      onPress={() => setFiltersOpen((v) => !v)}
                    />
                  </View>
                  {filtersOpen ? (
                    <PlanTabs
                      compact
                      items={["All", "Open", "Settled", "Resolved"]}
                      value={statusFilter}
                      onChange={setStatusFilter}
                    />
                  ) : null}
                  {data.bills.length ? (
                    data.bills
                      .filter(
                        (b) =>
                          b.title
                            .toLowerCase()
                            .includes(search.toLowerCase()) &&
                          (statusFilter === "All" ||
                            (statusFilter === "Resolved" && b.resolved) ||
                            (!b.resolved &&
                              (statusFilter === "Settled"
                                ? b.settlementStatus === "settled"
                                : statusFilter === "Open" &&
                                  b.settlementStatus !== "settled"))),
                      )
                      .map((bill) => (
                        <SwipeDeleteRow key={bill.id} label={bill.title} disabled={session.demo} immediate onOpen={() => setSelected(bill)} onDelete={async () => {
                          await session.request(`split-bills/${bill.id}?workspaceId=${encodeURIComponent(session.profileId)}`, { method: "DELETE" });
                          setData(current => current ? { ...current, bills: current.bills.filter(row => row.id !== bill.id) } : current);
                          reload();
                        }}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`View ${bill.title}`}
                          onPress={() => setSelected(bill)}
                          style={{
                            flexDirection: "row",
                            gap: 12,
                            alignItems: "center",
                            backgroundColor: colors.white, borderRadius: 12, paddingHorizontal: 12, marginBottom: 8,
                            paddingVertical: 14,
                            borderBottomWidth: 1,
                            borderColor: colors.line,
                          }}
                        >
                          <CategoryMark name={bill.categoryName || suggestBillCategory(bill.title)?.name} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.ink, fontFamily: "Poppins-SemiBold", fontSize: 14 }}>{bill.title}</Text>
                            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                              <Text style={{ color: colors.muted, fontSize: 12 }}>{bill.billDate.slice(0,10)}</Text>
                              <BillPeople participants={bill.participants ?? []} people={options.data?.people ?? []} demo={session.demo}/>
                            </View>
                          </View>
                          <View style={{ alignItems: "flex-end" }}>
                            <Body muted={false}>
                              {money(bill.total, bill.currency)}
                            </Body>
                            {bill.resolved || bill.settlementStatus !== "open" ? <Body>{bill.resolved ? "Resolved" : bill.settlementStatus === "awaiting_payer" ? "Assign Payer" : bill.settlementStatus.replaceAll("_"," ").replace(/^./, c=>c.toUpperCase())}</Body> : null}
                          </View>
                          <Text
                            style={{ fontSize: 26, color: colors.ink }}
                            accessibilityElementsHidden
                          >
                            ›
                          </Text>
                        </Pressable>
                        </SwipeDeleteRow>
                      ))
                  ) : (
                    <View
                      style={{
                        alignItems: "center",
                        gap: 14,
                        paddingVertical: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.ink,
                          fontFamily: "Poppins-SemiBold",
                          fontSize: 18,
                        }}
                      >
                        No bills yet
                      </Text>
                      <CloverEmptyState pose="circles">Upload a receipt or add a split bill.</CloverEmptyState>
                      <View style={{ flexDirection: "row", gap: 12 }}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Add bill manually"
                          onPress={() => {setInitialMethod("manual");setAdding(true);}}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            borderWidth: 1,
                            borderColor: colors.line,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Icon line name="add" size={20} />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Upload receipt"
                          onPress={() => {setInitialMethod("upload");setAdding(true);}}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            backgroundColor: colors.teal,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Icon
                            line
                            name="cloud-upload-outline"
                            size={20}
                            color="white"
                          />
                        </Pressable>
                      </View>
                    </View>
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
                  {page > 1 || data.hasMore ? <Body>Page {page}</Body> : null}
                  <SimplifyAction/>
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
                <AdaptiveGrid>{options.data.groups.filter(g=>g.name.toLowerCase().includes(search.toLowerCase())).map((group) => (
                  <Pressable key={group.id} onPress={() => setEntity({ group })}>
                  <LinearGradient
                    colors={
                      dark ? ["#193A43", "#182B36"] : ["#E4FAF3", "#DFF2FA"]
                    }
                    style={{
                      borderRadius: 20,
                      overflow: "hidden",
                      borderWidth: 1,
                      borderColor: colors.line,
                    }}
                  >
                    <GroupCover id={group.id} url={group.avatarUrl} style={{ width: "100%", height: 92 }} />
                    <View style={{ padding: 10, gap: 6, alignItems: "center" }}>
                    <Text style={{ textAlign: "center", color: colors.ink, fontFamily: "Poppins-SemiBold" }}>{group.name}</Text>
                    <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 6 }}>
                      {group.members.slice(0, 5).map((member) => (
                        <PersonAvatar
                          key={member.id}
                          name={member.name}
                          imageUrl={
                            options.data?.people.find(
                              (p) => p.name === member.name,
                            )?.avatarUrl
                          }
                        />
                      ))}
                      {group.members.length > 5 ? (
                        <Body>+{group.members.length - 5}</Body>
                      ) : null}
                    </View>
                    <PlanAction
                      title="View Group"
                      onPress={() => setEntity({ group })}
                    />
                    </View>
                  </LinearGradient>
                  </Pressable>
                ))}</AdaptiveGrid>
              ) : (
                <CloverEmptyState pose="circles">No groups yet.</CloverEmptyState>
              )}
            </>
          ) : tab === "People" ? (
            <>
              {options.data.people.length ? (
                <View>
                  <View style={{flexDirection:"row",gap:6,paddingVertical:8}}><Text style={{flex:1,color:colors.muted}}>Name</Text><Text style={{width:82,textAlign:"right",color:colors.muted}}>Owed</Text><Text style={{width:82,textAlign:"right",color:colors.muted}}>Owes</Text><View style={{width:36}}/></View>
                  {options.data.people.filter(p=>[p.name,p.displayName].some(n=>n?.toLowerCase().includes(search.toLowerCase()))).map(person=>(
                    <Pressable key={person.id} accessibilityRole="button" accessibilityLabel={`Open ${person.displayName || person.name} details`} onPress={()=>setEntity({person:person.name})}
                      style={{flexDirection:"row",alignItems:"center",gap:6,minHeight:58,borderBottomWidth:1,borderColor:colors.line}}>
                      <PersonAvatar name={person.name} imageUrl={person.avatarUrl}/>
                      <Text style={{flex:1,color:colors.ink}}>{person.displayName || person.name}</Text>
                      {person.fromContacts && <View accessible accessibilityLabel="From Contacts"><Icon name="person-circle-outline" line size={18}/></View>}
                      <Text style={{width:82,textAlign:"right",color:colors.ink}}>{balance.data?.personBalances?.[person.id]?.owed ?? "—"}</Text>
                      <Text style={{width:82,textAlign:"right",color:colors.ink}}>{balance.data?.personBalances?.[person.id]?.owes ?? "—"}</Text>
                      <Text style={{width:36,textAlign:"center",color:colors.teal}}>•••</Text>
                    </Pressable>
                  ))}</View>
              ) : (
                <CloverEmptyState pose="circles">No people saved yet.</CloverEmptyState>
              )}
            </>
          ) : (
            <>
              {options.data.profiles.length ? (
                options.data.profiles.filter(p=>`${p.label} ${p.provider}`.toLowerCase().includes(search.toLowerCase())).map((profile) => (
                  <Pressable key={profile.id} accessibilityRole="button" accessibilityLabel={`Open ${profile.label} payment details`} onPress={() => setPaymentDetail(profile)}>
                    <LinearGradient
                      colors={accountCardPalette({type:"bank",institution:profile.provider,brandPalette:profile.brandPalette}).colors}
                      style={{ padding: 16, gap: 6, borderRadius: 20, alignItems:"center" }}
                    >
                      {profile.qrImageData ? (
                        <Image source={{ uri: profile.qrThumbnail || profile.qrImageData }} accessibilityLabel={`${profile.label} QR code`}
                          style={{ width: 116, height: 116, maxWidth: "100%", alignSelf: "center", marginTop: 6 }} resizeMode="contain" />
                      ) : null}
                      <Text style={{ fontFamily: "Poppins-SemiBold", color: "white", fontSize: 16 }}>
                        {profile.label}{profile.isDefault ? " · Default" : ""}
                      </Text>
                      {paymentLines(profile).map(({ key, value }) => (
                        <Text key={key} style={{ color: "white" }}>{value}</Text>
                      ))}

                    </LinearGradient>
                  </Pressable>
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
