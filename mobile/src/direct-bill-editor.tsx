import { mergePeople, PeopleSuggestions, type SavedPerson } from "./split-people-field";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import { useUser } from "@clerk/expo";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, View, TextInput, Pressable, type ScrollViewInstance } from "react-native";
import { SplitItemGrid } from "./split-item-grid";
import {
  suggestBillCategory,
  type SplitItem,
} from "../../shared/split-bill-experience";
import type { Transaction } from "./types";
import type { SplitGroup } from "./split-group-details";
import type { BillItem } from "./bill-details";
import { AddEntryMethods } from "./add-entry-methods";

import { removeUploadCopy } from "./upload";
import { uploadSelectedFile } from "./upload-selected-file";
import { EntryOverlay } from "./entry-overlay";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "./session";
import { Body, Field, Notice, Screen, Icon, CategoryMark, useTheme } from "./ui";
import { PlanAction, PlanHeader, usePlanData } from "./plan-ui";
import { Text } from "./app-text";
import { AccountTypeMark } from "./account-type-mark";
import { ChoiceField } from "./transaction-entry";

import { currencyMark } from "../../shared/currency-mark";

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
const emptyEntryOptions = {
  accounts: [] as {id: string; name: string; currency: string; type: string}[],
  categories: [] as {id: string; name: string}[],
};
const emptyGroupOptions = {circlePeople: [] as SavedPerson[], groups: [] as SplitGroup[], people: [] as SavedPerson[]};

type BillEntryProps = {
  onClose: () => void;
  onSaved: (bill: Bill) => void;
  sourceTransaction?: Transaction | null;
  initialMethod?: "manual" | "upload";
  context?: { circleId?: string; group?: SplitGroup; person?: string; currency?: string };
};

const OpenBillEditor = createContext<((props: BillEntryProps) => void) | null>(null);

export function BillEntryProvider({ children }: {children: ReactNode}) {
  const [entries, setEntries] = useState<{id: number; props: BillEntryProps}[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const sequence = useRef(0);
  function open(props: BillEntryProps) {
    const id = ++sequence.current;
    setEntries(previous => [...previous, {id, props}]);
    setActive(id);
    props.onClose();
  }
  function close(id: number) {
    setEntries(previous => previous.filter(entry => entry.id !== id));
    setActive(previous => previous === id ? null : previous);
  }
  return <OpenBillEditor.Provider value={open}>{children}
    {entries.map(({id, props}, index) => <HostedBillEditor key={id} {...props} visible={active === id}
      offset={index * 54} setVisible={value => setActive(previous => value ? id : previous === id ? null : previous)}
      onClose={() => close(id)} onSaved={bill => { close(id); props.onSaved(bill); }} />)}
  </OpenBillEditor.Provider>;
}

export function BillEditor(props: BillEntryProps) {
  const open = useContext(OpenBillEditor);
  const launched = useRef(false);
  useEffect(() => {
    if (open && !launched.current) { launched.current = true; open(props); }
  }, [open, props]);
  return null;
}

export function HostedBillEditor({ sourceTransaction, context, initialMethod, onClose, onSaved, visible, setVisible, offset = 0 }: BillEntryProps & {
  visible: boolean; offset?: number; setVisible: (value: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance|null>(null);
  const scrollOffset = useRef(0);
  const [errorSection,setErrorSection] = useState<"fields"|"amount"|"currency"|"date"|"people"|"items"|"payment">("fields");
  const anchors = useRef<Partial<Record<typeof errorSection, React.ComponentRef<typeof View> | null>>>({});
  const scrollToIssue = () => {
    const target=anchors.current[errorSection];
    const scroll=scrollRef.current;
    if (target && scroll) {
      target.measureInWindow((_x,y)=>scroll.measureInWindow((_sx,sy)=>scroll.scrollTo({y:Math.max(0,scrollOffset.current+y-sy-12),animated:true})));
    } else scroll?.scrollTo({y:0,animated:true});
  };
  const scopedSave = useRef(false);
  const [uploaded, setUploaded] = useState(0);
  const session = useSession();
  const [linkExpense, setLinkExpense] = useState(false);
  const circleId = context?.circleId;
  const circleMembers = context?.group?.members ?? [];
  const recorder = context?.group?.recorderName;
  const { colors } = useTheme();
  const [entryMode, setEntryMode] = useState(
      initialMethod ?? "manual",
    ),
    [moreDetails, setMoreDetails] = useState(false),
    [accountId, setAccountId] = useState(""),
    [categoryId, setCategoryId] = useState("");
  const [attemptId] = useState(() => Crypto.randomUUID());
  const entryOptions = usePlanData("options", emptyEntryOptions);
  const savedGroups = usePlanData("together-options", emptyGroupOptions);
  const [groupId, setGroupId] = useState(context?.group?.id || "");
  const [title, setTitle] = useState(
    sourceTransaction?.merchantClean || sourceTransaction?.merchantRaw || "",
  );
  const [total, setTotal] = useState(sourceTransaction?.amount || "");
  const [currency, setCurrency] = useState(
    sourceTransaction?.currency || context?.currency || "PHP",
  );
  const [date, setDate] = useState(
    sourceTransaction?.date.slice(0, 10) ||
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }),
  );
  const { user } = useUser();
  const [addingPerson, setAddingPerson] = useState(false);
  const [pickerAtItems, setPickerAtItems] = useState(false);
  const [personName, setPersonName] = useState("");
  const peopleInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const linePeopleInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [reviewedItems, setReviewedItems] = useState<
    (Omit<SplitItem, "participantIds"> & { participantIds?: string[] })[]
  >(() => {
    const items = (sourceTransaction?.receiptLineItems ?? [])
      .filter((i) => i.amount && Number(i.amount) > 0)
      .map((i, index) => ({
        id: `receipt-${index}`,
        description: i.description,
        amount: i.amount!,
      }));
    const difference =
      Math.round(
        (Number(sourceTransaction?.amount ?? 0) -
          items.reduce((sum, i) => sum + Number(i.amount), 0)) *
          100,
      ) / 100;
    if (items.length && difference > 0)
      items.push({
        id: "receipt-charges",
        description: "Other Charges",
        amount: difference.toFixed(2),
      });
    return items;
  });
  const [receipt, setReceipt] = useState<{
    fileName: string;
    mimeType: string;
    storageKey: string;
    needsReview?: boolean;
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
  const uploadReceipt = async (source: "file" | "camera" | "library" = "file") => {
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
      let file: { uri: string; name: string; mimeType?: string; size?: number };
      if (source === "camera" || source === "library") {
        if (source === "camera" && !(await ImagePicker.requestCameraPermissionsAsync()).granted)
          throw Error(
            "Allow camera access to take a photo, or add the bill manually.",
          );
        const photo = source === "camera"
          ? await ImagePicker.launchCameraAsync({ quality: 0.85 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
        if (photo.canceled || !alive.current) return;
        const image = photo.assets[0];
        file = {
          uri: image.uri,
          name: image.fileName || "receipt.jpg",
          mimeType: image.mimeType || "image/jpeg",
          size: image.fileSize,
        };
      } else {
        const picked = await DocumentPicker.getDocumentAsync({
          type: ["application/pdf", "image/*"],
          copyToCacheDirectory: true,
        });
        if (picked.canceled || !alive.current) return;
        file = picked.assets[0];
      }
      copiedUri = file.uri;

      if (!alive.current) return;
      setUploaded(0);
      setReading(true);
      setVisible(false);
      if (!alive.current) return;
      const result = await uploadSelectedFile<{
        reliableForScopedSplit?: boolean;
        receiptStorageKey: string;
        preview: {
          requiresReview?: boolean;
          merchantName: string | null;
          billDate: string | null;
          currency: string;
          total: string | null;
          serviceCharge?: string | null;
          receiptText: string;
          confidence: number;
          currencyWarning?: string | null;
          items: { description: string; amount: string }[];
        };
      }>(
        `split-bill-receipts/preview?workspaceId=${encodeURIComponent(session.profileId)}`,
        session.request, file, setUploaded,
      );
      if (!alive.current) return;
      const p = result.preview;
      setEntryMode("manual");
      setReviewVersion(v => v + 1);
      setMoreDetails(true);
      setReceipt({
        fileName: file.name,
        mimeType: file.mimeType ?? "application/octet-stream",
        storageKey: result.receiptStorageKey,
        text: p.receiptText,
        confidence: p.confidence,
        needsReview:Boolean(p.requiresReview || !p.billDate || p.currencyWarning),
        items: p.items.map((i) => ({
          description: i.description,
          amount: i.amount,
        })),
      });
      const items = p.items.filter(item => item.description && Number(item.amount) > 0).map(({description,amount}) => ({description,amount}));
      const sum = items.reduce((n,item) => n + Math.round(Number(item.amount)*100),0);
      const service = Math.round(Number(p.serviceCharge)*100);
      if (service > 0 && sum + service === Math.round(Number(p.total)*100)) items.push({description:"Service Charge",amount:(service/100).toFixed(2)});
      const reconciled = items.reduce((n, item) => n + Math.round(Number(item.amount) * 100), 0) === Math.round(Number(p.total) * 100);
      const conflictingCurrencies = /mixed currencies|multiple currencies/i.test(p.currencyWarning ?? "");
      setReviewedItems(reconciled && !conflictingCurrencies ? items : []);

      setTitle(p.merchantName || "Receipt");
      setTotal(conflictingCurrencies ? "" : p.total ?? "");
      if (/^[A-Z]{3}$/.test(p.currency)) setCurrency(p.currency);
      if (p.billDate) setDate(p.billDate.slice(0,10));
      scopedSave.current = (!context?.group && !context?.person && !circleId) ||
        Boolean(result.reliableForScopedSplit && !p.currencyWarning);
      if (p.currencyWarning) setError(p.currencyWarning);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Receipt upload failed.");
    } finally {
      if (copiedUri) removeUploadCopy(copiedUri);
      inFlight.current = false;
      if (alive.current) { setReading(false); setBusy(false); }
    }
  };
  const [names, setNames] = useState(() => circleId ? circleMembers.map(m => m.name).join("\n") :
    Array.from(
      new Set(
        [
          user?.fullName || "You",
          ...(context?.person
            ? [context.person]
            : context?.group?.members.map((m) => m.name) || []),
        ].filter(
          (n, i) => i === 0 || (!/^(you|me)$/i.test(n) && n !== user?.fullName),
        ),
      ),
    ).join("\n"),
  );
  const [payer, setPayer] = useState<number | null>(() => {if (!circleId) return 0; const i = circleMembers.findIndex(m => m.name === recorder); return i < 0 ? null : i;});
  const [multiplePayers, setMultiplePayers] = useState(false);
  const [paidAmounts, setPaidAmounts] = useState<Record<string,string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [reviewVersion, setReviewVersion] = useState(0);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const participants = names
    .split("\n")
    .map((name) => ({ name: name.trim() }))
    .filter((p) => p.name);
  const options = savedGroups.data ?? emptyGroupOptions;
  const suggestedPeople = mergePeople([], [...(options.people ?? []), ...(options.circlePeople ?? []), ...(options.groups ?? []).flatMap(group => group.members)].map(person => person.name), []).map(name => ({name}));
  function addNames(values: string[]) {
    setNames(current => mergePeople(current.split("\n"), values, suggestedPeople).join("\n"));
  }
  const availableMembers = circleMembers.filter(m => !participants.some(p => p.name === m.name));
  const memberPicker = <ChoiceField label="Add Circle Member" initiallyOpen value="" options={availableMembers.map(m => ({value:m.name,label:m.name}))}
    onChange={name => {addNames([name]);setAddingPerson(false);}}/>;
  const nameInput = (autoFocus = false) => (
    <>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <TextInput ref={autoFocus ? linePeopleInput : peopleInput} autoFocus={autoFocus} accessibilityLabel="Person Name" placeholder="Person Name" placeholderTextColor={colors.muted}
        style={{ flex: 1, minHeight: 44, color: colors.ink, borderBottomWidth: 1, borderColor: colors.line }}
        value={personName} returnKeyType="done" onChangeText={text => {
          const parts = text.split(/[,\n]/);
          setPersonName(parts.pop() ?? "");
          if (parts.length) addNames(parts);
        }} submitBehavior="submit" onSubmitEditing={event => { addNames([event.nativeEvent.text]); setPersonName(""); setAddingPerson(false); }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Add Person" onPress={() => {
        if (!personName.trim()) { (autoFocus ? linePeopleInput : peopleInput).current?.focus(); return; }
        addNames([personName]); setPersonName(""); setAddingPerson(false);
      }} style={{ padding: 10 }}><Text style={{ fontSize: 22, color: colors.teal }}>+</Text></Pressable>
    </View>
    <PeopleSuggestions draft={personName} selected={participants.map(p => p.name)} saved={suggestedPeople}
      choose={name => {addNames([name]); setPersonName(""); setAddingPerson(false);}}/>
    </>
  );
  const standalone = !circleId && !sourceTransaction && !linkExpense;
  const suggestedCategory = suggestBillCategory(title, reviewedItems.map(item => item.description))?.name;
  const inferredCategoryId = entryOptions.data?.categories.find(c => c.name === suggestedCategory)?.id;
  const save = async () => {
    if (inFlight.current) return;
    setErrorSection("fields");
    if (personName.trim()) { setErrorSection("people"); setError("Tap + to add the name before creating the bill."); return; }
    const parsedDate = new Date(`${date}T00:00:00Z`);
    const issue = !title.trim() ? ["fields","Enter a bill name."] as const
      : (!(standalone && !total) && (!/^\d+(\.\d{1,2})?$/.test(total) || Number(total) <= 0)) ? ["amount",standalone ? "Enter a positive amount or leave it blank." : "Enter a positive amount."] as const
      : !/^[A-Z]{3}$/.test(currency) ? ["currency","Enter a three-letter currency code."] as const
      : participants.length < (circleId || standalone ? 1 : 2) || new Set(participants.map(p => p.name.toLowerCase())).size !== participants.length ? ["people","Choose distinct people for the split."] as const
      : !Number.isFinite(+parsedDate) || parsedDate.toISOString().slice(0,10) !== date ? ["date","Enter a valid date in YYYY-MM-DD format."] as const
      : null;
    if (issue) {
      setErrorSection(issue[0]);
      if (issue[0] === "date") setMoreDetails(true);
      setError(issue[1]);
      return;
    }
    if (
      ((!standalone && receipt) || reviewedItems.length > 0) &&
      (!reviewedItems.length ||
        reviewedItems.some(
          (item) =>
            !item.description.trim() ||
            !/^\d+(\.\d{1,2})?$/.test(item.amount) ||
            Number(item.amount) <= 0,
        ) ||
        reviewedItems.reduce(
          (sum, item) => sum + Math.round(Number(item.amount) * 100),
          0,
        ) !== Math.round(Number(total) * 100))
    ) {
      setMoreDetails(true); setErrorSection("items");
      setError(
        "Review each item and include extra charges so the items match the bill total.",
      );
      return;
    }
    const contributions = participants.flatMap((person, participantIndex) => {
      const amount = paidAmounts[person.name]?.trim();
      return amount && Number(amount) !== 0 ? [{participantIndex, amount}] : [];
    });
    if (multiplePayers && (contributions.some(row => !/^\d+(\.\d{1,2})?$/.test(row.amount)) ||
      contributions.reduce((sum,row) => sum + Math.round(Number(row.amount) * 100), 0) !== Math.round(Number(total) * 100))) {
      setMoreDetails(true); setErrorSection("payment");
      setError("Enter each contribution so the amounts add up to the bill total.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...(sourceTransaction
          ? { transactionId: sourceTransaction.id }
          : {
              expense: {
                workspaceId: session.profileId,
                attemptId,
                ...(standalone ? {splitOnly:true} : {}),
                accountId: accountId || null,
                categoryId: categoryId || inferredCategoryId || null,
              },
            }),
        ...(circleId ? {circleId} : {}),
        ...(groupId ? { groupId } : {}),
        title: title.trim(),
        note,
        billDate: date,
        currency,
        total,
        participants,
        paidByIndex: multiplePayers || !total ? null : payer,
        ...(multiplePayers ? {contributions} : {}),
        ...(receipt ? { receipt } : {}),
        ...(reviewedItems.length
          ? {
              reviewedItems: reviewedItems.map((item) => ({
                description: item.description,
                amount: item.amount,
                participantIndexes: (
                  item.participantIds ?? participants.map((p) => p.name)
                )
                  .map((name) => participants.findIndex((p) => p.name === name))
                  .filter((i) => i >= 0),
                splitMethod: item.splitMethod ?? "equal",
                allocations: (item.allocations ?? []).map((a) => ({
                  participantIndex: participants.findIndex(
                    (p) => p.name === a.participantId,
                  ),
                  value: a.value,
                })),
              })),
            }
          : {}),
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
  useEffect(() => {
    if (scopedSave.current && receipt && !reading && !busy) {
      scopedSave.current = false;
      void save();
    }
  }, [receipt, reading, busy]);
  if (!visible) return <View style={{ position: "absolute", left: 12, right: 12, bottom: insets.bottom + 74 + offset, zIndex: 100 }}>
    <Pressable accessibilityRole="button" onPress={() => setVisible(true)} style={{ backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 }}>
      <Text style={{ color: error ? "#a31d35" : colors.ink }}>{reading ? (uploaded < 1 ? "Uploading receipt…" : "Preparing receipt draft…") : busy ? "Saving bill…" : error ? "Receipt needs attention ›" : "Review receipt draft ›"}</Text>
      {reading && <View accessibilityRole="progressbar" accessibilityValue={{min:0,max:100,now:Math.round(uploaded*100)}} style={{ height:4,backgroundColor:colors.line }}>
        <View style={{height:4,width:`${Math.round(uploaded*100)}%`,backgroundColor:colors.teal}}/>
      </View>}
    </Pressable>
  </View>;
  return (
    <EntryOverlay onClose={() => reading ? setVisible(false) : !busy && onClose()}>
    <Screen
      sheet scrollController={{ref:scrollRef,offset:scrollOffset}}
      onDismiss={() => {
        if (reading) setVisible(false); else if (!busy) onClose();
      }}
    >
      <PlanHeader
        title={circleId ? "Add Expense" : "Add Split Bill"}
        back={() => {
          if (reading) setVisible(false); else if (!busy) onClose();
        }}
      />



        <AddEntryMethods
          key={reviewVersion}
          initialMethod={entryMode === "manual" ? "manual" : "upload"}
          kind="split"
          disabled={busy}
          context={{
            kind: "split",
            fields: { title, amount: total, currency, date, people: names },
          }}
          onReviewForm={({ fields: f }) => {
            if (f.title !== undefined) setTitle(f.title);
            if (f.amount !== undefined) setTotal(f.amount);
            if (f.currency !== undefined) setCurrency(f.currency);
            if (f.date !== undefined) setDate(f.date);
            if (!circleId && f.people !== undefined) {
              setNames(mergePeople([user?.fullName || "You"], f.people.split(/[,\n]/), suggestedPeople).join("\n"));
              setMultiplePayers(false);
              setPayer(0);
            }
          }}
          onUploadSource={source => void uploadReceipt(source)}
        >
          <View collapsable={false} ref={v=>{anchors.current.fields=v;}}/>
          <Field
            label="Name"
            placeholder="Name"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
          <View collapsable={false} ref={v=>{anchors.current.amount=v;}}/>
          <Field
            label="Amount"
            placeholder="0.00"
            value={total}
            onChangeText={setTotal}
            keyboardType="decimal-pad"
          />
          <View collapsable={false} ref={v=>{anchors.current.currency=v;}}/>
          <Field label="Currency" leading={<Text>{currencyMark(currency)}</Text>} value={currency}
            onChangeText={v => { setCurrency(v.toUpperCase()); setAccountId(""); }} maxLength={3} />
          <View collapsable={false} ref={v=>{anchors.current.people=v;}}/>
          <View style={{ borderWidth: 1, borderRadius: 16, borderColor: colors.line, padding: 12, gap: 8 }}>
            <Body muted={false}>{circleId ? "People" : "People or Group"}</Body>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {!circleId && (context?.group || groupId) && <Body>{context?.group?.name ?? savedGroups.data?.groups.find(g => g.id === groupId)?.name}</Body>}
              {participants.map(({name}, index) => (
                <Pressable key={name} disabled={!circleId && index === 0} accessibilityLabel={circleId || index ? `Remove ${name}` : name}
                  onPress={() => {
                    setNames(participants.filter(p => p.name !== name).map(p => p.name).join("\n"));
                    setPayer(old => old === null ? null : old === index ? (circleId ? null : 0) : old > index ? old - 1 : old);
                    setReviewedItems(rows => rows.map(row => ({...row, participantIds: row.participantIds?.filter(id => id !== name), allocations: row.allocations?.filter(a => a.participantId !== name)})));
                  }} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: ["#cff4ed","#dbeafb","#f5e2f1"][index % 3] }}>
                  <Text style={{color:"#17373c"}}>{name}{circleId || index ? " ×" : ""}</Text>
                </Pressable>
              ))}
            </View>
            {circleId ? <>
              <PlanAction title="+" disabled={!availableMembers.length} onPress={() => {setPickerAtItems(false);setAddingPerson(v => !v || pickerAtItems);}}/>
              {addingPerson && !pickerAtItems && availableMembers.length > 0 && memberPicker}
            </> : nameInput()}
            {!context?.group && (options.groups?.length ?? 0) > 0 && <ChoiceField label="Group" value={groupId}
              options={[{value:"",label:"No Group"}, ...options.groups.map((group,index) => ({
                value:group.id, label:group.name, icon:<View style={{width:16,height:16,borderRadius:8,backgroundColor:["#00abb6","#9b77bd","#ea936e","#61b497"][index % 4]}}/>,
              }))]} onChange={id => {
                setGroupId(id);
                const group = options.groups.find(g => g.id === id);
                if (group) addNames(group.members.map(m => m.name).filter(name => !/^(you|me)$/i.test(name)));
              }}/>}
          </View>
          <Pressable accessibilityLabel="More Details" accessibilityRole="button" accessibilityState={{expanded:moreDetails}} onPress={() => setMoreDetails(v => !v)}
            style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",minHeight:44}}>
            <Body>More Details</Body><Icon line name={moreDetails ? "chevron-up" : "chevron-down"} size={18}/>
          </Pressable>
          {moreDetails ? (
            <>
              <View collapsable={false} ref={v=>{anchors.current.items=v;}}/>
              <SplitItemGrid flat wholeItem={circleId ? {description:title, amount:total} : undefined} equalLabel={circleId ? "Equal" : "Equally"}
                people={participants.map((p) => ({
                  id: p.name,
                  name: p.name,
                  avatarUrl:
                    /^(you|me)$/i.test(p.name) || p.name === user?.fullName
                      ? user?.imageUrl
                      : null,
                }))}
                currency={currency}
                onAddPerson={circleId && !availableMembers.length ? undefined : () => {setPickerAtItems(true);setAddingPerson(true);}}
                items={reviewedItems.map((item, index) => ({
                  ...item,
                  id: item.id ?? `new-${index}`,
                  participantIds:
                    item.participantIds ?? participants.map((p) => p.name),
                }))}
                onChange={(next) => {
                  setReviewedItems(next);
                  if (!receipt?.storageKey) setTotal(
                    next
                      .reduce(
                        (sum, item) => sum + (Number(item.amount) || 0),
                        0,
                      )
                      .toFixed(2),
                  );
                }}
              />
              {addingPerson && (circleId ? pickerAtItems && availableMembers.length > 0 && memberPicker : nameInput(true))}
              <View collapsable={false} ref={v=>{anchors.current.date=v;}}/>
              <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
              {receipt ? <Body>{receipt.fileName}</Body> : null}
              <View collapsable={false} ref={v=>{anchors.current.payment=v;}}/>
              {circleId ? <ChoiceField label="Paid By" value={payer === null ? "" : participants[payer]?.name ?? ""} options={[{value:"",label:"Not Paid Yet"}, ...participants.map(p => ({value:p.name,label:p.name}))]}
                onChange={name => setPayer(name ? participants.findIndex(p => p.name === name) : null)}/> : <>
                <ChoiceField label="Paid By" value={multiplePayers ? "multiple" : payer === null ? "" : String(payer)}
                  options={[...participants.map((person,index) => ({value:String(index),label:person.name})), {value:"multiple",label:"Multiple People"}, ...(sourceTransaction ? [{value:"",label:"Not Paid Yet"}] : [])]}
                  onChange={value => {
                    setMultiplePayers(value === "multiple");
                    if (value !== "multiple") setPayer(value === "" ? null : Number(value));
                  }}/>
                {multiplePayers && participants.map(person => <View key={person.name} style={{flexDirection:"row",alignItems:"center",gap:12}}>
                  <Text style={{flex:1,color:colors.ink}}>{person.name}</Text>
                  <View style={{flex:1}}><Field accessibilityLabel={`Contribution from ${person.name} in ${currency}`} placeholder="0.00" keyboardType="decimal-pad"
                    value={paidAmounts[person.name] ?? ""} onChangeText={value => setPaidAmounts(old => ({...old,[person.name]:value}))}/></View>
                </View>)}
              </>}
              <Field
                label="Note (Optional)"
                value={note}
                onChangeText={setNote}
                maxLength={1000}
              />
              {!circleId && !sourceTransaction && <Pressable accessibilityRole="checkbox" accessibilityState={{checked:linkExpense}} onPress={()=>setLinkExpense(!linkExpense)}><Text style={{color:colors.ink}}>{linkExpense ? "☑" : "☐"} Add to Transactions</Text></Pressable>}
              <ChoiceField label="Account (Optional)" value={accountId} onChange={setAccountId}
                options={[{ value: "", label: "Cash", icon: <AccountTypeMark type="cash" size={24} /> },
                  ...(entryOptions.data?.accounts ?? []).filter(a => a.currency === currency && a.type !== "investment" && !(a.name === "Cash" && a.type === "cash")).map(a => ({value:a.id, label:a.name, icon:<AccountTypeMark type={a.type} size={24} />}))]} />
              <ChoiceField label="Category (Optional)" value={categoryId} onChange={setCategoryId}
                options={[{ value:"", label:suggestedCategory || "Other", icon:<CategoryMark name={suggestedCategory || "Other"} size={24} /> },
                  ...(entryOptions.data?.categories ?? []).filter(c => c.name !== (suggestedCategory || "Other")).map(c => ({value:c.id,label:c.name,icon:<CategoryMark name={c.name} size={24} />}))]} />
            </>
          ) : null}
          <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"center"}}>
          <PlanAction title="Cancel" disabled={busy} onPress={onClose} />
          <PlanAction
            title={circleId ? (busy ? "Saving…" : "Save Expense") : busy ? "Creating…" : "Create Bill"}
            tone="primary"
            disabled={busy}
            onPress={() => void save()}
          />
          </View>
        </AddEntryMethods>
    </Screen>
    {!!error && <Pressable accessibilityRole="button" accessibilityLiveRegion="assertive" onPress={scrollToIssue}
      style={{position:"absolute",left:12,right:12,bottom:Math.max(insets.bottom,12),padding:12,backgroundColor:"#a31d35",borderRadius:10}}>
      <Text style={{color:"white"}}>{error} ›</Text>
    </Pressable>}
    </EntryOverlay>
  );
}
