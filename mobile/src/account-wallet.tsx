import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Rect } from "react-native-svg";
import { walletCardLayout, walletFinish, walletGeometry } from "../../shared/account-wallet";
import { useTheme } from "./ui";
import { useAccessibilityPreferences } from "./accessibility-preferences";
import { Text } from "./app-text";

export function AccountWallet({ children }: { children: ReactNode }) {
  const { dark } = useTheme();
  const finish = walletFinish[dark ? "dark" : "light"];
  const [size, setSize] = useState({ width: 342, height: 87 });
  const inset = walletGeometry.stitchInset;
  return <View onLayout={event => setSize(event.nativeEvent.layout)} style={{ borderRadius: walletGeometry.radius, borderWidth: 1, borderColor: finish.edge, backgroundColor: finish.shell, padding: walletGeometry.inset, paddingBottom: walletGeometry.bottomInset, overflow: "hidden" }}>
    <View style={{ borderRadius: 12, overflow: "hidden" }}>{children}</View>
    <Svg pointerEvents="none" accessible={false} width={size.width} height={size.height} style={{ position: "absolute", top: -1, left: -1 }}>
      <Rect x={inset} y={inset + .35} width={Math.max(0, size.width - inset * 2)} height={Math.max(0, size.height - inset * 2)} rx={18} fill="none" stroke={finish.holes} strokeWidth={2} strokeDasharray="4 4" strokeLinecap="round" opacity={.28} />
      <Rect x={inset} y={inset} width={Math.max(0, size.width - inset * 2)} height={Math.max(0, size.height - inset * 2)} rx={18} fill="none" stroke={finish.thread} strokeWidth={finish.threadWidth} strokeDasharray="4 4" strokeLinecap="round" opacity={finish.threadOpacity} />
    </Svg>
  </View>;
}

const WalletText = Animated.createAnimatedComponent(Text);

export function AccountWalletCard({ expanded, name, identifier, amount, logo, palette, onToggle, onOpen }: {
  expanded: boolean; name: string; identifier: string; amount: string; logo: ReactNode;
  palette: { colors: readonly [string, string, ...string[]]; locations?: readonly [number, number, ...number[]]; foreground: string };
  onToggle: () => void; onOpen: () => void;
}) {
  const { dark } = useTheme();
  const { reduceMotion } = useAccessibilityPreferences();
  const finish = walletFinish[dark ? "dark" : "light"];
  const [width, setWidth] = useState(320);
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) { progress.stopAnimation(); progress.setValue(expanded ? 1 : 0); return; }
    // Reusing the spring value carries velocity into a reversal instead of restarting.
    Animated.spring(progress, { toValue: expanded ? 1 : 0, stiffness: 204, damping: 28.57, mass: 1, overshootClamping: true, restDisplacementThreshold: .0005, restSpeedThreshold: .005, useNativeDriver: false }).start();
  }, [expanded, progress, reduceMotion]);
  useEffect(() => () => progress.stopAnimation(), [progress]);
  const from = walletCardLayout(width, 0), to = walletCardLayout(width, 1);
  const between = (a: number, b: number) => progress.interpolate({ inputRange: [0, 1], outputRange: [a, b], extrapolate: "clamp" });
  return <Animated.View onLayout={e => { const next = e.nativeEvent.layout.width; if (next > 0 && next !== width) setWidth(next); }} style={{ height: between(from.height, to.height), overflow: "hidden" }}>
    <Animated.View style={{ position: "absolute", width: from.cardWidth, height: from.cardHeight, borderRadius: 12, transformOrigin: "top left", transform: [{ translateX: between(from.x, to.x) }, { translateY: between(0, 7) }, { scale: between(1, to.scale) }], shadowColor: "#000", shadowOpacity: between(0, .15), shadowRadius: 5, shadowOffset: { width: 0, height: 4 }, elevation: between(0, 2) }}>
      <Pressable accessibilityRole="button" accessibilityLabel={expanded ? `Open ${name} details` : `Show ${name} card`} accessibilityState={{ expanded }} onPress={expanded ? onOpen : onToggle} style={{ flex: 1 }}>
        <LinearGradient colors={palette.colors} locations={palette.locations} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#ffffff2e" }}>
          <Animated.View style={{ position: "absolute", left: 10, top: 10, width: 32, height: 32, transformOrigin: "top left", transform: [{ scale: between(22 / 32, 1) }] }}>{logo}</Animated.View>
          <Animated.View style={{ position: "absolute", left: between(42, 52), right: 40, top: 10 }}><WalletText numberOfLines={1} style={{ color: palette.foreground, fontFamily: "Poppins-SemiBold", fontSize: between(13, 16), lineHeight: 22 }}>{name}</WalletText></Animated.View>
          <Animated.View style={{ position: "absolute", left: 10, top: between(35, 63), maxWidth: "44%" }}><WalletText numberOfLines={1} style={{ color: palette.foreground, fontSize: between(10, 11), lineHeight: 15 }}>{identifier}</WalletText></Animated.View>
          <Animated.View style={{ position: "absolute", right: 10, top: between(33, from.cardHeight - 52), maxWidth: "75%" }}><WalletText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.7} style={{ color: palette.foreground, fontSize: between(15, 25), fontFamily: "Poppins-SemiBold", textAlign: "right" }}>{amount}</WalletText></Animated.View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
    <Pressable accessibilityRole="button" accessibilityLabel={expanded ? `Hide ${name} card` : `Show ${name} card`} accessibilityState={{ expanded }} onPress={onToggle} style={{ position: "absolute", top: expanded ? 7 : 0, right: 7, width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Text style={{ color: palette.foreground, fontSize: 20 }}>{expanded ? "⌃" : "⌄"}</Text></Pressable>
    <Animated.View pointerEvents="none" style={{ position: "absolute", bottom: 6, left: 0, right: 0, height: 5, opacity: progress.interpolate({ inputRange: [0, .5, 1], outputRange: [1, .125, 0] }) }}><LinearGradient colors={["#00000000", "#0000003b"]} style={{ flex: 1 }} /></Animated.View>
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 6, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: finish.shell, overflow: "hidden" }}><LinearGradient colors={["#ffffff66", "#ffffff00", "#0000001f"]} style={{ flex: 1 }} /></View>
  </Animated.View>;
}
