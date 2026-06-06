"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const STAGING_HOSTNAME = "staging.clover.ph";
const RESET_MARKER_KEY = "clover.staging-browser-state-reset.v2";
const DEPLOYMENT_MARKER_KEY = "clover.staging.deployment-marker.v1";
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

const clearBrowserState = ({ clearAuth }: { clearAuth: boolean }) => {
  const preservedKeys = new Set([STAY_SIGNED_IN_KEY, DEPLOYMENT_MARKER_KEY]);

  if (clearAuth) {
    const cookieNames = document.cookie
      .split(";")
      .map((entry) => entry.split("=")[0]?.trim())
      .filter(Boolean);

    for (const cookieName of cookieNames) {
      if (COOKIE_PREFIXES.some((prefix) => cookieName.startsWith(prefix))) {
        deleteCookie(cookieName);
      }
    }
  }

  try {
    for (const key of Object.keys(window.localStorage)) {
      if (preservedKeys.has(key)) {
        continue;
      }
      const isAuthKey = key.startsWith("clerk") || key.startsWith("__clerk");
      const isAppKey = key.startsWith("clover.");
      if ((clearAuth && isAuthKey) || isAppKey) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Best effort only.
  }

  try {
    for (const key of Object.keys(window.sessionStorage)) {
      const isAuthKey = key.startsWith("clerk") || key.startsWith("__clerk");
      const isAppKey = key.startsWith("clover.");
      if ((clearAuth && isAuthKey) || isAppKey) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Best effort only.
  }
};

type StagingBrowserStateResetProps = {
  buildId: string;
  deploymentId: string | null;
  gitSha: string | null;
};

const getBuildMarker = ({ buildId, deploymentId, gitSha }: StagingBrowserStateResetProps) =>
  [deploymentId, buildId, gitSha].filter(Boolean).join(":");

export function StagingBrowserStateReset(props: StagingBrowserStateResetProps) {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    if (window.location.hostname !== STAGING_HOSTNAME) {
      return;
    }

    const buildMarker = getBuildMarker(props) || "unknown";
    const sessionResetMarkerKey = `${RESET_MARKER_KEY}:${buildMarker}`;

    const isPublicLandingRoute =
      pathname === "/" ||
      pathname.startsWith("/features") ||
      pathname.startsWith("/pricing") ||
      pathname.startsWith("/help") ||
      pathname.startsWith("/privacy-policy") ||
      pathname.startsWith("/terms-of-service") ||
      pathname.startsWith("/sign-in") ||
      pathname.startsWith("/sign-up") ||
      pathname.startsWith("/sso-callback") ||
      pathname.startsWith("/onboarding");

    let keepSignedIn = false;

    try {
      keepSignedIn = window.localStorage.getItem(STAY_SIGNED_IN_KEY) === "true";
    } catch {
      // If storage is blocked, proceed with the cleanup once.
    }

    try {
      const previousBuildMarker = window.localStorage.getItem(DEPLOYMENT_MARKER_KEY);
      if (previousBuildMarker !== buildMarker) {
        window.localStorage.setItem(DEPLOYMENT_MARKER_KEY, buildMarker);

        if (window.sessionStorage.getItem(sessionResetMarkerKey) !== "done") {
          window.sessionStorage.setItem(sessionResetMarkerKey, "done");
          clearBrowserState({ clearAuth: !keepSignedIn });
          window.location.reload();
          return;
        }
      }
    } catch {
      // If storage is blocked, fall back to the route-level cleanup below.
    }

    if (!isPublicLandingRoute || keepSignedIn) {
      return;
    }

    const windowMarker = `${WINDOW_NAME_MARKER}:${buildMarker}`;

    if (window.name.includes(windowMarker)) {
      return;
    }

    window.name = window.name ? `${window.name}|${windowMarker}` : windowMarker;

    try {
      if (window.sessionStorage.getItem(sessionResetMarkerKey) === "done") {
        return;
      }
      window.sessionStorage.setItem(sessionResetMarkerKey, "done");
    } catch {
      // If storage is blocked, still proceed with the cleanup once.
    }

    clearBrowserState({ clearAuth: true });
    window.location.reload();
  }, [pathname, props.buildId, props.deploymentId, props.gitSha]);

  return null;
}
