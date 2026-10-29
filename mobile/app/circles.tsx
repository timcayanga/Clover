import {CircleDetailPanels} from "../src/circle-detail-panels";
import { ResourceUpgradeNotice } from "../src/contextual-upgrade";
import { AdaptiveGrid } from "../src/adaptive";
import { CloverEmptyState } from "../src/clover-mascot";
import { EntryOverlay } from "../src/entry-overlay";
import { ChoiceField } from "../src/transaction-entry";
import { CreateDirectoryCard } from "../src/create-directory-card";
import { Icon } from "../src/ui";
import { CircleInvitations } from "../src/circle-invitations";
import { Text } from "../src/app-text";
import {
  CircleResourceEditor,
  type CircleAction,
} from "../src/circle-resource-editor";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { SplitGroupDetails } from "../src/split-group-details";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState, useRef } from "react";
import { Image, View } from "react-native";
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
  SummaryCard,
  PlanHeader,
  PlanTabs,
  Progress,
  usePlanData,
} from "../src/plan-ui";
type Circle = {
  id: string;
  name: string;
  type: string;
  description: string;
  currency: string;
  color: string;
  avatarUrl?: string | null;
  role: string;
  isOwner?: boolean;
  commitments?: {
    id: string;
    title: string;
    amount: number;
    currency: string;
    isActive: boolean;
    recurrence?: string;
    nextDueDate?: string | null;
    assignedMemberId?: string | null;
    assignedMemberName?: string | null;
    notes?: string | null;
  }[];
  contributions?: {
    id: string;
    memberName: string|null;
    amount: number;
    currency: string;
    contributionDate: string;
    goalId?: string | null;
    note?: string | null;
  }[];
  memberCount: number;
  splitBillGroupId?: string | null;
  expenseCurrencyTotals?:Record<string,number>;
  contributionCurrencyTotals?:Record<string,number>;
  expenseTotalThisMonth: number;
  contributionTotalThisMonth: number;
  members?: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
    role: string;
    status: string;
    isOwner?: boolean; isMe?:boolean;
  }[];
  budgets?: {
    id: string;
    name: string;
    spentAmount: number;
    targetAmount: number;
    currency: string;
    progressPercent: number;
  }[];
  goals?: {
    id: string;
    name: string;
    currentAmount: number;
    targetAmount: number;
    currency: string;
    progressPercent: number;
  }[];
  expenses?: {
    id: string;
    title: string;
    amount: number;
    currency: string;
    date: string;
    visibility: string;
    kind?: string;
  }[];
  activities?: { id: string; summary: string; createdAt: string }[];
};
const sample = { circles: [] as Circle[] };
export default function Circles() {
  const session = useSession();
  const params = useLocalSearchParams<{ circleId?: string }>();
  const opened = useRef("");
  const { colors, dark } = useTheme();
  const { data, setData, error, reload } = usePlanData("circles", sample);
  const [invitations, setInvitations] = useState(false);
  const [selected, setSelected] = useState<Circle | null>(null);
  const [resource, setResource] = useState<CircleAction | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [memberDetail, setMemberDetail] = useState<string | null>(null);
  const [tab, setTab] = useState("Overview");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{
    circle: Circle | null;
    type?: string;
  } | null>(null);
  const [detailError, setDetailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setSelected(null);
    setInvitations(false);
    setResource(null);
    setEditor(null);
    setSearch("");
  }, [session.profileId]);
  useEffect(() => {
    const id = params.circleId;
    const token = `${session.profileId}:${id}`;
    if (id && data && opened.current !== token) {
      const found = data.circles.find((item) => item.id === id);
      if (found) {
        opened.current = token;
        setSelected(found);
      }
    }
  }, [params.circleId, data, session.profileId]);
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId || session.demo) return;
    let active = true;
    setLoading(true);
    setDetailError("");
    void session
      .request<{ circle: Circle | null }>(
        `circles/${selectedId}?workspaceId=${encodeURIComponent(session.profileId)}`,
      )
      .then((r) => {
        if (active) {
          if (!r.circle) throw new Error("Circle is no longer available.");
          setSelected(r.circle);
        }
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
  }, [selectedId, session.demo, session.profileId, session.request, revision]);
  if (invitations)
    return (
      <CircleInvitations
        key={`${session.profileId}:${selected?.id ?? "incoming"}`}
        circleId={selected?.id}
        onClose={() => setInvitations(false)}
        onJoined={() => {
          setInvitations(false);
          reload();
        }}
      />
    );
  if (resource && selected)
    return (
      <CircleResourceEditor
        key={`${session.profileId}:${selected.id}:${resource.action}:${resource.id ?? "new"}`}
        circleId={selected.id}
        currency={selected.currency}
        members={selected.members}
        goals={selected.goals}
        organizer={selected.role === "organizer"}
        initial={resource}
        onClose={() => setResource(null)}
        onSaved={() => {
          setResource(null);
          setRevision((v) => v + 1);
          reload();
        }}
      />
    );
  if (memberDetail && selected?.splitBillGroupId)
    return (
      <SplitGroupDetails
        group={{
          id: selected.splitBillGroupId,
          name: selected.name,
          members: [],
        }}
        person={memberDetail}
        onClose={() => setMemberDetail(null)}
        onBill={(id) => {
          setMemberDetail(null);
          router.push({ pathname: "/split-bills", params: { billId: id } });
        }}
        onChanged={reload}
      />
    );
  const entryOverlay = editor ? (
    <EntryOverlay onClose={() => setEditor(null)}>
      <CircleEditor
        key={session.profileId}
        initial={editor.circle}
        type={editor.type}
        onClose={() => setEditor(null)}
        onSaved={(circle) => {
          setEditor(null);
          setSelected(null);
          if (session.demo)
            setData((current) => ({
              circles: [
                ...(current?.circles ?? []).filter((c) => c.id !== circle.id),
                circle,
              ],
            }));
          else reload();
        }}
      />
    </EntryOverlay>
  ) : null;
  return (
    <Screen layout="dashboard" gap={20}>
      {entryOverlay}
      <PlanHeader
        title={selected ? selected.name : "Circles"}
        back={selected ? () => setSelected(null) : undefined}
        add={() => setEditor({ circle: null })}
      />
      {error ? (
        <>
          <Notice>{error}</Notice>
          <PlanAction title="Try again" onPress={reload} />
        </>
      ) : !data ? (
        <Body>Loading Circles…</Body>
      ) : selected ? (
        <>

          <PlanTabs
            items={[
              "Overview",
              "Expenses",
              "Budgets",
              "Goals",
              "Recurring",
              "Contributions",
              "Activity",
              "People",
            ]}
            value={tab}
            onChange={setTab}
          />
          {loading ? (
            <Body>Loading Circle details…</Body>
          ) : detailError ? (
            <>
              <Notice>{detailError}</Notice>
              <PlanAction
                title="Retry details"
                onPress={() => setRevision((v) => v + 1)}
              />
            </>
          ) : <CircleDetailPanels circle={selected} tab={tab} onEdit={setResource} onInvite={()=>setInvitations(true)} onRefresh={()=>{setRevision(v=>v+1);reload();}} onArchive={()=>{setDeleteConfirm(true);}} onMember={setMemberDetail}/>}
          {deleteConfirm&&selected.isOwner?<Card><Body>Archive this Circle? Shared history and personal transactions are preserved.</Body><PlanAction title="Archive Circle" tone="delete" disabled={loading} onPress={()=>{setLoading(true);void session.request(`circles/${selected.id}/archive?workspaceId=${encodeURIComponent(session.profileId)}`,{method:'POST'}).then(()=>{setSelected(null);setDeleteConfirm(false);reload();}).catch(e=>setDetailError(e.message)).finally(()=>setLoading(false));}}/><PlanAction title="Keep Circle" onPress={()=>setDeleteConfirm(false)}/></Card>:null}
        </>
      ) : (
        <>

          <Body>
            Split bills, coordinate shared expenses, track commitments, and work
            toward budgets and goals together—while keeping personal accounts
            private.
          </Body>
          <Field
            label="Find a Circle"
            value={search}
            onChangeText={setSearch}
          />
          <AdaptiveGrid>
          {data.circles
            .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
            .map((circle) => (
              <Card
                key={circle.id}
                onPress={() => { setSelected(circle); setTab("Overview"); }}
                style={{
                  backgroundColor: dark
                    ? circle.type === "household"
                      ? "#193A38"
                      : "#302A45"
                    : circle.type === "household"
                      ? "#E0F6F0"
                      : "#F0E9FC",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: colors.ink,
                      fontFamily: "Poppins-SemiBold",
                      fontSize: 16,
                      flex: 1,
                    }}
                  >
                    {circle.name}
                  </Text>
                  <Image
                    source={
                      circle.avatarUrl &&
                      /^(https:|data:image\/)/.test(circle.avatarUrl)
                        ? { uri: circle.avatarUrl }
                        : circle.type === "household"
                          ? require("../assets/circles/household.jpg")
                          : require("../assets/circles/social.jpg")
                    }
                    accessible={false}
                    style={{ width: 64, height: 64, borderRadius: 16 }}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {(circle.members ?? []).slice(0, 5).map((member) => (
                    <CircleMemberPhoto key={member.id} member={member} />
                  ))}
                  {circle.memberCount > 5 ? (
                    <Body>+{circle.memberCount - 5}</Body>
                  ) : null}
                </View>
                <PlanAction
                  title="View Circle"
                  tone="primary"
                  onPress={() => {
                    setSelected(circle);
                    setTab("Overview");
                  }}
                />
              </Card>
            ))}
          </AdaptiveGrid>
          <CreateDirectoryCard
            title="Create Circle"
            subtitle="Start sharing with a new group"
            onPress={() => setEditor({ circle: null, type: "household" })}
          />
          <PlanAction
            title="Circle invitations"
            onPress={() => setInvitations(true)}
          />
        </>
      )}
    </Screen>
  );
}
function CircleEditor({
  initial,
  type,
  onClose,
  onSaved,
}: {
  initial: Circle | null;
  type?: string;
  onClose: () => void;
  onSaved: (circle: Circle) => void;
}) {
  const session = useSession();
  const { colors } = useTheme();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState(initial?.type ?? type ?? "household");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "PHP");
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const save = async () => {
    if (inFlight.current) return;
    if (!name.trim() || !/^[A-Z]{3}$/.test(currency)) {
      setError("Enter a Circle name and three-letter currency.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: name.trim(),
        type: kind,
        description,
        currency,
        color: initial?.color ?? "teal",
        ...(avatar !== undefined ? { avatarUrl: avatar } : {}),
      };
      const result = session.demo
        ? { circleId: initial?.id ?? `demo-${Date.now()}` }
        : await session.request<{ circleId: string }>(
            `circles${initial ? `/${initial.id}` : ""}?workspaceId=${encodeURIComponent(session.profileId)}`,
            {
              method: initial ? "PATCH" : "POST",
              body: JSON.stringify(payload),
            },
          );
      if (!alive.current) return;
      onSaved({
        ...payload,
        id: result.circleId,
        role: "organizer",
        memberCount: initial?.memberCount ?? 1,
        expenseTotalThisMonth: initial?.expenseTotalThisMonth ?? 0,
        contributionTotalThisMonth: initial?.contributionTotalThisMonth ?? 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save Circle.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <Screen sheet onDismiss={() => { if (!busy) onClose(); }}>
      { !initial ? <ResourceUpgradeNotice resource="circles" /> : null}
      <PlanHeader
        title={initial ? "Edit Circle" : "Create Circle"}
        back={() => {
          if (!busy) onClose();
        }}
      />
      {(avatar === undefined ? initial?.avatarUrl : avatar) ? (
        <Image
          source={{
            uri: (avatar === undefined ? initial?.avatarUrl : avatar) ?? "",
          }}
          style={{ width: 96, height: 96, borderRadius: 48, alignSelf: "center" }}
        />
      ) : (
        <View style={{ width: 96, height: 96, borderRadius: 48, alignSelf: "center", alignItems: "center", justifyContent: "center", backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1 }}>
          <Icon name="camera-outline" size={32} color={colors.teal} />
        </View>
      )}
      <View style={{ alignItems: "center", gap: 8 }}>
      <PlanAction
        title="Choose Circle photo"
        onPress={() => {
          void ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.2,
            base64: true,
          })
            .then((r) => {
              if (!r.canceled && r.assets[0].base64) {
                const value = `data:image/jpeg;base64,${r.assets[0].base64}`;
                if (value.length > 200000)
                  setError("Choose a smaller image (under 150 KB).");
                else setAvatar(value);
              }
            })
            .catch((e) => setError(e.message));
        }}
      />
      {(avatar === undefined ? initial?.avatarUrl : avatar) ? <PlanAction title="Remove photo" onPress={() => setAvatar(null)} /> : null}
      </View>
      <Field
        label="Circle name"
        value={name}
        onChangeText={setName}
        maxLength={100}
      />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        maxLength={300}
      />
      <Field
        label="Currency"
        value={currency}
        onChangeText={(v) => setCurrency(v.toUpperCase())}
        maxLength={3}
      />
      <ChoiceField label="Circle Type" value={kind} onChange={setKind} options={["household","couple","family","travel","friends","goal","custom"].map(value=>({value,label:value[0].toUpperCase()+value.slice(1)}))}/>
      {error ? <Notice>{error}</Notice> : null}
      <PlanAction title="Cancel" disabled={busy} onPress={onClose} />
      <PlanAction
        title={busy ? "Saving…" : initial ? "Save changes" : "Create Circle"}
        tone="primary"
        disabled={busy}
        onPress={() => void save()}
      />
    </Screen>
  );
}

function CircleMemberPhoto({member}: {member:{displayName:string;avatarUrl?:string|null}}) {
  const [failedUrl,setFailedUrl] = useState<string|null>(null);
  const photo = member.avatarUrl && member.avatarUrl !== failedUrl && /^(https:|data:image\/)/.test(member.avatarUrl);
  return <LinearGradient colors={["#03a8c0", "#5ed3d0"]} style={{width:36,height:36,borderRadius:18,alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
    {photo ? <Image source={{uri:member.avatarUrl!}} accessibilityLabel={member.displayName} onError={()=>setFailedUrl(member.avatarUrl??null)} style={{width:36,height:36}} /> : <Text accessibilityLabel={member.displayName} style={{color:"#fff"}}>{member.displayName.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join("")}</Text>}
  </LinearGradient>;
}
