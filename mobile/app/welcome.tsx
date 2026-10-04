import { Text } from "../src/app-text";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccess } from "../src/access";
import { CloverMascot } from "../src/clover-mascot";

const slides = [
  { title: "Your money, together\nin Clover.", accent: "in Clover.", image: require("../assets/tutorial/accounts-v2.png"), mascot: "welcome" as const, cropTop: 0, description: "Clover Accounts preview showing balance summaries and bank accounts.", caption: "Banks, wallets, investments and cash in one place." },
  { title: "Connect, upload,\nor add manually.", accent: "or add manually.", image: require("../assets/tutorial/connect-v2.png"), mascot: "guiding" as const, cropTop: 0, description: "Clover Add Account preview with Manual, Ask Clover, Upload and Connect selectors.", caption: "Bank connections · Available with Plus and Pro" },
  { title: "See where your\nmoney goes.", accent: "money goes.", image: require("../assets/tutorial/spending-v2.png"), mascot: "thinking" as const, cropTop: 0, description: "Clover Reports preview with category spending and comparison tools.", caption: "Explore spending, trends and insights." },
  { title: "Ask Clover.\nTake your next step.", accent: "Take your next step.", image: require("../assets/tutorial/adviser-v2.png"), mascot: "celebrating" as const, cropTop: 64, description: "Ask Clover preview with a financial question ready to ask.", caption: "Turn your financial questions into clear next steps." },
];

export default function Welcome() {
  const access = useAccess();
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pager = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [pageWidth, setPageWidth] = useState(width);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const compact = height < 750;
  // Show a focused glimpse of the app, with room for Clover beside it. Large
  // text can scroll independently while the authentication actions stay usable.
  const artworkHeight = Math.max(180, Math.min(330, height - insets.top - insets.bottom - 370 - Math.max(0, fontScale - 1) * 80));
  const artworkWidth = Math.min(pageWidth - 64, 342);
  useEffect(() => { pager.current?.scrollTo({ x: pageWidth * index, animated: false }); }, [pageWidth, index]);
  const authenticate = async (signup: boolean) => {
    if (busy || !access.loaded || !access.configured) return;
    setBusy(true);
    setError("");
    try { await (signup ? access.signUp() : access.signIn()); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to open secure sign-in. Please try again."); }
    finally { setBusy(false); }
  };
  if (access.active) return null;
  const disabled = busy || !access.loaded || !access.configured;
  return (
    <LinearGradient colors={["#ffffff", "#f7fcfc", "#e5f7f5"]} style={s.page} onLayout={event => setPageWidth(event.nativeEvent.layout.width)}>
      <View style={[s.brand, compact && { paddingVertical: 8 }]}>
        <Image source={require("../assets/welcome-clover.png")} style={{ width: 28, height: 28 }} />
        <Image source={require("../assets/clover-wordmark.png")} accessibilityLabel="Clover" resizeMode="contain" style={{ width: 99, height: 24 }} />
      </View>
      <ScrollView ref={pager} horizontal pagingEnabled style={{ flex: 1 }} showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={event => setIndex(Math.max(0, Math.min(slides.length - 1, Math.round(event.nativeEvent.contentOffset.x / pageWidth))))}>
        {slides.map((slide, i) => {
          const start = slide.title.indexOf(slide.accent);
          return <ScrollView key={slide.title} style={{ width: pageWidth }} contentContainerStyle={s.slide}
            aria-hidden={i !== index} accessibilityElementsHidden={i !== index} importantForAccessibility={i === index ? "auto" : "no-hide-descendants"}>
            <Text accessibilityRole="header" style={[s.title, compact && { fontSize: 23, lineHeight: 29 }]}>
              {slide.title.slice(0, start)}<Text style={{ color: "#00aabe" }}>{slide.accent}</Text>{slide.title.slice(start + slide.accent.length)}
            </Text>
            <Text style={s.caption}>{slide.caption}</Text>
            <View style={{ width: artworkWidth, height: artworkHeight + 46, alignSelf: "center" }}>
              <View style={[s.preview, { width: artworkWidth, height: artworkHeight }]}>
                <Image source={slide.image} accessibilityLabel={slide.description} resizeMode="contain"
                  style={{ width: artworkWidth, height: artworkWidth * 460 / 342, transform: [{ translateY: -slide.cropTop * artworkWidth / 342 }] }} />
              </View>
              <View style={{ position: "absolute", right: -10, bottom: 0 }}><CloverMascot pose={slide.mascot} size={120} /></View>
            </View>
          </ScrollView>;
        })}
      </ScrollView>
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={s.pagination}>
          {slides.map((slide, i) => <Pressable key={slide.title} accessibilityRole="button" accessibilityLabel={`Tutorial ${i + 1}: ${slide.title.replace("\n", " ")}`}
            accessibilityState={{ selected: i === index }} onPress={() => setIndex(i)} style={s.dotTarget}>
            <View style={[s.dot, i === index && { width: 24, backgroundColor: "#03a8c0" }]} />
          </Pressable>)}
        </View>
        <Text accessibilityLiveRegion="polite" style={s.progress}>{index + 1} of 4 · Swipe to explore</Text>
        {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
        {!access.configured ? <Text style={s.error}>Account connection isn’t configured in this build.</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => void authenticate(true)} style={{ opacity: disabled ? 0.5 : 1 }}>
          <LinearGradient colors={["#03a8c0", "#34d3d0"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.button}>
            <Text style={[s.buttonText, { color: "white" }]}>{busy ? "Opening…" : "Sign up"}</Text>
          </LinearGradient>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => void authenticate(false)} style={[s.button, s.secondary, { opacity: disabled ? 0.5 : 1 }]}>
          <Text style={s.buttonText}>Log in</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}
const s = StyleSheet.create({
  page: { flex: 1 },
  brand: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  preview: { overflow: "hidden", borderRadius: 24, borderWidth: 1, borderColor: "#d5e8eb", backgroundColor: "white" },
  slide: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 16, paddingBottom: 6 },
  title: { color: "#17363d", fontSize: 26, lineHeight: 33, textAlign: "center", fontFamily: "Poppins-SemiBold", maxWidth: 430 },
  caption: { fontSize: 12, lineHeight: 18, color: "#596e78", textAlign: "center", maxWidth: 340 },
  footer: { paddingHorizontal: 24, gap: 10, flexShrink: 0 },
  pagination: { flexDirection: "row", justifyContent: "center", height: 36 },
  dotTarget: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#c6dfe1" },
  progress: { textAlign: "center", color: "#596e78", fontSize: 11, marginBottom: 2 },
  button: { minHeight: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", padding: 12 },
  secondary: { backgroundColor: "white", borderColor: "#cce5e8", borderWidth: 1 },
  buttonText: { color: "#17363d", fontSize: 16, fontFamily: "Poppins-Medium" },
  error: { color: "#ae303b", fontSize: 12, textAlign: "center" },
});
