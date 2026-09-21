import { Text } from "../src/app-text";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccess } from "../src/access";

const slides = [
  { title: "See all your money\nin one place.", accent: "all your money", image: require("../assets/tutorial/accounts.png"), description: "Illustrative Accounts screen showing banks, wallets, investments and cash together." },
  { title: "Upload statements,\nreceipts & screenshots.", accent: "statements,\nreceipts & screenshots.", image: require("../assets/tutorial/upload.png"), description: "Illustrative transaction list with statement, receipt and spreadsheet uploads ready to review." },
  { title: "See where your\nmoney goes.", accent: "money goes.", image: require("../assets/tutorial/spending.png"), description: "Illustrative spending chart with spending grouped by category." },
  { title: "Ask Clover.\nUnderstand your money.", accent: "Understand your money.", image: require("../assets/tutorial/adviser.png"), description: "Illustrative Clover conversation explaining a change in food spending." },
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
  // Fit the complete cropped artwork; larger text can scroll independently of the actions.
  const artworkHeight = Math.max(180, Math.min(520, height - insets.top - insets.bottom - 280 - Math.max(0, fontScale - 1) * 80));
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
        <Text style={s.wordmark}>clover</Text>
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
            <Image source={slide.image} accessibilityLabel={slide.description} resizeMode="contain"
              style={{ width: Math.min(pageWidth - 48, 380), height: artworkHeight, alignSelf: "center" }} />
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
  wordmark: { color: "#03abc2", fontSize: 22, fontFamily: "Poppins-SemiBold" },
  slide: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 16, paddingBottom: 6 },
  title: { color: "#17363d", fontSize: 26, lineHeight: 33, textAlign: "center", fontFamily: "Poppins-SemiBold", maxWidth: 430 },
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
