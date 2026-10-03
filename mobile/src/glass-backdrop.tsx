import { useFocusEffect } from "expo-router";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
  useRef,
  useEffect,
  type ReactNode,
  type RefObject,
} from "react";
import { AccessibilityInfo, StyleSheet, View, Platform } from "react-native";
import { BlurView, BlurTargetView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
type Target = RefObject<View | null> | undefined;
const GlassTargetContext = createContext<{target:Target; setTarget:Dispatch<SetStateAction<Target>>} | null>(null);
export function GlassNavigationProvider({ children }: { children: ReactNode }) {
  const [target,setTarget] = useState<Target>(undefined);
  return (
    <GlassTargetContext.Provider value={{target,setTarget}}>
      {children}
    </GlassTargetContext.Provider>
  );
}
export function GlassContent({ children }: { children: ReactNode }) {
  const target = useRef<View>(null);
  const setTarget = useContext(GlassTargetContext)?.setTarget;
  useFocusEffect(useCallback(() => {
    setTarget?.(target);
    return () => setTarget?.(current => current === target ? undefined : current);
  },[setTarget]));
  return (
    <BlurTargetView ref={target} style={{ flex: 1 }}>
      {children}
    </BlurTargetView>
  );
}
export function GlassBackdrop({ dark = false }: { dark?: boolean }) {
  const target = useContext(GlassTargetContext)?.target;
  const [reduceTransparency, setReduceTransparency] = useState(false);
  useEffect(() => {
    if (typeof AccessibilityInfo.isReduceTransparencyEnabled !== "function") return;
    let active = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => { if (active) setReduceTransparency(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduceTransparency);
    return () => { active = false; listener.remove(); };
  }, []);
  if (reduceTransparency || (Platform.OS === "android" && !target))
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dark ? "#15252D" : "#F7FBFC", borderRadius: 32 }]} />;
  if (Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable())
    return (
      <GlassView
        pointerEvents="none"
        glassEffectStyle="regular"
        colorScheme={dark ? "dark" : "light"}
        tintColor={dark ? "#193A4333" : "#F7FBFC33"}
        style={[StyleSheet.absoluteFill,{borderRadius:32}]}
      />
    );
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { overflow: "hidden", borderRadius: 32 }]}
    >
      <BlurView
        blurTarget={target}
        blurMethod="dimezisBlurViewSdk31Plus"
        intensity={70}
        tint={dark ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: dark
              ? "rgba(13,23,29,0.55)"
              : "rgba(247,251,252,0.55)",
          },
        ]}
      />
    </View>
  );
}
