import { useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Text } from "./app-text";
import { CloverMascot } from "./clover-mascot";
import { useSession } from "./session";
import { useTheme } from "./ui";
import { contextualUpgradeOptions, upgradeDetails, type UpgradeContext, type UpgradeResource } from "../../shared/contextual-upgrades";
import { PLAN_CATALOG, type CloverPlanTier } from "../../shared/plan-catalog";
import type { RetentionSnapshot } from "../../shared/plan-retention";
const previews = {
  insights: require("../assets/upgrade-previews/insights.png"), trends: require("../assets/upgrade-previews/trends.png"),
  planner: require("../assets/upgrade-previews/planner.png"), markets: require("../assets/upgrade-previews/markets.png"), analysis: require("../assets/upgrade-previews/analysis.png"),
};
export function ContextualUpgrade({ context, tier, currentLimit }: { context: UpgradeContext; tier: CloverPlanTier; currentLimit?: number | null }) {
  const { colors } = useTheme();
  const detail = upgradeDetails[context];
  const premium = context in previews;
  return <View style={{ position: "relative", padding: premium ? 16 : 0, overflow: "hidden", borderRadius: 24 }}>
    {premium ? <Image source={previews[context as keyof typeof previews]} accessible={false} resizeMode="cover" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: .15 }} /> : null}
    <View style={{ alignItems: "center", gap: 12, padding: 24, backgroundColor: colors.white, borderRadius: 24, borderWidth: 1, borderColor: colors.line }}>
      <CloverMascot pose={detail.mascot} size={128} />
      <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 21, lineHeight: 31, fontFamily: "Poppins-SemiBold", textAlign: "center" }}>{detail.title}</Text>
      {currentLimit !== undefined && currentLimit !== null ? <Text style={{ color: colors.muted, textAlign: "center", fontSize: 12 }}>Your current plan includes {currentLimit} {detail.label}.</Text> : null}
      {context === "linkedBanks" ? <Text style={{ color: colors.muted, textAlign: "center", fontSize: 12 }}>Linked bank allowances apply each monthly period.</Text> : null}
      {contextualUpgradeOptions(context, tier, currentLimit).map(option => <Pressable key={option.tier} accessibilityRole="button" accessibilityLabel={`Upgrade to ${option.name}: ${option.benefit}`} style={{ width: "100%" }} onPress={() => router.push("/settings?section=plan")}><LinearGradient colors={option.tier === "pro" ? ["#e0fcef", "#78edc1", "#50d8b5"] : ["#b7eef0", "#25b9cb", "#06a8bd"]} style={{ minHeight: 66, borderRadius: 33, padding: 12, justifyContent: "center", alignItems: "center" }}><Text style={{ color: "#153b42", fontSize: 13 }}>Upgrade to {option.name}</Text><Text style={{ color: "#153b42", fontSize: 13 }}>{option.benefit}</Text></LinearGradient></Pressable>)}
      <Pressable accessibilityRole="button" onPress={() => router.push("/settings?section=plan")} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: colors.muted }}>Compare plans</Text></Pressable>
    </View>
  </View>;
}
export function ResourceUpgradeNotice({ resource, enabled = true }: { resource: UpgradeResource; enabled?: boolean }) {
  const session = useSession();
  const [snapshot, setSnapshot] = useState<RetentionSnapshot | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void session.request<{ retention: RetentionSnapshot }>("billing/usage", { signal: controller.signal }).then(data => setSnapshot(data.retention)).catch(() => {});
    return () => controller.abort();
  }, [enabled, resource, session.request, session.profileId]);
  if (!enabled || !snapshot) return null;
  const used = resource === "linkedBanks" ? snapshot.linkedBanks?.used : snapshot.usage[resource];
  const limit = resource === "linkedBanks" ? snapshot.linkedBanks?.limit : snapshot.limits[resource] === undefined ? PLAN_CATALOG[snapshot.planTier][resource] : snapshot.limits[resource];
  if (used === undefined || limit === undefined || limit === null || used < limit) return null;
  return <ContextualUpgrade context={resource} tier={snapshot.planTier} currentLimit={limit} />;
}
