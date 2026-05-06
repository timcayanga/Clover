"use client";

type CategoryBrandMarkProps = {
  categoryName: string;
  size?: number | string;
  radius?: number | string;
  className?: string;
};

const getCategoryIconSrc = (categoryName: string) => {
  switch (categoryName.trim().toLowerCase()) {
    case "income":
      return "/category-icons/income.svg";
    case "food & dining":
      return "/category-icons/food.svg";
    case "transport":
      return "/category-icons/transport.svg";
    case "housing":
      return "/category-icons/housing.svg";
    case "bills & utilities":
    case "utilities":
      return "/category-icons/utilities.svg";
    case "travel & lifestyle":
      return "/category-icons/travel.svg";
    case "entertainment":
      return "/category-icons/entertainment.svg";
    case "shopping":
      return "/category-icons/shopping.svg";
    case "health & wellness":
      return "/category-icons/health.svg";
    case "education":
      return "/category-icons/education.svg";
    case "financial":
      return "/category-icons/financial.png";
    case "gifts & donations":
      return "/category-icons/gift.svg";
    case "business":
      return "/category-icons/business.png";
    case "transfers":
      return "/category-icons/transfer.svg";
    case "other":
      return "/category-icons/other.svg";
    case "groceries":
      return "/category-icons/groceries.svg";
    case "medical":
      return "/category-icons/medical.svg";
    case "salary":
      return "/category-icons/salary.svg";
    case "investments":
    case "investment":
      return "/category-icons/investments.svg";
    default:
      return "/category-icons/default.svg";
  }
};

const getCategoryTone = (categoryName: string) => {
  switch (categoryName.trim().toLowerCase()) {
    case "income":
    case "salary":
      return { backgroundColor: "rgba(34, 197, 94, 0.14)", borderColor: "rgba(34, 197, 94, 0.24)" };
    case "food & dining":
    case "groceries":
      return { backgroundColor: "rgba(249, 115, 22, 0.14)", borderColor: "rgba(249, 115, 22, 0.24)" };
    case "transport":
      return { backgroundColor: "rgba(59, 130, 246, 0.14)", borderColor: "rgba(59, 130, 246, 0.24)" };
    case "housing":
      return { backgroundColor: "rgba(168, 85, 247, 0.14)", borderColor: "rgba(168, 85, 247, 0.24)" };
    case "bills & utilities":
    case "utilities":
      return { backgroundColor: "rgba(14, 165, 233, 0.14)", borderColor: "rgba(14, 165, 233, 0.24)" };
    case "travel & lifestyle":
      return { backgroundColor: "rgba(236, 72, 153, 0.14)", borderColor: "rgba(236, 72, 153, 0.24)" };
    case "entertainment":
      return { backgroundColor: "rgba(245, 158, 11, 0.14)", borderColor: "rgba(245, 158, 11, 0.24)" };
    case "shopping":
      return { backgroundColor: "rgba(244, 63, 94, 0.14)", borderColor: "rgba(244, 63, 94, 0.24)" };
    case "health & wellness":
    case "medical":
      return { backgroundColor: "rgba(20, 184, 166, 0.14)", borderColor: "rgba(20, 184, 166, 0.24)" };
    case "education":
      return { backgroundColor: "rgba(234, 179, 8, 0.14)", borderColor: "rgba(234, 179, 8, 0.24)" };
    case "financial":
      return { backgroundColor: "rgba(37, 99, 235, 0.14)", borderColor: "rgba(37, 99, 235, 0.24)" };
    case "gifts & donations":
      return { backgroundColor: "rgba(190, 24, 93, 0.14)", borderColor: "rgba(190, 24, 93, 0.24)" };
    case "business":
      return { backgroundColor: "rgba(100, 116, 139, 0.14)", borderColor: "rgba(100, 116, 139, 0.24)" };
    case "transfers":
      return { backgroundColor: "rgba(6, 182, 212, 0.14)", borderColor: "rgba(6, 182, 212, 0.24)" };
    case "other":
      return { backgroundColor: "rgba(148, 163, 184, 0.14)", borderColor: "rgba(148, 163, 184, 0.24)" };
    case "investments":
    case "investment":
      return { backgroundColor: "rgba(124, 58, 237, 0.14)", borderColor: "rgba(124, 58, 237, 0.24)" };
    default:
      return { backgroundColor: "rgba(3, 168, 192, 0.10)", borderColor: "rgba(3, 168, 192, 0.18)" };
  }
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
  const tone = getCategoryTone(categoryName);
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
