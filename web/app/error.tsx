"use client";

import { useEffect, useMemo, useRef } from "react";
import { ErrorRecoveryScreen } from "@/components/error-recovery-screen";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";
import { getAppBuildInfo } from "@/lib/build-info";
import { isChunkLoadErrorMessage, recoverFromChunkLoadError } from "@/lib/chunk-error-recovery";

const PROTECTED_ROUTE_PREFIXES = [
  "/home",
  "/dashboard",
  "/accounts",
  "/transactions",
  "/recurring",
  "/adviser",
  "/split-bill",
  "/budgeting",
  "/goals",
  "/investments",
  "/settings",
  "/reports",
  "/review",
  "/profile",
  "/circles",
  "/more",
  "/notifications",
  "/imports",
  "/onboarding",
  "/continue",
  "/admin",
];

const createErrorCode = (error: Error & { digest?: string }, source: string) => {
  const seed = `${source}:${error.digest ?? ""}:${error.name}:${error.message}`;
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `CLV-${(hash >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(-7)}`;
};

function useReportError(error: Error & { digest?: string }, source: string, errorCode: string) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) {
      return;
    }

    sentRef.current = true;

    const buildInfo = getAppBuildInfo();
    capturePostHogClientEvent("error_shown", {
      error_source: source,
      error_code: errorCode,
      route: window.location.pathname,
      environment: document.body.dataset.environment ?? buildInfo.environment,
    });
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
          errorCode,
        },
      }),
    }).catch(() => null);
  }, [error, errorCode, source]);
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
  const errorCode = useMemo(() => createErrorCode(error, source), [error, source]);
  useReportError(error, source, errorCode);

  useEffect(() => {
    if (isChunkLoadErrorMessage(error.message)) {
      recoverFromChunkLoadError();
    }
  }, [error.message]);

  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  const isProtectedRoute = PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  return (
    <ErrorRecoveryScreen
      errorCode={errorCode}
      recoveryHref={isProtectedRoute ? "/home" : "/"}
      recoveryLabel={isProtectedRoute ? "Go to Home" : "Go to Landing Page"}
      onRefresh={() => {
        reset();
        window.location.reload();
      }}
    />
  );
}

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} source="app-error-boundary" />;
}
