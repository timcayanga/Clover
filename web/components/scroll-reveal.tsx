"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "article" | "header";
};

export function ScrollReveal({ children, className = "", delay = 0, as = "div" }: ScrollRevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    let settled = false;
    const reveal = () => {
      if (settled) {
        return;
      }

      settled = true;
      element.classList.add("is-visible");
      observer.unobserve(element);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          reveal();
        }
      },
      {
        threshold: 0.18,
        rootMargin: "0px 0px -8% 0px",
      }
    );

    observer.observe(element);
    const timeout = window.setTimeout(reveal, Math.max(150, delay + 120));

    return () => {
      settled = true;
      window.clearTimeout(timeout);
      observer.disconnect();
    };
  }, []);

  const Tag = as as any;

  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`.trim()}
      style={{ ["--reveal-delay" as never]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
