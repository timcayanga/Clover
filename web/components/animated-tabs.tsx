"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

type AnimatedTab = {
  key: string;
  label: string;
  badge?: string | null;
  disabled?: boolean;
  ariaLabel?: string | null;
};

type AnimatedTabsProps = {
  className?: string;
  activeKey: string;
  onChange: (key: string) => void;
  tabs: AnimatedTab[];
};

export function AnimatedTabs({ className, activeKey, onChange, tabs }: AnimatedTabsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const [indicator, setIndicator] = useState({ left: 0, width: 0, opacity: 0 });

  const activeTab = useMemo(() => tabs.find((tab) => tab.key === activeKey) ?? tabs[0] ?? null, [activeKey, tabs]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const activeButton = activeTab ? tabRefs.current.get(activeTab.key) ?? null : null;

    if (!container || !activeButton) {
      setIndicator((current) => ({ ...current, opacity: 0 }));
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();
    setIndicator({
      left: buttonRect.left - containerRect.left,
      width: buttonRect.width,
      opacity: 1,
    });
  }, [activeTab, tabs]);

  return (
    <div ref={containerRef} className={`animated-tabs${className ? ` ${className}` : ""}`}>
      <span
        className="animated-tabs__indicator"
        style={{
          transform: `translateX(${indicator.left}px)`,
          width: indicator.width,
          opacity: indicator.opacity,
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
            className={`animated-tabs__tab${isActive ? " is-active" : ""}`}
            onClick={() => {
              if (!tab.disabled) {
                onChange(tab.key);
              }
            }}
            disabled={tab.disabled}
            aria-pressed={isActive}
            aria-label={tab.ariaLabel ?? tab.label}
          >
            <span>{tab.label}</span>
            {tab.badge ? <span className="animated-tabs__badge">{tab.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
