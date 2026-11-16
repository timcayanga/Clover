"use client";

import { useEffect } from "react";

export function PwaServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
      return;
    }

    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
        void registration.update();
      }).catch(() => {
        // PWA support is progressive; registration must never block Clover.
      });
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof idleWindow.requestIdleCallback === "function") {
      const idleId = idleWindow.requestIdleCallback(register, { timeout: 3000 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = globalThis.setTimeout(register, 1200);
    return () => globalThis.clearTimeout(timeoutId);
  }, []);

  return null;
}
