"use client";

import { useEffect } from "react";
import {
  applyHelperTextPreference,
  HELPER_TEXT_STORAGE_KEY,
  readStoredHelperTextPreference,
} from "@/lib/helper-text-preference";

export function HelperTextSync() {
  useEffect(() => {
    applyHelperTextPreference(readStoredHelperTextPreference());
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== HELPER_TEXT_STORAGE_KEY) {
        return;
      }

      applyHelperTextPreference(readStoredHelperTextPreference());
    };

    const handleFocus = () => {
      applyHelperTextPreference(readStoredHelperTextPreference());
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return null;
}
