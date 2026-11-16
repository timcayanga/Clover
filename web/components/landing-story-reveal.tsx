"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type LandingStoryRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "article";
  id?: string;
  initialVisible?: boolean;
};

export function LandingStoryReveal({
  children,
  className = "",
  delay = 0,
  as = "section",
  id,
  initialVisible = false,
}: LandingStoryRevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(initialVisible);
  const Tag = as;

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.35)),
      { threshold: [0, 0.35], rootMargin: "-12% 0px -12% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      id={id}
      className={`landing-story-reveal ${isVisible ? "is-visible" : ""} ${className}`.trim()}
      style={{ "--story-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
