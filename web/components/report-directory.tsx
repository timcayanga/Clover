"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
export function ReportDirectory({
  children,
  scope,
}: {
  children: ReactNode;
  scope: string;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [headings, setHeadings] = useState<HTMLHeadingElement[]>([]);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const update = () => {
      const next = Array.from(
        root.querySelectorAll<HTMLHeadingElement>(".report-v2-panel > h2"),
      );
      setHeadings((old) =>
        old.length === next.length && old.every((e, i) => e === next[i])
          ? old
          : next,
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [scope]);
  return (
    <>
      <label className="report-v2-search">
        Jump to a report
        <select
          aria-label="Jump to a report"
          value=""
          onChange={(e) => {
            const heading = headings[Number(e.target.value)];
            if (heading) {
              heading.tabIndex = -1;
              heading.focus({ preventScroll: true });
              heading.scrollIntoView({
                block: "start",
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
              });
            }
          }}
        >
          <option value="">Choose a report</option>
          {headings.map((h, i) => (
            <option key={i} value={i}>
              {[
                h
                  .closest("[data-report-currency]")
                  ?.getAttribute("data-report-currency"),
                h.textContent,
              ]
                .filter(Boolean)
                .join(" · ")}
            </option>
          ))}
        </select>
      </label>
      <div ref={ref}>{children}</div>
    </>
  );
}
