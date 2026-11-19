import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import { useUser } from "@clerk/expo";
import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { SplitItemGrid } from "./split-item-grid";
import {
  suggestBillCategory,
  type SplitItem,
} from "../../shared/split-bill-experience";
import type { Transaction } from "./types";
import type { SplitGroup } from "./split-group-details";
import type { BillItem } from "./bill-details";
import { AddEntryMethods } from "./add-entry-methods";
import { fileProblem, removeUploadCopy } from "./upload";
import { useSession } from "./session";
import { Body, Field, Notice, Screen } from "./ui";
import { PlanAction, PlanHeader, usePlanData } from "./plan-ui";
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
export function BillEditor({
  sourceTransaction,
  context,
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (bill: Bill) => void;
  sourceTransaction?: Transaction | null;
  context?: { group?: SplitGroup; person?: string; currency?: string };
}) {
  const session = useSession();
  const [entryMode, setEntryMode] = useState(
      sourceTransaction ? "manual" : "upload",
    ),
    [moreDetails, setMoreDetails] = useState(false),
    [accountId, setAccountId] = useState(""),
    [categoryId, setCategoryId] = useState(""),
    [groupPicker, setGroupPicker] = useState(false);
  const [attemptId] = useState(() => Crypto.randomUUID());
  const entryOptions = usePlanData("options", {
    accounts: [] as {
      id: string;
      name: string;
      currency: string;
      type: string;
    }[],
    categories: [] as { id: string; name: string }[],
  });
  const savedGroups = usePlanData("together-options", {
    groups: [] as SplitGroup[],
  });
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
  const [personName, setPersonName] = useState("");
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
      setEntryMode("manual");
      setMoreDetails(true);
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
      setReviewedItems(
        p.items.map((item) => ({
          description: item.description,
          amount: item.amount,
        })),
      );
      setTitle(p.merchantName ?? "");
      setTotal(p.total ?? "");
      setCurrency(p.currency);
      setDate(p.billDate?.slice(0, 10) || "");
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
  const [names, setNames] = useState(() =>
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
  const [payer, setPayer] = useState<number | null>(0);
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
    if (
      (receipt || reviewedItems.length > 0) &&
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
      setError(
        "Review each item and include extra charges so the items match the bill total.",
      );
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
                accountId: accountId || null,
                categoryId: categoryId || null,
              },
            }),
        ...(groupId ? { groupId } : {}),
        title: title.trim(),
        note,
        billDate: date,
        currency,
        total,
        participants,
        paidByIndex: payer,
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
  return (
    <Screen
      sheet
      onDismiss={() => {
        if (!busy) onClose();
      }}
    >
      <PlanHeader
        title="Add Split Bill"
        back={() => {
          if (!busy) onClose();
        }}
      />
      {error ? <Notice>{error}</Notice> : null}
        <AddEntryMethods
          key={entryMode}
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
            if (f.people !== undefined) {
              setNames(f.people);
              setPayer(0);
            }
          }}
          onUploadSource={source => void uploadReceipt(source)}
        >
          <Field
            label="Name"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
          <Field
            label="Amount"
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
          <Field
            label="Group"
            value={
              savedGroups.data?.groups.find((g) => g.id === groupId)?.name ||
              context?.group?.name ||
              ""
            }
            editable={false}
          />
          {!context?.group ? (
            <PlanAction
              title="Choose Group"
              onPress={() => setGroupPicker((v) => !v)}
            />
          ) : null}
          {!context?.group && groupPicker
            ? savedGroups.data?.groups.map((g) => (
                <PlanAction
                  key={g.id}
                  title={g.name}
                  onPress={() => {
                    setGroupId(g.id);
                    setNames(
                      Array.from(
                        new Set(
                          [
                            user?.fullName || "You",
                            ...g.members.map((m) => m.name),
                          ].filter(
                            (n, i) =>
                              i === 0 ||
                              (!/^(you|me)$/i.test(n) && n !== user?.fullName),
                          ),
                        ),
                      ).join("\n"),
                    );
                    setGroupPicker(false);
                  }}
                />
              ))
            : null}
          <Field
            label="People (one name per line)"
            value={names}
            onChangeText={(value) => {
              setNames(value);
              setPayer(0);
            }}
            multiline
          />
          <PlanAction
            title={moreDetails ? "Less Details" : "More Details"}
            onPress={() => setMoreDetails((v) => !v)}
          />
          {moreDetails ? (
            <>
              <Field
                label="Date (YYYY-MM-DD)"
                value={date}
                onChangeText={setDate}
              />
              <Body>Account · optional</Body>
              <PlanAction title="Cash" onPress={() => setAccountId("")} />
              {entryOptions.data?.accounts
                .filter(
                  (a) => a.currency === currency && a.type !== "investment",
                )
                .map((a) => (
                  <PlanAction
                    key={a.id}
                    title={`${a.name}${a.id === accountId ? " ✓" : ""}`}
                    onPress={() => setAccountId(a.id)}
                  />
                ))}
              <Body>Category · optional</Body>
              {entryOptions.data?.categories.map((c) => (
                <PlanAction
                  key={c.id}
                  title={`${c.name}${c.id === categoryId ? " ✓" : ""}`}
                  onPress={() => setCategoryId(c.id)}
                />
              ))}
              {receipt ? (
                <Body>
                  {receipt.fileName} · Check the extracted items and total
                  before saving.
                </Body>
              ) : null}
              <SplitItemGrid
                people={participants.map((p) => ({
                  id: p.name,
                  name: p.name,
                  avatarUrl:
                    /^(you|me)$/i.test(p.name) || p.name === user?.fullName
                      ? user?.imageUrl
                      : null,
                }))}
                currency={currency}
                onAddPerson={() => setAddingPerson(true)}
                items={reviewedItems.map((item, index) => ({
                  ...item,
                  id: item.id ?? `new-${index}`,
                  participantIds:
                    item.participantIds ?? participants.map((p) => p.name),
                }))}
                onChange={(next) => {
                  setReviewedItems(next);
                  setTotal(
                    next
                      .reduce(
                        (sum, item) => sum + (Number(item.amount) || 0),
                        0,
                      )
                      .toFixed(2),
                  );
                }}
              />
              {addingPerson ? (
                <View>
                  <Field
                    label="Person Name"
                    value={personName}
                    onChangeText={setPersonName}
                  />
                  <PlanAction
                    title="Add Person"
                    onPress={() => {
                      if (
                        personName.trim() &&
                        !participants.some(
                          (p) =>
                            p.name.toLowerCase() ===
                            personName.trim().toLowerCase(),
                        )
                      ) {
                        setNames((v) => v.trim() + "\n" + personName.trim());
                        setPersonName("");
                        setAddingPerson(false);
                      }
                    }}
                  />
                </View>
              ) : null}
              {suggestBillCategory(
                title,
                reviewedItems.map((item) => item.description),
              ) ? (
                <Body>
                  Suggested category:{" "}
                  {
                    suggestBillCategory(
                      title,
                      reviewedItems.map((item) => item.description),
                    )?.name
                  }
                </Body>
              ) : null}
              {sourceTransaction ? (
                <>
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
                </>
              ) : (
                <Body>You paid · split equally.</Body>
              )}
              <Field
                label="Note"
                value={note}
                onChangeText={setNote}
                maxLength={1000}
              />
            </>
          ) : null}
          <PlanAction title="Cancel" disabled={busy} onPress={onClose} />
          <PlanAction
            title={busy ? "Creating…" : "Create bill"}
            tone="primary"
            disabled={busy}
            onPress={() => void save()}
          />
        </AddEntryMethods>
    </Screen>
  );
}
