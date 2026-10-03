import { useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Animated } from "react-native";
export function RouteReveal({ children }: { children: ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!active) return;
      Animated.timing(opacity, { toValue: 1, duration: reduced ? 0 : 220, useNativeDriver: true }).start();
    }).catch(() => opacity.setValue(1));
    return () => { active = false; opacity.stopAnimation(); };
  }, [opacity]);
  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>;
}
