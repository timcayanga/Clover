"use client";

import { useEffect, useMemo, useState } from "react";
import type { AccountBrand } from "@/lib/account-brand";

export function AccountBrandMark({ accountBrand, label }: { accountBrand: AccountBrand; label: string }) {
  const [failed, setFailed] = useState(false);
  const [logoIndex, setLogoIndex] = useState(0);
  const logoCandidates = useMemo(
    () => (accountBrand.logoSrcs.length ? accountBrand.logoSrcs : accountBrand.logoSrc ? [accountBrand.logoSrc] : []),
    [accountBrand.logoSrc, accountBrand.logoSrcs]
  );
  const currentLogoSrc = logoCandidates[logoIndex] ?? null;
  const hasBrandLogo = Boolean(accountBrand.logoSrcs.length || accountBrand.logoSrc);
  const logoResetKey = useMemo(
    () => `${accountBrand.logoSrc ?? ""}::${accountBrand.logoSrcs.join("|")}::${accountBrand.fallbackIconSrc}::${label}`,
    [accountBrand.fallbackIconSrc, accountBrand.logoSrc, accountBrand.logoSrcs, label]
  );
  const parseHexColor = (value: string) => {
    const normalized = value.trim().replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(normalized)) {
      return null;
    }

    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16),
    };
  };

  const getColorLuminance = (value: string) => {
    const parsed = parseHexColor(value);
    if (!parsed) {
      return 0.5;
    }

    const channels = [parsed.r, parsed.g, parsed.b].map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });

    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };

  const parseColorToken = (value: string) => {
    const trimmed = value.trim();
    const rgbaMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i);
    if (!rgbaMatch) {
      const hexMatch = trimmed.match(/#([0-9a-f]{6})/i);
      return hexMatch?.[1]
        ? { r: Number.parseInt(hexMatch[1].slice(0, 2), 16), g: Number.parseInt(hexMatch[1].slice(2, 4), 16), b: Number.parseInt(hexMatch[1].slice(4, 6), 16), a: 1 }
        : null;
    }

    const parts = rgbaMatch[1].split(",").map((part) => part.trim());
    if (parts.length < 3) {
      return null;
    }

    const r = Number.parseFloat(parts[0] ?? "");
    const g = Number.parseFloat(parts[1] ?? "");
    const b = Number.parseFloat(parts[2] ?? "");
    const a = parts.length >= 4 ? Number.parseFloat(parts[3] ?? "1") : 1;

    if ([r, g, b, a].some((value) => Number.isNaN(value))) {
      return null;
    }

    return { r, g, b, a };
  };

  const getBackgroundLuminance = (background: string) => {
    const tokens = Array.from(background.matchAll(/rgba?\([^)]+\)|#[0-9a-f]{6}/gi));
    const colors = tokens
      .map((match) => parseColorToken(match[0] ?? ""))
      .filter((value): value is NonNullable<ReturnType<typeof parseColorToken>> => Boolean(value));

    if (!colors.length) {
      return null;
    }

    const composite = colors.map((color) => {
      const alpha = typeof color.a === "number" ? color.a : 1;
      const red = Math.round(color.r * alpha + 255 * (1 - alpha));
      const green = Math.round(color.g * alpha + 255 * (1 - alpha));
      const blue = Math.round(color.b * alpha + 255 * (1 - alpha));
      return getColorLuminance(
        `#${[red, green, blue]
          .map((channel) => channel.toString(16).padStart(2, "0"))
          .join("")}`
      );
    });

    return composite.reduce((sum, value) => sum + value, 0) / composite.length;
  };

  const shouldUseLightFallback =
    accountBrand.foreground.trim().toLowerCase() === "#f8fafc" ||
    (getBackgroundLuminance(accountBrand.background) ?? getColorLuminance(accountBrand.foreground ?? "#0f172a")) < 0.46;

  useEffect(() => {
    setFailed(false);
    setLogoIndex(0);
  }, [logoResetKey]);

  useEffect(() => {
    const sources = [currentLogoSrc, accountBrand.fallbackIconSrc].filter((source): source is string => Boolean(source));
    for (const source of sources) {
      const image = new Image();
      image.loading = "eager";
      image.fetchPriority = "high";
      image.decoding = "async";
      image.src = source;
    }
  }, [accountBrand.fallbackIconSrc, currentLogoSrc, logoResetKey]);

  return (
    <span
      className={`accounts-brand-mark${shouldUseLightFallback ? " is-light-fallback" : ""}`}
      style={{
        background: accountBrand.background,
        color: accountBrand.foreground,
        boxShadow: `inset 0 0 0 1px ${accountBrand.accent}30`,
      }}
      title={accountBrand.label}
    >
      {currentLogoSrc && !failed ? (
        <img
          className="accounts-brand-mark__logo"
          src={currentLogoSrc}
          alt={label}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => {
            if (logoIndex < logoCandidates.length - 1) {
              setLogoIndex((current) => Math.min(current + 1, logoCandidates.length - 1));
            } else {
              setFailed(true);
            }
          }}
        />
      ) : accountBrand.fallbackIconSrc ? (
        <img
          className="accounts-brand-mark__fallback"
          src={accountBrand.fallbackIconSrc}
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <svg
          className={hasBrandLogo ? "accounts-brand-mark__logo-fallback" : "accounts-brand-mark__fallback"}
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 10.5 12 4l9 6.5" />
          <path d="M5 20h14" />
          <path d="M6.5 10.5V17" />
          <path d="M12 10.5V17" />
          <path d="M17.5 10.5V17" />
        </svg>
      )}
    </span>
  );
}
