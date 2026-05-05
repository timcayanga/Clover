"use client";

import { useEffect, useState } from "react";
import type { AccountBrand } from "@/lib/account-brand";

const parseHexChannel = (value: string) => Number.parseInt(value, 16) / 255;

const parseRgbChannel = (value: string) => Number.parseInt(value, 10) / 255;

const getRelativeLuminance = (hex: string) => {
  const normalized = hex.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return 0.5;
  }

  const channels = [normalized.slice(0, 2), normalized.slice(2, 4), normalized.slice(4, 6)].map((channel) => {
    const value = parseHexChannel(channel);
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

const getBackgroundLuminance = (background: string) => {
  const normalized = background.trim();
  const hexMatch = normalized.match(/#([0-9a-f]{6})/i);
  if (hexMatch?.[1]) {
    return getRelativeLuminance(`#${hexMatch[1]}`);
  }

  const rgbMatch = normalized.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch?.[1]) {
    const channels = rgbMatch[1]
      .split(",")
      .slice(0, 3)
      .map((channel) => parseRgbChannel(channel.trim()));

    if (channels.length === 3 && channels.every((channel) => Number.isFinite(channel))) {
      const corrected = channels.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
      return corrected[0] * 0.2126 + corrected[1] * 0.7152 + corrected[2] * 0.0722;
    }
  }

  return 0.5;
};

export function AccountBrandMark({ accountBrand, label }: { accountBrand: AccountBrand; label: string }) {
  const [failed, setFailed] = useState(false);
  const [logoIndex, setLogoIndex] = useState(0);
  const logoCandidates = accountBrand.logoSrcs.length ? accountBrand.logoSrcs : accountBrand.logoSrc ? [accountBrand.logoSrc] : [];
  const currentLogoSrc = logoCandidates[logoIndex] ?? null;
  const hasBrandLogo = Boolean(accountBrand.logoSrcs.length || accountBrand.logoSrc);
  const logoResetKey = `${accountBrand.logoSrc ?? ""}::${accountBrand.logoSrcs.join("|")}::${accountBrand.fallbackIconSrc}::${label}`;
  const shouldUseLightFallback = getBackgroundLuminance(accountBrand.background) < 0.42;

  useEffect(() => {
    setFailed(false);
    setLogoIndex(0);
  }, [logoResetKey]);

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
          loading="lazy"
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
          loading="lazy"
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
