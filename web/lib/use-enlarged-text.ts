"use client";
import { useEffect, useState } from "react";

// Text-only browser zoom does not change viewport media queries.
export function useEnlargedText() {
  const [enlarged, setEnlarged] = useState(false);
  useEffect(() => {
    const probe = document.createElement("span");
    probe.textContent = "MMMMMMMMMMMMMMMMMMMM";
    probe.setAttribute("aria-hidden", "true");
    Object.assign(probe.style, { position: "fixed", left: "-10000px", opacity: "0", pointerEvents: "none", fontFamily: "monospace", fontSize: "16px", lineHeight: "normal", whiteSpace: "nowrap", width: "max-content" });
    document.body.append(probe);
    const measure = () => {
      const range = document.createRange();
      range.selectNodeContents(probe);
      const rect = range.getBoundingClientRect();
      setEnlarged(rect.height >= 26 || rect.width >= 288);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(probe);
    measure();
    return () => { observer.disconnect(); probe.remove(); };
  }, []);
  return enlarged;
}
