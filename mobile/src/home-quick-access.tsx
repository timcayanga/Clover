import { useState, useRef, useEffect } from "react";
import { Pressable, View, Animated, AccessibilityInfo } from "react-native";
import { router, type Href } from "expo-router";
import { Text } from "./app-text";
import { Card, Icon, useTheme } from "./ui";
import { navigationGroups } from "./navigation-groups";
export function HomeQuickAccess() {
  const [selected, setSelected] = useState<string | null>(null),
    { colors } = useTheme();
  const groups = navigationGroups.filter((g) =>
    ["Understand", "Money", "Together", "Plan"].includes(g.title),
  );
  const progress = useRef(new Animated.Value(0)).current;
  const [panelWidth, setPanelWidth] = useState(0);
  const reduced = useRef(false);
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(value => { reduced.current = value; }); const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", value => { reduced.current = value; }); return () => sub.remove(); }, []);
  const openGroup = (title: string) => { setSelected(title); Animated.timing(progress, { toValue: 1, duration: reduced.current ? 0 : 220, useNativeDriver: true }).start(); };
  const closeGroup = () => Animated.timing(progress, { toValue: 0, duration: reduced.current ? 0 : 220, useNativeDriver: true }).start(({finished}) => { if(finished)setSelected(null); });
  const group = groups.find((g) => g.title === selected);
  const route = (path: string) =>
    (({
      "/accounts": "/(tabs)/accounts",
      "/transactions": "/(tabs)/transactions",
      "/recurring": "/(tabs)/recurring",
      "/adviser": "/(tabs)/adviser",
    })[path] ?? path) as Href;
  const items = group
    ? [
        {
          label: "Back",
          icon: "arrow-back-outline" as const,
          action: closeGroup,
        },
        ...group.items.map((i) => ({
          ...i,
          action: () => router.navigate(route(i.route)),
        })),
      ]
    : groups.map((g) => ({
        label: g.title,
        icon: g.icon,
        action: () => openGroup(g.title),
      }));
  const primary = groups.map(g => ({label:g.title,icon:g.icon,action:()=>openGroup(g.title)}));
  const render = (list: typeof items) => list.map(item => <Pressable key={item.label} accessibilityRole="button" onPress={item.action} style={{ flex:1,alignItems:"center",gap:8,paddingVertical:8 }}><Icon name={item.icon} size={36}/><Text style={{fontSize:11,color:colors.ink,fontFamily:"Poppins-SemiBold",textAlign:"center"}}>{item.label}</Text></Pressable>);
  return <Card style={{padding:12,overflow:"hidden"}}><View onLayout={e=>setPanelWidth(e.nativeEvent.layout.width)} style={{overflow:"hidden"}}>
    <Animated.View style={{flexDirection:"row",width:panelWidth*2,transform:[{translateX:progress.interpolate({inputRange:[0,1],outputRange:[0,-panelWidth]})}]}}>
      <View accessibilityElementsHidden={!!selected} importantForAccessibility={selected ? "no-hide-descendants" : "auto"} style={{width:panelWidth,flexDirection:"row"}}>{render(primary)}</View>
      <View accessibilityElementsHidden={!selected} importantForAccessibility={!selected ? "no-hide-descendants" : "auto"} style={{width:panelWidth,flexDirection:"row"}}>{group ? render(items) : null}</View>
    </Animated.View>
  </View></Card>;
}
