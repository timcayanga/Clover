"use client";

import Script from "next/script";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  analyticsOnceKey,
  getAnalyticsEpochProperties,
  getPostHogClientHost,
  scopeAnalyticsDistinctId,
  shouldTrackAnalytics,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from "@/lib/analytics";

declare global {
  interface Window {
    posthog?: {
      init: (key: string, config: { api_host: string; capture_pageview?: boolean; capture_pageleave?: boolean }) => void;
      capture: (event: string, properties?: Record<string, unknown>) => void;
      identify: (distinctId: string, properties?: Record<string, unknown>) => void;
      reset: () => void;
    };
    __posthogReady?: boolean;
    __posthogQueue?: Array<() => void>;
  }
}

type PostHogScriptProps = {
  token: string;
  host: string;
};

type PostHogPersonPropertiesProps = {
  distinctId: string;
  properties: AnalyticsProperties;
};

const normalizeHost = (host: string) => host.replace(/\/$/, "");
const redactAnalyticsPath = (pathname: string | null | undefined) =>
  (pathname || "/")
    .split("/")
    .map((segment) =>
      segment.length >= 20 || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ? "[redacted]" : segment
    )
    .join("/");

const getSafeAnalyticsLocation = (pathname: string | null | undefined = window.location.pathname) => {
  const safePathname = redactAnalyticsPath(pathname);
  return {
    $current_url: `${window.location.origin}${safePathname}`,
    $pathname: safePathname,
  };
};

const getPostHogPersonProperties = (user: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
}) => {
  const email = user.primaryEmailAddress?.emailAddress ?? undefined;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || email?.split("@")[0];
  const username = user.username ?? undefined;

  return {
    ...(email ? { email } : {}),
    ...(name ? { name } : {}),
    ...(username ? { username } : {}),
  };
};

const flushPostHogQueue = () => {
  if (typeof window === "undefined") {
    return;
  }

  const queue = window.__posthogQueue;

  if (!queue?.length || !window.posthog) {
    return;
  }

  window.__posthogQueue = [];

  for (const callback of queue) {
    callback();
  }
};

const runWhenPostHogReady = (callback: () => void) => {
  if (typeof window === "undefined") {
    return;
  }

  if (window.posthog) {
    callback();
    return;
  }

  window.__posthogQueue ??= [];
  window.__posthogQueue.push(callback);
};

const safeCapture = (event: string, properties: Record<string, unknown> = {}) => {
  try {
    window.posthog?.capture(event, {
      ...getAnalyticsEpochProperties(),
      ...properties,
    });
  } catch {
    // Analytics must never interrupt Clover rendering or navigation.
  }
};

const safeIdentify = (distinctId: string, properties: Record<string, unknown> = {}) => {
  try {
    window.posthog?.identify(distinctId, properties);
  } catch {
    // Analytics must never interrupt Clover rendering or navigation.
  }
};

const safeReset = () => {
  try {
    window.posthog?.reset();
  } catch {
    // Analytics must never interrupt Clover rendering or navigation.
  }
};

const getClientAnalyticsEnvironment = (): "production" | "staging" | "local" => {
  if (typeof document === "undefined") {
    return "production";
  }

  const rawEnvironment = document.body.dataset.environment ?? "production";
  if (rawEnvironment === "preview" || rawEnvironment === "staging") {
    return "staging";
  }

  return rawEnvironment === "local" ? "local" : "production";
};

const SESSION_STARTED_KEY = "clover.posthog.session-started.beta-2026-07-28";
const SESSION_RETURNED_KEY = "clover.posthog.session-returned.beta-2026-07-28";

function PostHogBootstrap({ token, host }: PostHogScriptProps) {
  const apiHost = normalizeHost(host);

  return (
    <Script
      id="posthog-bootstrap"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          !function(t,e){var o,n,p,r;e.__SV=1e3,window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once people.unset people.increment people.append register register_once unregister opt_in_capturing opt_out_capturing has_opted_out_capturing".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1e3}(document,window.posthog||[]);
          posthog.init(${JSON.stringify(token)}, {
            api_host: ${JSON.stringify(apiHost)},
            capture_pageview: false,
            capture_pageleave: true
          });
          window.__posthogReady = true;
          (${flushPostHogQueue.toString()})();
          window.dispatchEvent(new Event("posthog-ready"));
        `,
      }}
    />
  );
}

function PostHogPageViews() {
  const pathname = usePathname();

  useEffect(() => {
    runWhenPostHogReady(() => {
      safeCapture("$pageview", getSafeAnalyticsLocation(pathname));
    });
  }, [pathname]);

  return null;
}

function PostHogSessionSignals() {
  useEffect(() => {
    if (!shouldTrackAnalytics()) {
      return;
    }

    const sessionStartedKey = SESSION_STARTED_KEY;
    const sessionReturnedKey = SESSION_RETURNED_KEY;

    runWhenPostHogReady(() => {
      try {
        const sessionHasStarted = window.sessionStorage.getItem(sessionStartedKey) === "1";
        if (sessionHasStarted) {
          return;
        }

        const returning = window.localStorage.getItem(sessionReturnedKey) === "1";
        safeCapture(returning ? "session_returned" : "session_started", getSafeAnalyticsLocation());

        window.sessionStorage.setItem(sessionStartedKey, "1");
        window.localStorage.setItem(sessionReturnedKey, "1");
      } catch {
        // Ignore storage failures and still let analytics continue.
      }
    });
  }, []);

  return null;
}

function PostHogRoutePerformance() {
  const pathname = usePathname();

  useEffect(() => {
    if (!shouldTrackAnalytics()) {
      return;
    }

    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    let cancelled = false;
    const finish = () => {
      if (cancelled) {
        return;
      }

      const finishedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      const durationMs = Math.max(0, Math.round(finishedAt - startedAt));
      const properties = {
        route: redactAnalyticsPath(pathname),
        duration_ms: durationMs,
        viewport_class: window.innerWidth < 768 ? "mobile" : window.innerWidth < 1200 ? "tablet" : "desktop",
      } satisfies AnalyticsProperties;

      runWhenPostHogReady(() => {
        safeCapture("page_load_completed", properties);
        if (durationMs >= 2000) {
          safeCapture("page_load_slow", properties);
        }
      });
    };

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(finish);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return null;
}

function PostHogIdentity() {
  const { isLoaded, user } = useUser();

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    runWhenPostHogReady(() => {
      if (user) {
        safeIdentify(
          scopeAnalyticsDistinctId(user.id, getClientAnalyticsEnvironment()),
          {
            ...getAnalyticsEpochProperties(),
            ...getPostHogPersonProperties(user),
          }
        );
        return;
      }

        safeReset();
    });
  }, [isLoaded, user]);

  return null;
}

export function PostHogAnalytics() {
  const token = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = getPostHogClientHost();

  if (!token) {
    return null;
  }

  return (
    <>
      <PostHogBootstrap token={token} host={host} />
      <PostHogPageViews />
      <PostHogSessionSignals />
      <PostHogRoutePerformance />
    </>
  );
}

export function PostHogClerkIdentity() {
  const token = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  if (!token) {
    return null;
  }

  return <PostHogIdentity />;
}

export function PostHogPersonProperties({ distinctId, properties }: PostHogPersonPropertiesProps) {
  useEffect(() => {
    if (!shouldTrackAnalytics() || !distinctId) {
      return;
    }

    runWhenPostHogReady(() => {
      safeIdentify(scopeAnalyticsDistinctId(distinctId, getClientAnalyticsEnvironment()), {
        ...getAnalyticsEpochProperties(),
        ...properties,
      });
    });
  }, [distinctId, properties]);

  return null;
}

type PostHogEventProps = {
  event: AnalyticsEventName;
  properties?: AnalyticsProperties;
  onceKey?: string;
};

export function PostHogEvent({ event, properties = {}, onceKey }: PostHogEventProps) {
  useEffect(() => {
    if (!shouldTrackAnalytics()) {
      return;
    }

    if (onceKey) {
      try {
        if (window.localStorage.getItem(onceKey)) {
          return;
        }
        window.localStorage.setItem(onceKey, "1");
      } catch {
        // Ignore storage failures and still attempt capture.
      }
    }

    runWhenPostHogReady(() => {
      safeCapture(event, properties);
    });
  }, [event, onceKey, properties]);

  return null;
}

export function PostHogPageEvent({ event, properties }: Omit<PostHogEventProps, "onceKey">) {
  const pathname = usePathname();

  useEffect(() => {
    if (!shouldTrackAnalytics()) {
      return;
    }

    runWhenPostHogReady(() => {
      safeCapture(event, {
        ...properties,
        ...getSafeAnalyticsLocation(pathname),
      });
    });
  }, [event, pathname, properties]);

  return null;
}

export const capturePostHogClientEvent = (event: AnalyticsEventName, properties: AnalyticsProperties = {}) => {
  if (!shouldTrackAnalytics()) {
    return;
  }

  runWhenPostHogReady(() => {
    safeCapture(event, properties);
  });
};

export const capturePostHogClientEventOnce = (
  event: AnalyticsEventName,
  properties: AnalyticsProperties,
  onceKey: string
) => {
  if (!shouldTrackAnalytics()) {
    return;
  }

  try {
    if (window.localStorage.getItem(onceKey)) {
      return;
    }
    window.localStorage.setItem(onceKey, "1");
  } catch {
    // Ignore storage failures and still attempt capture.
  }

  runWhenPostHogReady(() => {
    safeCapture(event, properties);
  });
};

export { analyticsOnceKey };
