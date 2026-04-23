"use client";

import Script from "next/script";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { analyticsOnceKey, shouldTrackAnalytics, type AnalyticsEventName, type AnalyticsProperties } from "@/lib/analytics";

declare global {
  interface Window {
    posthog?: {
      init: (key: string, config: { api_host: string; capture_pageview?: boolean; capture_pageleave?: boolean }) => void;
      capture: (event: string, properties?: Record<string, unknown>) => void;
      identify: (distinctId: string) => void;
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

const normalizeHost = (host: string) => host.replace(/\/$/, "");

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
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    runWhenPostHogReady(() => {
      window.posthog?.capture("$pageview", {
        $current_url: window.location.href,
        $pathname: pathname,
        $search: search,
      });
    });
  }, [pathname, search]);

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
        window.posthog?.identify(user.id);
        return;
      }

      window.posthog?.reset();
    });
  }, [isLoaded, user]);

  return null;
}

export function PostHogAnalytics() {
  const token = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  if (!token) {
    return null;
  }

  return (
    <>
      <PostHogBootstrap token={token} host={host} />
      <PostHogPageViews />
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
      window.posthog?.capture(event, properties);
    });
  }, [event, onceKey, properties]);

  return null;
}

export function PostHogPageEvent({ event, properties }: Omit<PostHogEventProps, "onceKey">) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (!shouldTrackAnalytics()) {
      return;
    }

    runWhenPostHogReady(() => {
      window.posthog?.capture(event, {
        ...properties,
        $current_url: window.location.href,
        $pathname: pathname,
        $search: search,
      });
    });
  }, [event, pathname, properties, search]);

  return null;
}

export const capturePostHogClientEvent = (event: AnalyticsEventName, properties: AnalyticsProperties = {}) => {
  if (!shouldTrackAnalytics()) {
    return;
  }

  runWhenPostHogReady(() => {
    window.posthog?.capture(event, properties);
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
    window.posthog?.capture(event, properties);
  });
};

export { analyticsOnceKey };
