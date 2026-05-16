"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const STAGING_HOSTNAME = "staging.clover.ph";
const RESET_MARKER_KEY = "clover.staging-browser-state-reset.v1";
const STAY_SIGNED_IN_KEY = "clover.staging.keep-signed-in.v1";

const COOKIE_PREFIXES = ["__clerk_", "__client_uat"];
const WINDOW_NAME_MARKER = "clover-staging-browser-state-reset:v1";

const deleteCookie = (name: string) => {
  const expires = "Thu, 01 Jan 1970 00:00:00 GMT";
  const base = `${name}=; expires=${expires}; path=/`;
  const host = window.location.hostname;
  const domain = host === STAGING_HOSTNAME || host.endsWith(`.${STAGING_HOSTNAME}`) ? `; domain=${host}` : "";

  document.cookie = base;
  document.cookie = `${base}${domain}`;

  if (host.endsWith(".clover.ph")) {
    document.cookie = `${base}; domain=.clover.ph`;
  }
};

const clearBrowserState = () => {
  const cookieNames = document.cookie
    .split(";")
    .map((entry) => entry.split("=")[0]?.trim())
    .filter(Boolean);

  for (const cookieName of cookieNames) {
    if (COOKIE_PREFIXES.some((prefix) => cookieName.startsWith(prefix))) {
      deleteCookie(cookieName);
    }
  }

  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("clerk") || key.startsWith("__clerk")) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Best effort only.
  }

  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith("clerk") || key.startsWith("__clerk")) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Best effort only.
  }
};

export function StagingBrowserStateReset() {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    if (window.location.hostname !== STAGING_HOSTNAME) {
      return;
    }

    const isPublicLandingRoute =
      pathname === "/" ||
      pathname.startsWith("/features") ||
      pathname.startsWith("/pricing") ||
      pathname.startsWith("/help") ||
      pathname.startsWith("/privacy-policy") ||
      pathname.startsWith("/terms-of-service") ||
      pathname.startsWith("/sign-in") ||
      pathname.startsWith("/sign-up") ||
      pathname.startsWith("/sign-out") ||
      pathname.startsWith("/sso-callback") ||
      pathname.startsWith("/onboarding");

    if (!isPublicLandingRoute) {
      return;
    }

    try {
      if (window.localStorage.getItem(STAY_SIGNED_IN_KEY) === "true") {
        return;
      }
    } catch {
      // If storage is blocked, proceed with the cleanup once.
    }

    if (window.name.includes(WINDOW_NAME_MARKER)) {
      return;
    }

    window.name = window.name ? `${window.name}|${WINDOW_NAME_MARKER}` : WINDOW_NAME_MARKER;

    try {
      if (window.sessionStorage.getItem(RESET_MARKER_KEY) === "done") {
        return;
      }
      window.sessionStorage.setItem(RESET_MARKER_KEY, "done");
    } catch {
      // If storage is blocked, still proceed with the cleanup once.
    }

    clearBrowserState();
    window.location.reload();
  }, [pathname]);

  return null;
}
