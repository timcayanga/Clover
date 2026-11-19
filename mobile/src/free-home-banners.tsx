import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Image, Pressable, ScrollView, View, type ScrollViewInstance } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSession } from "./session";
import { useAccessibilityPreferences } from "./accessibility-preferences";
import { Text } from "./app-text";
import { apiBase } from "./api-base";
import { telemetry } from "../../shared/analytics";
import { HOME_BANNER_INTERVAL_MS, nativeHomeBannerDestination, nextHomeBanner, type VisibleHomeBanner } from "../../shared/home-banners";

export function FreeHomeBanners() {
  const session = useSession(), { reduceMotion } = useAccessibilityPreferences();
  const free = session.data?.entitlement.planTier === "free" && !session.demo;
  const [banners, setBanners] = useState<VisibleHomeBanner[]>([]), [page, setPage] = useState(0), [width, setWidth] = useState(0);
  const [focused, setFocused] = useState(false), [active, setActive] = useState(AppState.currentState === "active"), [paused, setPaused] = useState(false), [touching, setTouching] = useState(false), [error, setError] = useState("");
  const track = useRef<ScrollViewInstance>(null), pageRef = useRef(0); pageRef.current = page;
  useFocusEffect(useCallback(() => {
    if (!free) { setBanners([]); return; }
    let controller: AbortController | null = null;
    setFocused(true);
    const load = () => {
      controller?.abort(); controller = new AbortController(); const current = controller;
      void session.request<{ banners: VisibleHomeBanner[] }>("home-banners", { signal: current.signal }, true).then(result => { if (!current.signal.aborted) { setBanners(result.banners); setPage(0); track.current?.scrollTo({ x: 0, animated: false }); } }).catch(() => { if (!current.signal.aborted) setBanners([]); });
    };
    load();
    const subscription = AppState.addEventListener("change", state => { setActive(state === "active"); if (state === "active") load(); });
    return () => { controller?.abort(); subscription.remove(); setFocused(false); };
  }, [free, session.profileId, session.request]));
  const go = useCallback((index: number) => { setPage(index); track.current?.scrollTo({ x: width * index, animated: !reduceMotion }); }, [width, reduceMotion]);
  useEffect(() => {
    if (!free || !focused || !active || paused || reduceMotion || touching || !width || banners.length < 2) return;
    const timer = setTimeout(() => go(nextHomeBanner(page, banners.length)), HOME_BANNER_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [free, focused, active, paused, reduceMotion, touching, width, banners, page, go]);
  useEffect(() => { track.current?.scrollTo({ x: width * pageRef.current, animated: false }); }, [width]);
  const open = async (banner: VisibleHomeBanner) => {
    const destination = nativeHomeBannerDestination(banner.href); if (!destination) return;
    setError("");
    telemetry("home_banner_clicked", { banner_id: banner.id, banner_kind: banner.kind, destination: banner.href.split("?")[0], placement: "home_below_quick_add" });
    try { if (destination.native) router.push(destination.native as Href); else await WebBrowser.openBrowserAsync(`${apiBase()}${destination.web}`); }
    catch { setError("The offer could not open. Please try again."); }
  };
  if (!free || !banners.length) return null;
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} accessibilityLabel="Clover offers" style={{ gap: 0 }}>
    <ScrollView ref={track} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScrollBeginDrag={() => setTouching(true)} onScrollEndDrag={() => setTouching(false)} onMomentumScrollEnd={event => setPage(Math.max(0, Math.min(banners.length - 1, Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width)))))}>
      {banners.map(banner => <Pressable key={banner.id} accessibilityRole="link" accessibilityLabel={`${banner.title}. ${banner.body}. ${banner.ctaLabel}`} onPress={() => void open(banner)} style={{ width: Math.max(1, width) }}>
        <LinearGradient colors={banner.theme === "mint" ? ["#e6f9ee", "#b6eed9"] : ["#d8f5f6", "#a3ebe5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ minHeight: 172, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: "#b9e8e5", flexDirection: "row", alignItems: "center", gap: 12, overflow: "hidden" }}>
          {banner.imageUrl ? <Image accessible={false} source={{ uri: `${apiBase()}${banner.imageUrl}` }} style={{ position: "absolute", inset: 0, opacity: 0.3 }} resizeMode="cover" /> : null}
          <View accessible={false} style={{ position: "absolute", width: 260, height: 180, bottom: -105, right: -45, borderWidth: 22, borderColor: "#ffffff55", borderRadius: 150, transform: [{ rotate: "-16deg" }] }} />
          <View style={{ flex: 1, gap: 8 }}><Text style={{ color: "#202b37", fontFamily: "Poppins-SemiBold", fontSize: 17, lineHeight: 23 }}>{banner.title}</Text><Text style={{ color: "#202b37", fontSize: 12, lineHeight: 18 }}>{banner.body}</Text><View style={{ alignSelf: "flex-start", backgroundColor: "white", borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 }}><Text style={{ color: "#006a77", fontFamily: "Poppins-Medium", fontSize: 12 }}>{banner.ctaLabel} →</Text></View></View>
          {!banner.imageUrl ? <Image accessible={false} source={{ uri: `${apiBase()}/assets/3d%20icons/navigation/figma-v7/${banner.icon}.webp` }} style={{ width: 64, height: 64 }} resizeMode="contain" /> : null}
        </LinearGradient>
      </Pressable>)}
    </ScrollView>
    {banners.length > 1 ? <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", minHeight: 44 }}>
      {banners.map((banner, index) => <Pressable key={banner.id} accessibilityRole="button" accessibilityLabel={`Show offer ${index + 1}: ${banner.title}`} accessibilityState={{ selected: page === index }} onPress={() => go(index)} style={{ minWidth: 36, minHeight: 44, alignItems: "center", justifyContent: "center" }}><View style={{ width: page === index ? 18 : 6, height: 6, borderRadius: 9, backgroundColor: page === index ? "#00aabd" : "#bacdce" }} /></Pressable>)}
      <Pressable accessibilityRole="button" accessibilityLabel={paused || reduceMotion ? "Play rotating offers" : "Pause rotating offers"} accessibilityState={{ disabled: reduceMotion }} disabled={reduceMotion} onPress={() => setPaused(value => !value)} style={{ position: "absolute", right: 0, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#426168" }}>{paused || reduceMotion ? "▶" : "II"}</Text></Pressable>
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: "#b52e48", fontSize: 12 }}>{error}</Text> : null}
  </View>;
}
