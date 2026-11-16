"use client";

import { useEffect, useMemo, useState } from "react";
import { getCategoryIconSrc } from "@/lib/category-icons";

type CategoryBrandMarkProps = {
  categoryName: string;
  size?: number | string;
  radius?: number | string;
  className?: string;
};

export function CategoryBrandMark({ categoryName, size = 24, radius = 8, className }: CategoryBrandMarkProps) {
  const iconSrc = getCategoryIconSrc(categoryName);
  const [didFail, setDidFail] = useState(false);
  const fallbackIconSrc = "/figma-icons/categories/uncategorized.svg";
  const resolvedIconSrc = didFail ? fallbackIconSrc : iconSrc;
  const resetKey = useMemo(() => `${categoryName}::${iconSrc}`, [categoryName, iconSrc]);

  useEffect(() => {
    setDidFail(false);
  }, [resetKey]);

  useEffect(() => {
    const image = new Image();
    image.loading = "eager";
    image.fetchPriority = "high";
    image.decoding = "async";
    image.src = resolvedIconSrc;
  }, [resolvedIconSrc]);

  return (
    <span
      className={`category-brand-mark category-brand-mark--figma${className ? ` ${className}` : ""}`}
      style={{
        width: typeof size === "number" ? `${size}px` : size,
        height: typeof size === "number" ? `${size}px` : size,
        borderRadius: typeof radius === "number" ? `${radius}px` : radius,
      }}
      title={categoryName}
      aria-hidden="true"
    >
      <img
        className="category-brand-mark__glyph-icon"
        src={resolvedIconSrc}
        alt=""
        aria-hidden="true"
        loading="eager"
        fetchPriority="high"
        decoding="async"
        onError={() => {
          if (!didFail) {
            setDidFail(true);
          }
        }}
      />
    </span>
  );
}
