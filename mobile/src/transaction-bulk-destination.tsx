import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { bulkDestinationError, bulkDestinations, makeBulkDestinationRequest, type BulkDestination, type BulkSource } from "../../shared/transaction-bulk-destination";
import { Body, Button, Field, Heading, Icon, Notice, useTheme } from "./ui";
import { useSession } from "./session";

type Circle = { id: string; name: string; role: string };

export function TransactionBulkDestination({ rows, count, profileId, onClose, onSuccess }: {
  rows: (BulkSource & { merchantClean?: string | null; merchantRaw?: string | null })[]; count: number; profileId: string; onClose: () => void; onSuccess: (message: string) => void;
}) {
  const { colors } = useTheme();
  const { request } = useSession();
  const inFlight = useRef(false);
  const [destination, setDestination] = useState<BulkDestination | null>(null);
  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [circleId, setCircleId] = useState("");
  const [people, setPeople] = useState("");
  const [splitCircleId, setSplitCircleId] = useState("");
  const title = rows.length === 1 ? (rows[0].merchantClean || rows[0].merchantRaw || "Expense").slice(0, 120) : "Shared expenses";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (destination !== "circle" && destination !== "split") return;
    let active = true;
    request<{ circles: Circle[] }>(`circles?view=directory&workspaceId=${encodeURIComponent(profileId)}`)
      .then(result => { if (active) setCircles(result.circles.filter(circle => ["organizer", "member"].includes(circle.role))); })
      .catch(() => { if (active) setError("Couldn’t load Circles. Close and reopen Add To to retry."); });
    return () => { active = false; };
  }, [destination, profileId, request]);
  const submit = async (destination: BulkDestination) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const invalid = bulkDestinationError(rows, count, destination);
      if (invalid) throw new Error(invalid);
      const { path, body } = makeBulkDestinationRequest({ destination, workspaceId: profileId, rows, circleId, title, people: splitCircleId ? "" : people, splitCircleId, inferSchedule: true });
      const result = await request<{ result?: { added: number; alreadyShared: number } }>(
        `${path === "commitments" ? "recurring" : path}?workspaceId=${encodeURIComponent(profileId)}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      onSuccess(destination === "circle" ? (result.result ? `Shared ${result.result.added} · Already shared ${result.result.alreadyShared}` : "Expenses shared.") : destination === "split" ? "Split Bill created." : "Recurring item added.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t add these transactions.");
    } finally { inFlight.current = false; setSaving(false); }
  };

  const close = () => { if (!inFlight.current) onClose(); };
  const reasons = bulkDestinations.map(([key]) => bulkDestinationError(rows, count, key));
  const explanations = [...new Set(reasons.filter(Boolean))];
  const matchingCircles = circles?.filter(circle => people.trim() && circle.name.toLowerCase().includes(people.trim().toLowerCase())).slice(0, 5);
  const rowStyle = { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, minHeight: 48, gap: 12, borderBottomWidth: 1, borderColor: colors.line };

  return (
    <Modal transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: "#0006", justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss Add To" onPress={close} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} />
        <SafeAreaView edges={["bottom"]} accessibilityViewIsModal style={{ maxHeight: "90%", backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 8 }} keyboardShouldPersistTaps="handled">
            <Heading>Add To</Heading>
            {explanations.map(message => <Body key={message}>{message}</Body>)}
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: destination === "circle", disabled: !!reasons[0] || saving }} disabled={!!reasons[0] || saving} onPress={() => { setError(""); setDestination(destination === "circle" ? null : "circle"); }} style={[rowStyle, { opacity: reasons[0] ? 0.5 : 1 }]}>
              <Body muted={false}>Circles</Body>
              {!reasons[0] ? <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Body>{circles?.find(circle => circle.id === circleId)?.name || "Choose Circle"}</Body><Icon line name="chevron-down" size={16} /></View> : null}
            </Pressable>
            {destination === "circle" ? <>
              {circles?.length ? circles.map(circle => <Button key={circle.id} title={circle.name} secondary={circleId !== circle.id} disabled={saving} onPress={() => setCircleId(circle.id)} />) : <Body>{circles === null ? "Loading Circles…" : "No Circles available."}</Body>}
              <Button title="Share expenses" disabled={saving || !circleId} onPress={() => void submit("circle")} />
            </> : null}
            <View style={[rowStyle, { opacity: reasons[1] ? 0.5 : 1 }]}>
              <Body muted={false}>Split Bills</Body>
              {!reasons[1] ? <View style={{ flex: 1, maxWidth: 230 }}>
                <Field accessibilityLabel="People or Circles" placeholder="People or Circles" maxLength={500} editable={!saving} value={people} onFocus={() => setDestination("split")} onChangeText={value => { setPeople(value); setSplitCircleId(""); }} />
              </View> : null}
            </View>
            {destination === "split" ? <>
              {splitCircleId ? <Body>Using Circle members</Body> : matchingCircles?.map(circle => <Button key={circle.id} title={circle.name} secondary disabled={saving} onPress={() => { setPeople(circle.name); setSplitCircleId(circle.id); }} />)}
              <Body>Separate names with commas or choose a Circle.</Body>
              <Button title="Create Split Bill" disabled={saving || !people.trim()} onPress={() => void submit("split")} />
            </> : null}
            <View style={[rowStyle, { opacity: reasons[2] ? 0.5 : 1 }]}>
              <Body muted={false}>Recurring</Body>
              {!reasons[2] ? <Button title="Add" secondary disabled={saving} onPress={() => void submit("recurring")} /> : null}
            </View>
            {error ? <Notice>{error}</Notice> : null}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
