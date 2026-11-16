"use client";

import { useEffect, useState } from "react";
import {
  defaultCurrencyChangedEventName,
  fallbackDefaultCurrency,
  normalizeDefaultCurrency,
  readDefaultCurrency,
  regionalPreferencesStorageKey,
} from "@/lib/regional-preferences";

export const useDefaultCurrency = () => {
  const [currency, setCurrency] = useState(fallbackDefaultCurrency);

  useEffect(() => {
    setCurrency(readDefaultCurrency());

    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<{ currency?: string }>).detail;
      setCurrency(normalizeDefaultCurrency(detail?.currency));
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === regionalPreferencesStorageKey) {
        setCurrency(readDefaultCurrency());
      }
    };

    window.addEventListener(defaultCurrencyChangedEventName, handleChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(defaultCurrencyChangedEventName, handleChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return currency;
};

