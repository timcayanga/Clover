"use client";

import { useEffect, useRef } from "react";
import { getAppBuildInfo } from "@/lib/build-info";

function useReportError(error: Error & { digest?: string }, source: string) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) {
      return;
    }

    sentRef.current = true;

    const buildInfo = getAppBuildInfo();
    void fetch("/api/error-logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      keepalive: true,
      body: JSON.stringify({
        message: error.message,
        name: error.name,
        stack: error.stack ?? null,
        source,
        route: window.location.pathname,
        url: window.location.href,
        buildId: document.body.dataset.buildId ?? buildInfo.buildId,
        deploymentId: document.body.dataset.deploymentId ?? buildInfo.deploymentId,
        environment: document.body.dataset.environment ?? buildInfo.environment,
        occurredAt: new Date().toISOString(),
        metadata: {
          digest: error.digest ?? null,
          componentStack: null,
        },
      }),
    }).catch(() => null);
  }, [error, source]);
}

export function ErrorView({
  error,
  reset,
  source,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  source: string;
}) {
  useReportError(error, source);

  return (
    <main className="error-screen">
      <div className="error-screen__card glass">
        <p className="eyebrow">Something broke</p>
        <h1>We hit an unexpected error.</h1>
        <p>{error.message}</p>
        <button className="button button-primary" type="button" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} source="app-error-boundary" />;
}
