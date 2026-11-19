import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, AppState, Easing, Pressable, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./app-text";
import { useAccessibilityPreferences } from "./accessibility-preferences";
import { greetingName } from "../../shared/home-return";

/** The destination renders beneath the greeting while it animates. */
export function ReturnGreeting({ firstName }: { firstName: string | null }) {
  const [visible, setVisible] = useState(false);
  const animation = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const exiting = useRef(false);
  const { reduceMotion } = useAccessibilityPreferences();
  const motionPreference = useRef(reduceMotion);
  motionPreference.current = reduceMotion;
  const insets = useSafeAreaInsets();

  const dismiss = useCallback(() => {
    if (exiting.current) return;
    exiting.current = true;
    clearTimeout(timer.current);
    if (motionPreference.current) {
      setVisible(false);
      return;
    }
    Animated.timing(animation, {
      toValue: 2,
      duration: 330,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => { if (finished) setVisible(false); });
  }, [animation]);

  useEffect(() => {
    const show = () => {
      clearTimeout(timer.current);
      exiting.current = false;
      const reduced = motionPreference.current;
      animation.setValue(reduced ? 1 : 0);
      setVisible(true);
      if (!reduced) {
        Animated.timing(animation, {
          toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }).start();
      }
      timer.current = setTimeout(dismiss, 1600);
    };
    show();
    const listener = AppState.addEventListener("change", state => {
      if (state === "background") {
        clearTimeout(timer.current);
        animation.stopAnimation();
        setVisible(false);
      }
    });
    return () => {
      clearTimeout(timer.current);
      animation.stopAnimation();
      listener.remove();
    };
  }, [animation, dismiss]);

  if (!visible) return null;
  const greeting = greetingName(firstName);
  return (
    <Animated.View accessibilityViewIsModal style={[StyleSheet.absoluteFill, {
      top: -insets.top, left: -insets.left, right: -insets.right, zIndex: 300,
      backgroundColor: "#00AABD",
      opacity: animation.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
    }]}>
      <StatusBar style="light" />
      <Pressable accessibilityRole="button" accessibilityLabel={`${greeting} Continue to Clover`} onPress={dismiss}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontFamily: "Poppins-SemiBold", fontSize: 36, color: "#fff", textAlign: "center" }}>{greeting}</Text>
      </Pressable>
    </Animated.View>
  );
}
