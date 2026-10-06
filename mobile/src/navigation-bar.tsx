import { useAdaptiveLayout } from "./adaptive";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./app-text";
import { GlassBackdrop } from "./glass-backdrop";

/** One physical frame for tab and detail navigation on both native platforms. */
export function NavigationBar({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  const insets = useSafeAreaInsets();
  const layout = useAdaptiveLayout();
  return <View pointerEvents="box-none" style={[styles.position, { bottom: Math.max(insets.bottom, 8), height: layout.dockHeight }]}>
    <View style={[styles.capsule, { width: "100%", maxWidth: layout.dockMaxWidth }]}>
    <View style={[styles.surface, { borderColor: dark ? "#59778399" : "#FFFFFFCC" }]}>
      <GlassBackdrop dark={dark} />
      <View style={styles.items}>{children}</View>
    </View>
    </View>
  </View>;
}

export function NavigationItem({ label, children, color, selected = false, add = false, disabled = false, onPress, onLongPress }: {
  label: string; children: ReactNode; color: string; selected?: boolean; add?: boolean; disabled?: boolean;
  onPress: () => void; onLongPress?: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ selected: add ? undefined : selected, disabled }} disabled={disabled}
    onPress={onPress} onLongPress={onLongPress}
    style={({ pressed }) => [styles.item, selected && !add ? styles.selected : null, pressed ? styles.pressed : null]}>
    {children}
    {!add ? <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={2}
      style={[styles.label, { color }]}>{label}</Text> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  position: { position: "absolute", left: 8, right: 8, alignItems: "center", borderRadius: 32 },
  capsule: { shadowColor: "#17373F", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 12, flex: 1, borderRadius: 32 },
  surface: { flex: 1, borderRadius: 32, overflow: "hidden", borderWidth: 1 },
  items: { flex: 1, flexDirection: "row", alignItems: "stretch", paddingVertical: 7, paddingHorizontal: 3 },
  item: { flex: 1, minWidth: 0, minHeight: 44, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: 22 },
  label: { fontFamily: "Poppins-Regular", fontSize: 10, lineHeight: 14, includeFontPadding: false, textAlign: "center", maxWidth: "100%" },
  selected: { backgroundColor: "#00ACC012" },
  pressed: { opacity: 0.65 },
});
