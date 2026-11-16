import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Platform } from "react-native";
const Preferences = createContext({ reduceMotion: false, highContrast: false });
export const useAccessibilityPreferences = () => useContext(Preferences);
export function AccessibilityPreferences({ children }: { children: ReactNode }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); });
    if (Platform.OS === "ios") void AccessibilityInfo.isDarkerSystemColorsEnabled().then(value => { if (active) setHighContrast(value); });
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    const contrast = AccessibilityInfo.addEventListener("darkerSystemColorsChanged", setHighContrast);
    if (Platform.OS !== "web") return () => { active = false; motion.remove(); contrast.remove(); };
    const query = window.matchMedia("(prefers-contrast: more), (forced-colors: active)");
    const update = () => setHighContrast(query.matches);
    update(); query.addEventListener("change", update);
    const style = document.createElement("style");
    style.textContent = ':focus-visible{outline:3px solid #007587!important;outline-offset:3px!important} @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}';
    document.head.appendChild(style);
    return () => { active = false; motion.remove(); contrast.remove(); query.removeEventListener("change", update); style.remove(); };
  }, []);
  return <Preferences.Provider value={{ reduceMotion, highContrast }}>{children}</Preferences.Provider>;
}
