import { useFocusEffect } from "expo-router";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { StyleSheet, View, Platform } from "react-native";
import { BlurView, BlurTargetView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
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
  if (Platform.OS === "ios" && isLiquidGlassAvailable())
    return (
      <GlassView
        pointerEvents="none"
        glassEffectStyle="regular"
        colorScheme={dark ? "dark" : "light"}
        style={[StyleSheet.absoluteFill,{borderRadius:32}]}
      />
    );
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}
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
              ? "rgba(13,23,29,0.45)"
              : "rgba(247,251,252,0.45)",
          },
        ]}
      />
    </View>
  );
}
