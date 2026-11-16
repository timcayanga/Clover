"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import {
  normalizeRegionalPreferences,
  persistRegionalPreferences,
  type RegionalPreferences,
} from "@/lib/regional-preferences";

const sessionKeyPrefix = "clover.regional-preferences-synced.v1";

const hasSyncedThisSession = (key: string) => {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

const markSyncedThisSession = (key: string) => {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Regional defaults still work when private browsing disables session storage.
  }
};

export function RegionalPreferencesSync() {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) {
      return;
    }

    const sessionKey = `${sessionKeyPrefix}:${user.id}`;
    if (hasSyncedThisSession(sessionKey)) {
      return;
    }

    const controller = new AbortController();
    void fetch("/api/settings/regional", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        return response.json() as Promise<{ regionalPreferences?: RegionalPreferences | null }>;
      })
      .then((payload) => {
        if (payload?.regionalPreferences) {
          persistRegionalPreferences(normalizeRegionalPreferences(payload.regionalPreferences));
        }
        markSyncedThisSession(sessionKey);
      })
      .catch(() => null);

    return () => controller.abort();
  }, [isLoaded, isSignedIn, user?.id]);

  return null;
}
