import { MissingContactDetails } from "./add-split-person";
import { Linking } from "react-native";
import { type SavedPerson } from "./split-people-field";
import { GroupCover } from "./group-cover";
import { coverNames, geometricCover, resolvedGroupCover } from "../../shared/split-group-cover";
import { displayPhoto } from "./prepare-display-photo";
import { removeUploadCopy } from "./upload";
import * as ImagePicker from "expo-image-picker";
import { TogetherToolbar } from "./together-toolbar";
import { BillEditor } from "./direct-bill-editor";
import { EntryOverlay } from "./entry-overlay";
import { onContextBillEntry } from "./bill-entry-events";
import { SwipeDeleteRow } from "./swipe-delete-row";
import { Text } from "./app-text";
import { PersonAvatar } from "./person-avatar";
import { useEffect, useState } from "react";
import { View, Pressable, TextInput } from "react-native";
import { useSession } from "./session";
import { Body, Card, Field, Notice, Screen, money, useTheme } from "./ui";
import { PlanAction, PlanHeader, PlanTabs, usePlanData } from "./plan-ui";

import { DebtList, SimplifyAction, ledgerSample } from "./simplified-debts";
import {
  remainingDebts,
  participantName,
  personKey,
} from "../../shared/split-debts";
import { splitItemTotals } from "../../shared/split-bill-experience";
export type SplitGroup = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  recorderName?: string;
  canEdit?: boolean;
  members: { id: string; name: string; previousNames?: string[] }[];
};

export function SplitGroupDetails({
  group,
  savedPeople = [],
  entryScope = "split",
  circleId,
  circleCurrency,
  person,
  onClose,
  onBill,
  onChanged,
}: {
  group?: SplitGroup;
  circleId?: string;
  circleCurrency?: string;
  savedPeople?: SavedPerson[];
  entryScope?: "split" | "circles";
  person?: string;
  onClose: () => void;
  onBill: (id: string) => void;
  onChanged: () => void;
}) {
  const session = useSession();
  const { colors } = useTheme();
  const [adding, setAdding] = useState(false),
    [search, setSearch] = useState("");
  useEffect(
    () => onContextBillEntry(() => setAdding(true), entryScope),
    [entryScope],
  );

  const [tab, setTab] = useState("Bills");
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);
  const [name, setName] = useState(group?.name ?? "");
  const [members, setMembers] = useState(
    group?.members.map((m) => m.name) ?? [],
  );
  const [roster, setRoster] = useState(group?.members ?? []);
  const [memberDraft, setMemberDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const {
    data,
    setData,
    error: loadError,
    reload,
  } = usePlanData(
    `split-bills?view=ledger${group ? `&groupId=${encodeURIComponent(group.id)}` : ""}`,
    ledgerSample,
  );
  const bills = (data?.bills ?? []).map((b) =>
    group ? { ...b, group: { ...group, name, members: roster } } : b,
  );
  const debts = remainingDebts(bills);
  const viewer = personKey(
    participantName({ group: { members: roster } }, data?.viewerName ?? ""),
  );
  const editable = !!group && group.canEdit !== false && !session.demo;
  const [coverOverride, setCoverOverride] = useState<string | null | undefined>();
  const cover = coverOverride === undefined ? group?.avatarUrl : coverOverride;
  async function changeCover(source: number | "photo" | null) {
    if (!editable || !group || busy) return;
    setBusy(true);
    setError("");
    try {
      let avatarUrl: string | null = null;
      if (source === "photo") {
        const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
        if (picked.canceled) return;
        const asset = picked.assets[0];
        try { avatarUrl = await displayPhoto(asset, 960, 200_000); } finally { removeUploadCopy(asset.uri); }
      } else if (source !== null) avatarUrl = geometricCover(source);
      await session.request(`split-bill-groups/${group.id}?workspaceId=${encodeURIComponent(session.profileId)}`, {
        method: "PATCH", body: JSON.stringify({ avatarUrl }),
      });
      setCoverOverride(avatarUrl);
      onChanged();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to update cover."); }
    finally { setBusy(false); }
  }
  async function persist(nextName: string, nextMembers: string[]) {
    if (!group || busy || !editable) return;
    const title = nextName.trim(),
      names = nextMembers.map((n) => n.trim());
    if (
      !title ||
      names.some((n) => !n) ||
      new Set(names.map(personKey)).size !== names.length
    ) {
      setError("Enter a group name and distinct names for each person.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await session.request<{ group: SplitGroup }>(
        `split-bill-groups/${group.id}?workspaceId=${encodeURIComponent(session.profileId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: title,
            members: names.map((name, index) => ({
              name,
              id:
                roster.find((m) => personKey(m.name) === personKey(name))?.id ??
                (names.length === roster.length
                  ? roster[index]?.id
                  : undefined),
            })),
          }),
        },
      );
      setRoster(result.group.members);
      setMembers(names);
      setName(title);
      setAddingPerson(false);
      setMemberDraft("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save group.");
    } finally {
      setBusy(false);
    }
  }
  function bilateral(member: string) {
    const key = personKey(member);
    return debts.filter(
      (d) =>
        (personKey(d.from) === key && personKey(d.to) === viewer) ||
        (personKey(d.to) === key && personKey(d.from) === viewer),
    );
  }
  function amountLabel(member: string, incoming: boolean) {
    const totals = new Map<string, number>();
    for (const d of bilateral(member))
      if (personKey(incoming ? d.to : d.from) === viewer)
        totals.set(d.currency, (totals.get(d.currency) ?? 0) + d.cents);
    return (
      [...totals]
        .map(([currency, cents]) => money(String(cents / 100), currency))
        .join("\n") || "—"
    );
  }
  const detail = selectedPerson ?? person;
  if (detail) {
    const key = personKey(detail);
    const contact = savedPeople.find(p => personKey(p.name) === key);
    const related = bills.filter((b) =>
      b.participants?.some(
        (p) => personKey(participantName(b, p.name)) === key,
      ),
    );
    return (
      <Screen>
        <PlanHeader
          title={detail}
          back={selectedPerson ? () => setSelectedPerson(null) : onClose}
          add={() => setAdding(true)}
        />
        {contact?.email && <PlanAction title={contact.email} onPress={()=>{void Linking.openURL(`mailto:${contact.email}`).catch(()=>setError("Unable to open email."));}}/>}
        {contact?.phone && <PlanAction title={contact.phone} onPress={()=>{void Linking.openURL(`sms:${contact.phone}`).catch(()=>setError("Unable to open messages."));}}/>}
        {contact && <MissingContactDetails key={key} person={{name:contact.name,email:contact.email ?? undefined,phone:contact.phone ?? undefined}} onSaved={onChanged}/> }
        {adding ? (
          <BillEditor
              context={{
                group,
                person: detail,
                circleId,
                currency: circleCurrency,
              }}
              onClose={() => setAdding(false)}
              onSaved={() => {
                setAdding(false);
                reload();
                onChanged();
              }}
            />
        ) : null}
        {loadError ? <Notice>{loadError}</Notice> : null}
        {data ? (
          <>
            <DebtList bills={bills} person={detail} />
            {related.map((bill) => {
              const participants = bill.participants ?? [];
              const person = participants.find(
                (p) => personKey(participantName(bill, p.name)) === key,
              );
              return (
                <Card key={bill.id}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onBill(bill.id)}
                  >
                    <Body muted={false}>{bill.title} ›</Body>
                    <Body>{bill.billDate.slice(0, 10)}</Body>
                  </Pressable>
                  {remainingDebts([bill])
                    .filter(
                      (d) =>
                        [d.from, d.to].some((n) => personKey(n) === key) &&
                        [d.from, d.to].some((n) => personKey(n) === viewer),
                    )
                    .map((d) => (
                      <Body key={d.from + d.to}>
                        {d.from} owes {d.to}{" "}
                        {money(String(d.cents / 100), d.currency)}
                      </Body>
                    ))}
                  {(bill.items ?? [])
                    .filter(
                      (i) => person && i.participantIds.includes(person.id),
                    )
                    .map((i) => (
                      <Body key={i.id}>
                        {i.description} · {detail}’s share{" "}
                        {money(
                          String(
                            splitItemTotals(participants, [i])[person!.id],
                          ),
                          bill.currency,
                        )}
                      </Body>
                    ))}
                </Card>
              );
            })}
            {!related.length ? <Notice>No shared bills yet.</Notice> : null}
          </>
        ) : null}
      </Screen>
    );
  }
  return (
    <Screen>
      {adding ? (
        <BillEditor
            context={{
              group: group
                ? {
                    ...group,
                    name,
                    members: roster,
                  }
                : undefined,
              person,
              circleId,
              currency: circleCurrency,
            }}
            onClose={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              reload();
              onChanged();
            }}
          />
      ) : null}
      <PlanHeader
        title={name || "Group"}
        back={onClose}
        add={() => setAdding(true)}
      />
      {group ? (
        <PlanTabs items={["Bills", "People"]} value={tab} onChange={setTab} />
      ) : null}
      {tab === "Bills" ? (
        <TogetherToolbar
          action={circleId ? "Add Expense" : "Add Bill"}
          search={search}
          onSearch={setSearch}
          onAdd={() => setAdding(true)}
        />
      ) : null}
      {loadError ? <Notice>{loadError}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      {tab === "Bills" || person ? (
        <>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Body>Bill</Body>
            <Body>Total</Body>
          </View>
          {data?.bills
            .filter((b) => b.title.toLowerCase().includes(search.toLowerCase()))
            .map((bill) => (
              <SwipeDeleteRow
                key={bill.id}
                label={bill.title}
                disabled={session.demo}
                immediate
                onOpen={() => onBill(bill.id)}
                onDelete={async () => {
                  await session.request(
                    `split-bills/${bill.id}?workspaceId=${encodeURIComponent(session.profileId)}`,
                    { method: "DELETE" },
                  );
                  setData((current) =>
                    current
                      ? {
                          ...current,
                          bills: current.bills.filter(
                            (row) => row.id !== bill.id,
                          ),
                        }
                      : current,
                  );
                  reload();
                  onChanged();
                }}
              >
                <Pressable
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
              </SwipeDeleteRow>
            ))}
          {data && !data.bills.length ? (
            <Notice>No bills here yet.</Notice>
          ) : null}
          {data ? <SimplifyAction bills={bills} /> : null}
        </>
      ) : (
        <Card>
          {group && <>
            <Body>Group Cover</Body>
            <GroupCover id={group.id} url={cover} style={{ width: "100%", aspectRatio: 2.2, borderRadius: 8 }} />
            {editable && <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {coverNames.map((label, i) => {
                  const url = geometricCover(i);
                  const selected = resolvedGroupCover(group.id, cover).endsWith(url);
                  return <Pressable key={label} disabled={busy} accessibilityRole="button" accessibilityLabel={label}
                    accessibilityState={{ selected }} onPress={() => void changeCover(i)}
                    style={{ borderWidth: 2, borderColor: selected ? colors.teal : "transparent", padding: 2 }}>
                    <GroupCover id={group.id} url={url} style={{ width: 58, height: 30 }} />
                  </Pressable>;
                })}
              </View>
              <PlanAction title="Choose Photo" disabled={busy} onPress={() => void changeCover("photo")} />
              <PlanAction title="Use Default Cover" disabled={busy} onPress={() => void changeCover(null)} />
            </>}
          </>}
          <Body>Group Name</Body>
          <TextInput
            accessibilityLabel="Group Name"
            key={name}
            defaultValue={name}
            editable={editable && !busy}
            onEndEditing={(e) => {
              if (e.nativeEvent.text !== name)
                void persist(e.nativeEvent.text, members);
            }}
            style={{
              color: colors.ink,
              minHeight: 44,
              borderBottomWidth: 1,
              borderColor: colors.line,
            }}
          />
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1.6 }}>
              <Body>Name</Body>
            </View>
            <View style={{ flex: 1 }}>
              <Body>Owes You</Body>
            </View>
            <View style={{ flex: 1 }}>
              <Body>Owed</Body>
            </View>
            <View style={{ width: 32 }} />
          </View>
          {members.map((member, index) => (
            <SwipeDeleteRow
              key={member}
              label={member}
              disabled={!editable || busy}
              onOpen={() => setSelectedPerson(member)}
              message={`Remove ${member} from this group? Their past bills are kept.`}
              onDelete={() =>
                persist(
                  name,
                  members.filter((_, i) => i !== index),
                )
              }
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  minHeight: 56,
                  borderBottomWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <View
                  style={{
                    flex: 1.6,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <PersonAvatar name={member} size={24} />
                  <TextInput
                    accessibilityLabel={`Name for ${member}`}
                    defaultValue={member}
                    editable={editable && !busy}
                    onEndEditing={(e) => {
                      if (e.nativeEvent.text !== member)
                        void persist(
                          name,
                          members.map((n, i) =>
                            i === index ? e.nativeEvent.text : n,
                          ),
                        );
                    }}
                    style={{ flex: 1, color: colors.ink, minHeight: 44 }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Body>{amountLabel(member, true)}</Body>
                </View>
                <View style={{ flex: 1 }}>
                  <Body>{amountLabel(member, false)}</Body>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View details for ${member}`}
                  onPress={() => setSelectedPerson(member)}
                  style={{ padding: 8 }}
                >
                  <Text style={{ color: colors.teal, fontSize: 24 }}>›</Text>
                </Pressable>
              </View>
            </SwipeDeleteRow>
          ))}
          {editable ? (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={() => setAddingPerson(true)}
              >
                <Text style={{ color: colors.teal, paddingVertical: 12 }}>
                  + Add Person
                </Text>
              </Pressable>
              {addingPerson ? (
                <>
                  <Field
                    label="Person’s Name"
                    value={memberDraft}
                    onChangeText={setMemberDraft}
                  />
                  {memberDraft.trim()
                    ? savedPeople
                        .filter(
                          (p) =>
                            personKey(p.name).includes(
                              personKey(memberDraft),
                            ) &&
                            !members.some(
                              (m) => personKey(m) === personKey(p.name),
                            ),
                        )
                        .slice(0, 4)
                        .map((p) => (
                          <Pressable
                            key={p.name}
                            disabled={busy}
                            onPress={() => persist(name, [...members, p.name])}
                          >
                            <Body>{p.name}</Body>
                          </Pressable>
                        ))
                    : null}
                  <PlanAction
                    title="Add Person"
                    disabled={busy || !memberDraft.trim()}
                    onPress={() => persist(name, [...members, memberDraft])}
                  />
                </>
              ) : null}
              <PlanAction
                title="Delete Group"
                tone="delete"
                onPress={() => setConfirm(true)}
              />
              {confirm ? (
                <>
                  <Body>Archive this group and keep its bill history?</Body>
                  <PlanAction
                    title="Cancel"
                    onPress={() => setConfirm(false)}
                  />
                  <PlanAction
                    title="Confirm Deletion"
                    tone="delete"
                    disabled={busy}
                    onPress={async () => {
                      setBusy(true);
                      try {
                        await session.request(
                          `split-bill-groups/${group!.id}?workspaceId=${encodeURIComponent(session.profileId)}`,
                          { method: "DELETE" },
                        );
                        onChanged();
                        onClose();
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Unable to delete group.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </Card>
      )}
    </Screen>
  );
}
