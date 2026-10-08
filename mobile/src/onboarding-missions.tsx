import { useCallback, useState } from "react";
import { missionMascotPoses } from "../../shared/onboarding-missions";
import { useFocusEffect, router, type Href } from "expo-router";
import { Pressable, View } from "react-native";
import { Text } from "./app-text";
import { Body, Button, Card, useTheme } from "./ui";
import { CloverMascot } from "./clover-mascot";
import { useSession } from "./session";
import type { OnboardingMissionId, OnboardingMissionSnapshot } from "../../shared/onboarding-missions";
const destinations: Record<OnboardingMissionId, Href> = {
  add_account: { pathname: "/(tabs)/accounts", params: { add: "1" } },
  add_transaction: "/add-transaction", set_budget: "/budgeting", create_goal: "/goals", ask_clover: "/(tabs)/adviser",
};
export function OnboardingMissions() {
  const session = useSession();
  const { colors } = useTheme();
  const [snapshot, setSnapshot] = useState<OnboardingMissionSnapshot | null>(null);
  const [error, setError] = useState("");
  useFocusEffect(useCallback(() => {
    let active = true;
    setSnapshot(null);
    if (!session.demo) void session.request<{ missions: OnboardingMissionSnapshot }>(`missions?workspaceId=${encodeURIComponent(session.profileId)}`)
      .then(data => { if (active) setSnapshot(data.missions); }).catch(() => {});
    return () => { active = false; };
  }, [session.profileId, session.demo, session.request]));
  if (!snapshot || snapshot.dismissed || snapshot.complete || !snapshot.nextMission) return null;
  const next = snapshot.nextMission;
  return <Card>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <CloverMascot size={72} pose={missionMascotPoses[snapshot.nextMission.id]} />
      <View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontFamily: "Poppins-SemiBold", fontSize: 15 }}>Getting started</Text><Body>A few simple steps to make Clover yours.</Body></View>
    </View>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Body>{snapshot.completedCount} of {snapshot.totalCount} complete</Body>
      <Pressable accessibilityRole="button" onPress={() => {
        const profile = session.profileId;
        void session.request(`missions?workspaceId=${encodeURIComponent(profile)}`, { method: "POST", body: JSON.stringify({ action: "dismiss" }) })
          .then(() => setSnapshot(null)).catch(() => setError("Unable to dismiss missions. Try again."));
      }}><Text style={{ color: colors.teal, padding: 8 }}>Dismiss</Text></Pressable>
    </View>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: snapshot.totalCount, now: snapshot.completedCount }} style={{ height: 5, borderRadius: 8, backgroundColor: colors.pale }}>
      <View style={{ height: 5, borderRadius: 8, backgroundColor: colors.teal, width: `${snapshot.completedCount / snapshot.totalCount * 100}%` }} />
    </View>
    {snapshot.missions.map(mission => <View key={mission.id} style={{ flexDirection: "row", gap: 10, padding: 10, borderRadius: 14, backgroundColor: mission.id === next?.id ? colors.pale : "transparent" }}>
      <Text style={{ color: colors.teal }}>{mission.completed ? "✓" : "○"}</Text>
      <View style={{ flex: 1, gap: 8 }}><Text style={{ color: colors.ink, fontFamily: "Poppins-SemiBold", fontSize: 15 }}>{mission.title}</Text>
        {!mission.completed && mission.id === next?.id ? <Button title={mission.actionLabel} onPress={() => router.push(destinations[mission.id])} /> : null}
      </View>
    </View>)}
    {error ? <Body>{error}</Body> : null}
  </Card>;
}
