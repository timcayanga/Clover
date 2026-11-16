import { useState } from "react";
import { Pressable, View, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Text } from "./app-text";

export const openingSpending = [
  { label: "Housing", amount: 12000, color: "#991B1B" },
  { label: "Food & Dining", amount: 9000, color: "#FDBA74" },
  { label: "Groceries", amount: 7500, color: "#FBAC58" },
  { label: "Transport", amount: 4500, color: "#BAE6FD" },
] as const;
const money = (n: number) => `₱${n.toLocaleString("en-PH")}`;
export function OpeningSpendingPreview() {
  const total = openingSpending.reduce((sum, row) => sum + row.amount, 0);
  const circumference = 2 * Math.PI * 62;
  let offset = 0;
  return <View style={s.panel} accessibilityLabel="Sample spending report">
    <Text style={s.heading}>Where It Went</Text>
    <View style={{ alignItems: "center" }}>
      <Svg width={170} height={170} viewBox="0 0 170 170" accessibilityLabel="Spending by category">
        {openingSpending.map(row => {
          const length = row.amount / total * circumference;
          const start = offset; offset += length;
          return <Circle key={row.label} cx={85} cy={85} r={62} fill="none" stroke={row.color} strokeWidth={27} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-start} rotation={-90} origin="85,85" />;
        })}
      </Svg>
      <View pointerEvents="none" style={{ position: "absolute", top: 63, alignItems: "center" }}><Text style={s.small}>Total spending</Text><Text style={s.heading}>{money(total)}</Text></View>
    </View>
    {openingSpending.map(row => <View key={row.label} style={s.row}><View style={[s.dot, { backgroundColor: row.color }]} /><Text style={[s.label, { flex: 1 }]}>{row.label}</Text><Text style={s.label}>{money(row.amount)} · {(row.amount / total * 100).toFixed(1)}%</Text></View>)}
  </View>;
}
export function OpeningChatPreview() {
  const [question, setQuestion] = useState("Where did my money go this month?");
  return <View style={s.panel} accessibilityLabel="Sample Ask Clover conversation">
    <View style={s.question}><Text style={s.label}>{question}</Text></View>
    <View style={s.reply}><Text style={s.heading}>{question === "Set a budget" ? "A starting point for your budget" : question === "Compare last month" ? "Your everyday spending this month" : "Your top everyday expenses"}</Text>
      {openingSpending.slice(1).map(row => <View key={row.label} style={{ gap: 4 }}><View style={s.row}><Text style={[s.label, { flex: 1 }]}>{row.label}</Text><Text style={s.label}>{money(row.amount)}</Text></View><View style={s.track}><View style={{ width: `${row.amount / 9000 * 100}%`, height: 7, borderRadius: 4, backgroundColor: row.color }} /></View></View>)}
    </View>
    <View style={[s.row, { flexWrap: "wrap" }]}>{["Compare last month", "Set a budget"].map(label => <Pressable key={label} accessibilityRole="button" onPress={() => setQuestion(label)} style={s.chip}><Text style={s.small}>{label}</Text></Pressable>)}</View>
    <View style={s.composer}><Text style={[s.small, { flex: 1 }]}>Ask a follow-up…</Text><Text style={s.heading}>↑</Text></View>
  </View>;
}
const s = StyleSheet.create({
  panel: { padding: 16, gap: 10, backgroundColor: "white" },
  heading: { fontFamily: "Poppins-SemiBold", fontSize: 12, color: "#21323d" },
  label: { fontSize: 10, color: "#21323d" }, small: { fontSize: 9, color: "#607786" },
  row: { flexDirection: "row", alignItems: "center", gap: 7 }, dot: { width: 8, height: 8, borderRadius: 4 },
  question: { alignSelf: "flex-end", backgroundColor: "#e6f7f5", borderRadius: 12, padding: 10 },
  reply: { padding: 12, gap: 12, borderWidth: 1, borderColor: "#dde9ea", borderRadius: 12 },
  track: { height: 7, backgroundColor: "#f5f7f9", borderRadius: 4 },
  chip: { minHeight: 44, justifyContent: "center", borderRadius: 22, borderWidth: 1, borderColor: "#dde9ea", paddingHorizontal: 10 },
  composer: { flexDirection: "row", alignItems: "center", padding: 10, borderWidth: 1, borderColor: "#dde9ea", borderRadius: 20 },
});
