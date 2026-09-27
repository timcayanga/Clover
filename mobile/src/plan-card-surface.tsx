import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/** Same full-card glass surface as the public Pricing page. */
export function PlanCardSurface({ tier, width, children }: { tier: "free" | "pro" | "premium"; width: number; children: ReactNode }) {
  const paid = tier !== "free";
  return <View style={[styles.card, { width, borderColor: paid ? "#ffffff9c" : "#d9e8ea" }]}>
    <LinearGradient pointerEvents="none" colors={tier === "premium" ? ["#69dbe2", "#25b9cb", "#06a8bd"] : tier === "pro" ? ["#b6f9de", "#78edc1", "#50d8b5"] : ["#ffffff", "#ffffff"]} locations={tier === "free" ? undefined : [0, .55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    {paid ? <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      <LinearGradient colors={["#ffffff47", "#ffffff0a", "#ffffff00", "#ffffff33", "#ffffff00"]} locations={[0, .35, .49, .5, .72]} start={{ x: 0, y: 0 }} end={{ x: 1, y: .5 }} style={StyleSheet.absoluteFill}/>
      <View style={styles.reflection}/>
    </View> : null}
    {children}
  </View>;
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 24, overflow: "hidden", backgroundColor: "white" },
  reflection: { position: "absolute", width: 260, height: 260, right: -72, bottom: -104, borderRadius: 130, borderWidth: 1, borderColor: "#ffffff66", backgroundColor: "#ffffff18", transform: [{ rotate: "-25deg" }] },
});
