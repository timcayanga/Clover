import { useAccessibilityPreferences } from "./accessibility-preferences";
import { Children, useEffect, useRef, type ReactNode } from "react";
import { Animated, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "./app-text";

/** Two cards per row at every mobile width; content can grow with text size. */
export function AccountGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6, marginVertical: -6 }}>
    {Children.toArray(children).map(child => <View key={(child as { key?: string }).key} style={{ width: "50%", padding: 6 }}>{child}</View>)}
  </View>;
}

export function AccountGridCard({ name, identifier, amount, logo, palette, onOpen, onLongPress }: {
  name: string; identifier: string; amount: string; logo: ReactNode;
  palette: { colors: readonly [string, string, ...string[]]; locations?: readonly [number, number, ...number[]]; foreground: string };
  onOpen: () => void; onLongPress?: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name} details. ${identifier}. ${amount}`} onLongPress={onLongPress} onPress={onOpen} style={{ flex: 1 }}>
    <LinearGradient colors={palette.colors} locations={palette.locations} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ flex: 1, minHeight: 164, borderRadius: 16, padding: 14, gap: 6, borderWidth: 1, borderColor: "#ffffff2e" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ width: 32, height: 32 }}>{logo}</View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name} details`} onLongPress={onLongPress} onPress={onOpen} hitSlop={8}
          style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: palette.foreground, fontSize: 22, letterSpacing: 1 }}>•••</Text>
        </Pressable>
      </View>
      <Text style={{ color: palette.foreground, fontFamily: "Poppins-SemiBold", fontSize: 13, lineHeight: 20 }}>{name}</Text>
      <Text style={{ color: palette.foreground, fontSize: 11, lineHeight: 17 }}>{identifier}</Text>
      <Text style={{ color: palette.foreground, fontFamily: "Poppins-SemiBold", fontSize: 18, lineHeight: 27, marginTop: "auto" }}>{amount}</Text>

    </LinearGradient>
  </Pressable>;
}

export function AccountEditTile({ children, editing, name, onDelete }: {
  children: ReactNode; editing: boolean; name: string; onDelete?: () => void;
}) {
  const rotation = useRef(new Animated.Value(0)).current;
  const { reduceMotion } = useAccessibilityPreferences();
  useEffect(() => {
    if (!editing || reduceMotion) return;
    const tilt = (toValue: number) => Animated.timing(rotation, {toValue, duration:125, useNativeDriver:true, isInteraction:false});
    const loop = Animated.loop(Animated.sequence([tilt(1), tilt(-1)]));
    loop.start();
    return () => { loop.stop(); rotation.setValue(0); };
  }, [editing, reduceMotion, rotation]);
  return <Animated.View style={{flexGrow:1, transform:[{rotate:rotation.interpolate({inputRange:[-1,1],outputRange:["-1deg","1deg"]})}]}}>
    {children}
    {editing && onDelete && <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${name}`} onPress={onDelete}
      style={{position:"absolute",top:0,left:0,width:44,height:44,alignItems:"flex-start",justifyContent:"flex-start"}}>
      <Text style={{backgroundColor:"#B42318",color:"white",fontSize:20,width:28,height:28,borderRadius:14,overflow:"hidden",textAlign:"center",lineHeight:28}}>−</Text>
    </Pressable>}
  </Animated.View>;
}
