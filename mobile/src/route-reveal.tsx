import { useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Animated } from "react-native";
export function RouteReveal({ children }: { children: ReactNode }) {
  // Native Liquid Glass cannot initialize beneath a zero-opacity ancestor.
  // Translate the route into place while keeping its material fully rendered.
  const translateY = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!active) return;
      Animated.timing(translateY, { toValue: 0, duration: reduced ? 0 : 220, useNativeDriver: true }).start();
    }).catch(() => translateY.setValue(0));
    return () => { active = false; translateY.stopAnimation(); };
  }, [translateY]);
  return <Animated.View style={{ flex: 1, transform: [{ translateY }] }}>{children}</Animated.View>;
}
