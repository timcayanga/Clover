"use client";
import { useEffect, type RefObject } from "react";

// Fit the whole comparison chapter, never a nested scrolling table. Retain
// normal-size type when it fits, scaling only on shorter mobile viewports.
export function useLandingTableFit(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let frame = 0;
    let disposed = false;
    const update = () => {
      if (disposed) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.current?.querySelectorAll<HTMLElement>("[data-landing-copy]").forEach((chapter) => {
          chapter.style.width = "";
          chapter.style.setProperty("--landing-table-scale", "1");
          if (!chapter.querySelector("table")) return;
          if (innerWidth > 900) return;
          const available = Math.max(1, innerHeight - 148);
          const width = chapter.offsetWidth;
          if (chapter.scrollHeight <= available) return;
          // Preserve the full usable screen width while fitting height. Simply
          // shrinking a narrow column wastes space and makes its text too small.
          let low = 0.3, high = 1;
          for (let i = 0; i < 9; i += 1) {
            const candidate = (low + high) / 2;
            chapter.style.width = `${width / candidate}px`;
            if (chapter.scrollHeight * candidate <= available) low = candidate;
            else high = candidate;
          }
          chapter.style.width = `${width / low}px`;
          chapter.style.setProperty("--landing-table-scale", String(low));
        });
      });
    };
    const observer = new ResizeObserver(update);
    const mutation = new MutationObserver(update);
    if (root.current) {
      root.current.querySelectorAll("[data-landing-copy]").forEach((chapter) => observer.observe(chapter));
      mutation.observe(root.current, { childList: true, subtree: true });
    }
    addEventListener("resize", update);
    document.fonts.ready.then(update);
    update();
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); mutation.disconnect(); removeEventListener("resize", update); };
  }, [root]);
}
