"use client";

import { useEffect, useRef, useState } from "react";

export function LandingCloverBloom() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) {
          return;
        }

        setIsVisible(true);
        observer.disconnect();
      },
      { threshold: 0.45 },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`landing-bloom ${isVisible ? "is-visible" : ""}`.trim()} aria-hidden="true">
      <svg className="landing-bloom__mark" viewBox="0 0 124 124" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          className="landing-bloom__leaf landing-bloom__leaf--top-left"
          d="M0 40C0 28.9543 8.9543 20 20 20C20 8.9543 28.9543 0 40 0C51.0457 0 60 8.9543 60 20V60H20C8.9543 60 0 51.0457 0 40Z"
          fill="url(#landing-bloom-gradient-a)"
        />
        <path
          className="landing-bloom__leaf landing-bloom__leaf--bottom-left"
          d="M40 124C28.9543 124 20 115.046 20 104C8.9543 104 0 95.0457 0 84C0 72.9543 8.9543 64 20 64H60V104C60 115.046 51.0457 124 40 124Z"
          fill="url(#landing-bloom-gradient-b)"
        />
        <path
          className="landing-bloom__leaf landing-bloom__leaf--bottom-right"
          d="M124 84C124 95.0457 115.046 104 104 104C104 115.046 95.0457 124 84 124C72.9543 124 64 115.046 64 104V64H104C115.046 64 124 72.9543 124 84Z"
          fill="url(#landing-bloom-gradient-c)"
        />
        <path
          className="landing-bloom__leaf landing-bloom__leaf--top-right"
          d="M124 40C124 51.0457 112.807 60 99 60C94.5563 60 90.3837 59.0716 86.7676 57.4453L84.0713 60.1426L75.4639 51.5352L88 39L85.1719 36.1719L72.6357 48.707L64 40.0713L66.6416 37.4287C64.9604 33.7678 64 29.524 64 25C64 11.1929 72.9543 0 84 0H124V40Z"
          fill="url(#landing-bloom-gradient-d)"
        />
        <defs>
          <linearGradient id="landing-bloom-gradient-a" x1="0" y1="0" x2="60" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0.5" stopColor="#03A8C0" />
            <stop offset="1" stopColor="#00DFFF" />
          </linearGradient>
          <linearGradient id="landing-bloom-gradient-b" x1="60" y1="64" x2="0" y2="124" gradientUnits="userSpaceOnUse">
            <stop stopColor="#00DFFF" />
            <stop offset="0.5" stopColor="#03A8C0" />
          </linearGradient>
          <linearGradient id="landing-bloom-gradient-c" x1="64" y1="64" x2="124" y2="124" gradientUnits="userSpaceOnUse">
            <stop stopColor="#00DFFF" />
            <stop offset="0.5" stopColor="#03A8C0" />
          </linearGradient>
          <linearGradient id="landing-bloom-gradient-d" x1="124" y1="0" x2="64" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6EE7B7" />
            <stop offset="1" stopColor="#7EF0C2" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
