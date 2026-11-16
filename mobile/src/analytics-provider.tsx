import { useEffect, useState } from "react";
import { usePathname } from "expo-router";
import { AppState } from "react-native";
import { initializeNativeAnalytics, flushNativeAnalytics } from "./analytics";
import { safeRoute, telemetry, setTelemetryContext } from "../../shared/analytics";
export function NativeAnalytics() {
  const path = usePathname();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    const initialize = () => { void initializeNativeAnalytics().then(ok => { if (active && ok) setReady(true); }); };
    initialize();
    // Retries also cover first launch offline without delaying the UI.
    const retry = setInterval(initialize, 60000);
    const listener = AppState.addEventListener("change", state => {
      if (state === "active") initialize();
      else flushNativeAnalytics();
    });
    return () => { active = false; clearInterval(retry); listener.remove(); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const screen = safeRoute(path);
    setTelemetryContext({ screen });
    telemetry("screen_viewed", { screen });
    const form = /\/(add|new|edit|auth|onboarding)(\/|$)/.test(screen);
    if (form) telemetry("form_opened", { screen, phase: "screen" });
    let started = Date.now(), duration = 0;
    let foreground = AppState.currentState === "active";
    const listener = AppState.addEventListener("change", state => {
      if (foreground) duration += Date.now() - started;
      foreground = state === "active";
      started = Date.now();
    });
    return () => {
      listener.remove();
      if (form) telemetry("form_closed", { screen, phase: "screen", completion_inferred: false });
      telemetry("screen_engagement", { screen, duration_ms: duration + (foreground ? Date.now() - started : 0) });
    };
  }, [path, ready]);
  return null;
}
