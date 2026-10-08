import { useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, Pressable, View } from "react-native";
import { Text } from "./app-text";
import { useTheme } from "./ui";
import { useAccessibilityPreferences } from "./accessibility-preferences";

const WIDTH = 88;
export function SwipeDeleteRow({ children, label, message, onDelete, onOpen, disabled = false }: {
  children: ReactNode;
  label: string;
  message?: string;
  onDelete: () => Promise<void>;
  onOpen?: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const { reduceMotion } = useAccessibilityPreferences();
  const x = useRef(new Animated.Value(0)).current;
  const offset = useRef(0);
  const start = useRef(0);
  const pending = useRef(false);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef({ disabled, confirming, reduceMotion });
  latest.current = { disabled, confirming, reduceMotion };
  function settle(value: number) {
    offset.current = value;
    setOpen(value < 0);
    Animated.timing(x, { toValue: value, duration: latest.current.reduceMotion ? 0 : 160, useNativeDriver: true }).start();
  }
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => !latest.current.disabled && !latest.current.confirming && !pending.current && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4 && (g.dx < 0 || offset.current < 0),
    onPanResponderGrant: () => { x.stopAnimation(); start.current = offset.current; },
    onPanResponderMove: (_, g) => { offset.current = Math.max(-WIDTH, Math.min(0, start.current + g.dx)); x.setValue(offset.current); },
    onPanResponderRelease: () => settle(offset.current <= -38 ? -WIDTH : 0),
    onPanResponderTerminate: () => settle(0),
    onPanResponderTerminationRequest: () => true,
  })).current;
  function confirm() { if (pending.current || disabled) return; settle(0); setConfirming(true); setError(""); }
  async function remove() {
    if (!confirming || pending.current || disabled) return;
    pending.current = true; setBusy(true); setError("");
    try { await onDelete(); setConfirming(false); settle(0); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <View style={{ minWidth: 0 }}>
    <View style={{ overflow: "hidden", borderRadius: 12 }} {...responder.panHandlers}
      accessible={!disabled && !confirming} accessibilityLabel={label}
      accessibilityActions={[...(onOpen ? [{ name: "activate", label: "Open details" }] : []), { name: "delete", label: `Delete ${label}` }]}
      onAccessibilityAction={event => { if (event.nativeEvent.actionName === "delete") confirm(); else if (event.nativeEvent.actionName === "activate") onOpen?.(); }}>
      {!disabled ? <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${label}`} accessibilityElementsHidden={!open} importantForAccessibility={open ? "yes" : "no-hide-descendants"} onPress={confirm} disabled={busy || confirming} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: WIDTH, backgroundColor: "#C92B37", justifyContent: "center", alignItems: "center", padding: 8 }}><Text style={{ color: "white", fontFamily: "Poppins-SemiBold", fontSize: 13 }}>Delete</Text></Pressable> : null}
      <Animated.View style={{ backgroundColor: colors.white, transform: [{ translateX: x }] }}>
        <View accessibilityElementsHidden={open || confirming} importantForAccessibility={open || confirming ? "no-hide-descendants" : "auto"} pointerEvents={open || confirming ? "none" : "auto"}>{children}</View>
        {open ? <Pressable accessibilityLabel="Close delete action" onPress={() => settle(0)} style={{ position: "absolute", inset: 0 }} /> : null}
      </Animated.View>
    </View>
    {confirming ? <View style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: 12, padding: 14, gap: 12, backgroundColor: colors.white }}>
      <Text style={{ color: colors.ink }}>{message ?? `Delete ${label}? This cannot be undone.`}</Text>
      {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void remove()} style={{ minHeight: 44, justifyContent: "center", borderRadius: 22, paddingHorizontal: 16, backgroundColor: "#C92B37", opacity: busy ? 0.6 : 1 }}><Text style={{ color: "white" }}>{busy ? "Deleting…" : "Confirm deletion"}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setConfirming(false); setError(""); settle(0); }} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}><Text style={{ color: colors.ink }}>Cancel</Text></Pressable>
      </View>
    </View> : null}
  </View>;
}
