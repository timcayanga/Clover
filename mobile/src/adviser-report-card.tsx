import { Text } from "./app-text";
import { View, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import type { AdviserChart } from "../../shared/adviser-chart";
import { money, useTheme } from "./ui";
export function AdviserReportCard({chart}:{chart:AdviserChart}) {
  const {colors}=useTheme();
  const max=Math.max(...chart.bars.map(bar=>bar.amount),1);
  return <View style={{gap:12,padding:12,borderWidth:1,borderColor:colors.line,borderRadius:16}}>
    <Text style={{fontFamily:"Poppins-SemiBold",fontSize:16,color:colors.ink}}>{chart.title}</Text>
    <Text style={{fontFamily:"Poppins-Regular",fontSize:12,color:colors.muted}}>{new Date(chart.from).toLocaleDateString()} – {new Date(chart.through).toLocaleDateString()} · {chart.currency}</Text>
    {chart.bars.map((bar,index)=><View key={index} style={{gap:6}}><View style={{flexDirection:"row",justifyContent:"space-between",gap:8}}><Text style={{flexShrink:1,color:colors.ink,fontFamily:"Poppins-Regular",fontSize:13}}>{bar.label}</Text><Text style={{color:colors.ink,fontFamily:"Poppins-Medium",fontSize:13}}>{money(String(bar.amount),chart.currency)}</Text></View><View style={{height:8,borderRadius:8,overflow:"hidden",backgroundColor:colors.line}}><LinearGradient colors={["#03a8c0","#71e5bf"]} start={{x:0,y:0}} end={{x:1,y:0}} style={{height:8,width:`${bar.amount/max*100}%`,borderRadius:8}} /></View></View>)}
    <Pressable accessibilityRole="button" onPress={()=>router.push("/reports")} style={{minHeight:44,justifyContent:"center"}}><Text style={{color:colors.teal,fontFamily:"Poppins-Medium",fontSize:15}}>Open Reports</Text></Pressable>
  </View>;
}
