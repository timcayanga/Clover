import { useEffect, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccess } from "../src/access";
import { Icon } from "../src/ui";

const seenKey = "clover.welcome.seen.v1";
const slides = [
  {
    title: "Your money,\nall together.",
    copy: "See your accounts, spending, and balances in one place.",
    label: "My balance",
    value: "₱128,960",
    detail: "Accounts, in one view",
  },
  {
    title: "Less typing.\nMore clarity.",
    copy: "Upload statements, receipts, or screenshots. Clover helps organize the rest.",
    label: "Ready to review",
    value: "24 transactions",
    detail: "You review. Clover learns.",
  },
  {
    title: "Make room for\nwhat matters.",
    copy: "Set a budget and watch your goals grow, one step at a time.",
    label: "Emergency fund",
    value: "₱18,000",
    detail: "60% of your goal",
  },
  {
    title: "Meet your money\ncompanion.",
    copy: "Ask Clover about your finances and find a clearer next step.",
    label: "Ask Clover",
    value: "Can I save more?",
    detail: "Answers grounded in your finances",
  },
];
async function rememberWelcome() {
  try {
    if (Platform.OS === "web") localStorage.setItem(seenKey, "1");
    else await SecureStore.setItemAsync(seenKey, "1");
  } catch {
    /* A storage failure must not prevent authentication. */
  }
}
export default function Welcome() {
  const access = useAccess();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pager = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [exploring, setExploring] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const seen =
          Platform.OS === "web"
            ? localStorage.getItem(seenKey)
            : await SecureStore.getItemAsync(seenKey);
        if (mounted) setExploring(seen !== "1");
      } finally {
        if (mounted) setReady(true);
      }
    })().catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    pager.current?.scrollTo({ x: width * index, animated: false });
  }, [width, index]);
  const go = (next: number) => {
    setIndex(next);
    if (next === slides.length - 1) void rememberWelcome();
  };
  const authenticate = async (signup: boolean) => {
    if (busy || !access.loaded || !access.configured) return;
    setBusy(true);
    setError("");
    await rememberWelcome();
    try {
      await (signup ? access.signUp() : access.signIn());
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to open secure sign-in. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  if (access.active || !ready) return null;
  return (
    <LinearGradient
      colors={["#f0fafb", "#f7fcfc", "#e5f7f5"]}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 12 }}>
        <View style={s.brand}>
          <Image
            source={require("../assets/welcome-clover.png")}
            style={{ width: 34, height: 34 }}
          />
          <Text style={s.wordmark}>clover</Text>
        </View>
        {exploring ? (
          <>
            <ScrollView
              ref={pager}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) =>
                go(
                  Math.max(
                    0,
                    Math.min(
                      3,
                      Math.round(event.nativeEvent.contentOffset.x / width),
                    ),
                  ),
                )
              }
            >
              {slides.map((slide, i) => (
                <View
                  key={slide.title}
                  style={{ width, paddingHorizontal: 24 }}
                  aria-hidden={i !== index}
                  accessibilityElementsHidden={i !== index}
                  importantForAccessibility={
                    i === index ? "auto" : "no-hide-descendants"
                  }
                >
                  <View
                    style={s.illustration}
                    accessibilityLabel={`Illustrative sample: ${slide.label}, ${slide.value}. ${slide.detail}`}
                  >
                    <Image
                      source={require("../assets/welcome-clover.png")}
                      style={{ width: 54, height: 54 }}
                    />
                    <Text style={s.label}>{slide.label}</Text>
                    <Text style={s.value}>{slide.value}</Text>
                    <LinearGradient
                      colors={["#03a8c0", "#5ed3d0"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{
                        height: 8,
                        borderRadius: 4,
                        width: i === 2 ? "60%" : "90%",
                      }}
                    />
                    <Text style={s.detail}>{slide.detail}</Text>
                  </View>
                  <Text accessibilityRole="header" style={s.title}>
                    {slide.title}
                  </Text>
                  <Text style={s.copy}>{slide.copy}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={s.dots}>
              {slides.map((slide, i) => (
                <Pressable
                  key={slide.title}
                  accessibilityRole="button"
                  accessibilityLabel={`Welcome ${i + 1}: ${slide.title.replace("\n", " ")}`}
                  accessibilityState={{ selected: i === index }}
                  onPress={() => go(i)}
                  style={s.dotTarget}
                >
                  <View
                    style={[
                      s.dot,
                      { backgroundColor: i === index ? "#03a8c0" : "#c6dfe1" },
                    ]}
                  />
                </Pressable>
              ))}
            </View>
            <Text accessibilityLiveRegion="polite" style={s.progress}>
              {index + 1} of 4 · Swipe to explore
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (index < 3) go(index + 1);
                else {
                  setExploring(false);
                  void rememberWelcome();
                }
              }}
              style={s.next}
            >
              <Text style={s.link}>{index < 3 ? "Next" : "Get started"}</Text>
            </Pressable>
          </>
        ) : (
          <View style={{ padding: 24 }}>
            <Text style={s.title}>Welcome to Clover</Text>
            <Text style={s.copy}>Your money, all together.</Text>
            <Pressable
              accessibilityRole="button"
              style={s.next}
              onPress={() => {
                setIndex(0);
                setExploring(true);
              }}
            >
              <Text style={s.link}>Explore Clover</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      <View style={s.actions}>
        {error ? (
          <Text accessibilityRole="alert" style={{ color: "#ae303b" }}>
            {error}
          </Text>
        ) : null}
        {!access.configured ? (
          <Text style={s.detail}>
            Account connection isn’t configured in this build. Explore fictional
            sample data below.
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled: busy || !access.loaded || !access.configured,
          }}
          disabled={busy || !access.loaded || !access.configured}
          onPress={() => void authenticate(true)}
          style={{ opacity: busy || !access.configured ? 0.5 : 1 }}
        >
          <LinearGradient
            colors={["#03a8c0", "#5ed3d0"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.button}
          >
            <Text style={[s.label, { color: "white" }]}>
              {busy ? "Opening secure sign-in…" : "Sign up"}
            </Text>
          </LinearGradient>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy || !access.loaded || !access.configured}
          onPress={() => void authenticate(false)}
          style={[s.button, { backgroundColor: "white" }]}
        >
          <Text style={s.label}>Log in</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={access.enterDemo}
          style={s.next}
        >
          <Text style={s.link}>Explore sample Clover</Text>
        </Pressable>
      </View>
      <View
        style={[s.navigation, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        {(
          [
            ["Home", "home-outline"],
            ["Transactions", "swap-horizontal-outline"],
            ["Add", "add"],
            ["Adviser", "chatbubble-ellipses-outline"],
            ["Account", "person-outline"],
          ] as const
        ).map(([label, icon]) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={`${label}, log in required`}
            disabled={busy || !access.loaded || !access.configured}
            onPress={() => void authenticate(false)}
            style={{ flex: 1, alignItems: "center", minHeight: 44, gap: 4 }}
          >
            <Icon name={icon} size={28} color="#007f90" />
            <Text style={s.navLabel}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </LinearGradient>
  );
}
const s = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: 8, padding: 24 },
  wordmark: { color: "#03abc2", fontSize: 25, fontFamily: "Poppins-SemiBold" },
  illustration: {
    backgroundColor: "#e0f7f5",
    borderRadius: 28,
    minHeight: 280,
    padding: 22,
    gap: 14,
    justifyContent: "center",
  },
  label: { color: "#0f262e", fontSize: 15, fontFamily: "Poppins-Medium" },
  value: { color: "#0f262e", fontSize: 27, fontFamily: "Poppins-SemiBold" },
  detail: { color: "#596e78", fontSize: 12, fontFamily: "Poppins-Regular" },
  title: {
    color: "#0f262e",
    fontSize: 26,
    textAlign: "center",
    fontFamily: "Poppins-SemiBold",
    marginTop: 26,
  },
  copy: {
    color: "#596e78",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    fontFamily: "Poppins-Regular",
    marginTop: 12,
    minHeight: 66,
  },
  dots: { flexDirection: "row", justifyContent: "center" },
  dotTarget: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  progress: { textAlign: "center", color: "#596e78", fontSize: 11 },
  next: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  link: { color: "#007f90", fontFamily: "Poppins-Medium", fontSize: 13 },
  actions: { paddingHorizontal: 24, gap: 10, marginTop: "auto" },
  button: {
    minHeight: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  navigation: {
    flexDirection: "row",
    paddingTop: 12,
    backgroundColor: "#f8fafb",
    borderTopColor: "#dce9eb",
    borderTopWidth: 1,
  },
  navLabel: { fontSize: 10, color: "#637085" },
});
