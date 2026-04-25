import type { ReactNode } from "react";

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "article" | "header";
};

export function ScrollReveal({ children, className = "", delay = 0, as = "div" }: ScrollRevealProps) {
  const Tag = as as any;

  return (
    <Tag
      className={`reveal is-visible ${className}`.trim()}
      style={{ ["--reveal-delay" as never]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
