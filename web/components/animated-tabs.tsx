"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type AnimatedTabItem = {
  key: string;
  label: ReactNode;
  disabled?: boolean;
  badge?: ReactNode;
  ariaLabel?: string;
};

type AnimatedTabsProps = {
  tabs: AnimatedTabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
};

export function AnimatedTabs({ tabs, activeKey, onChange, className }: AnimatedTabsProps) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement | HTMLAnchorElement>());
  const [indicator, setIndicator] = useState({ left: 0, width: 0, visible: false });

  const activeTab = useMemo(() => tabs.find((tab) => tab.key === activeKey) ?? tabs[0] ?? null, [activeKey, tabs]);

  useLayoutEffect(() => {
    const activeElement = activeKey ? tabRefs.current.get(activeKey) : null;
    if (!activeElement) {
      setIndicator((current) => ({ ...current, visible: false }));
      return;
    }

    setIndicator({
      left: activeElement.offsetLeft,
      width: activeElement.offsetWidth,
      visible: true,
    });
  }, [activeKey, tabs]);

  useEffect(() => {
    const handleResize = () => {
      const activeElement = activeKey ? tabRefs.current.get(activeKey) : null;
      if (!activeElement) {
        return;
      }

      setIndicator({
        left: activeElement.offsetLeft,
        width: activeElement.offsetWidth,
        visible: true,
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeKey]);

  return (
    <nav className={["animated-tabs", className].filter(Boolean).join(" ")} aria-label={activeTab?.ariaLabel ?? "Tabs"}>
      <span
        className="animated-tabs__indicator"
        style={{
          width: indicator.width,
          transform: `translateX(${indicator.left}px)`,
          opacity: indicator.visible ? 1 : 0,
        }}
        aria-hidden="true"
      />
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            ref={(node) => {
              if (node) {
                tabRefs.current.set(tab.key, node);
              } else {
                tabRefs.current.delete(tab.key);
              }
            }}
            type="button"
            className={`animated-tabs__tab${isActive ? " is-active" : ""}${tab.disabled ? " is-disabled" : ""}`}
            onClick={() => {
              if (!tab.disabled) {
                onChange(tab.key);
              }
            }}
            disabled={tab.disabled}
            aria-current={isActive ? "page" : undefined}
            aria-label={tab.ariaLabel}
          >
            <span className="animated-tabs__label">{tab.label}</span>
            {tab.badge ? <span className="animated-tabs__badge">{tab.badge}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
