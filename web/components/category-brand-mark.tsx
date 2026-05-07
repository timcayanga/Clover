"use client";

import { getCategoryIconSrc, getCategoryIconTone } from "@/lib/category-icons";

type CategoryBrandMarkProps = {
  categoryName: string;
  size?: number | string;
  radius?: number | string;
  className?: string;
};

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

const parseCssColor = (value: string) => {
  const hex = parseHexColor(value);
  if (hex) {
    return { ...hex, alpha: 1 };
  }

  const rgba = value
    .trim()
    .match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i);

  if (!rgba) {
    return null;
  }

  return {
    r: Number.parseInt(rgba[1], 10),
    g: Number.parseInt(rgba[2], 10),
    b: Number.parseInt(rgba[3], 10),
    alpha: rgba[4] ? Number.parseFloat(rgba[4]) : 1,
  };
};

const getColorLuminance = (value: string) => {
  const parsed = parseCssColor(value);
  if (!parsed) {
    return 0.5;
  }

  const blend = (channel: number) => Math.round(channel * parsed.alpha + 255 * (1 - parsed.alpha));

  const channels = [blend(parsed.r), blend(parsed.g), blend(parsed.b)].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

export function CategoryBrandMark({ categoryName, size = 24, radius = 8, className }: CategoryBrandMarkProps) {
  const tone = getCategoryIconTone(categoryName);
  const useLightForeground = getColorLuminance(tone.backgroundColor) < 0.28;
  const iconSrc = getCategoryIconSrc(categoryName);

  return (
    <span
      className={`category-brand-mark${useLightForeground ? " is-light-foreground" : ""}${className ? ` ${className}` : ""}`}
      style={{
        width: typeof size === "number" ? `${size}px` : size,
        height: typeof size === "number" ? `${size}px` : size,
        borderRadius: typeof radius === "number" ? `${radius}px` : radius,
        backgroundColor: tone.backgroundColor,
        borderColor: tone.borderColor,
      }}
      title={categoryName}
      aria-hidden="true"
    >
      <img src={iconSrc} alt="" aria-hidden="true" loading="lazy" />
    </span>
  );
}
