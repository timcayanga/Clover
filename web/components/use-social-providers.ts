"use client";

import { useSyncExternalStore } from "react";
import { getSocialProviders, isAndroidDevice } from "@/lib/social-providers";

const subscribe = () => () => {};
// Render Google only until the browser is known, avoiding an Apple flash on Android.
const getServerSnapshot = () => true;

function getSnapshot() {
  const browser = navigator as Navigator & { userAgentData?: { platform?: string } };
  return isAndroidDevice(browser.userAgent, browser.userAgentData?.platform);
}

export function useSocialProviders() {
  return getSocialProviders(useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot));
}
