"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { EmptyDataCta } from "@/components/empty-data-cta";

const MAX_AUTOMATIC_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1200;
const RETRY_STATE_TTL_MS = 120000;

type RetryState = {
  attempts: number;
  lastAttemptAt: number;
};

function storageKey(pathname: string) {
  return `clover:transient-data-recovery:${pathname}`;
}

function readRetryState(key: string): RetryState {
  if (typeof window === "undefined") {
    return { attempts: 0, lastAttemptAt: 0 };
  }

  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(key) ?? "null") as Partial<RetryState> | null;
    if (!parsed || typeof parsed.attempts !== "number" || typeof parsed.lastAttemptAt !== "number") {
      return { attempts: 0, lastAttemptAt: 0 };
    }

    if (Date.now() - parsed.lastAttemptAt > RETRY_STATE_TTL_MS) {
      window.sessionStorage.removeItem(key);
      return { attempts: 0, lastAttemptAt: 0 };
    }

    return {
      attempts: Math.max(0, Math.min(MAX_AUTOMATIC_RETRIES, parsed.attempts)),
      lastAttemptAt: parsed.lastAttemptAt,
    };
  } catch {
    return { attempts: 0, lastAttemptAt: 0 };
  }
}

function writeRetryState(key: string, state: RetryState) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Recovery still works with the manual retry if storage is unavailable.
  }
}

export function TransientDataRecovery({
  eyebrow,
  pageLabel,
  accountHref = "/accounts",
  transactionHref = "/transactions",
  importHref = "/transactions?import=1",
  transactionLabel = "Open transactions",
}: {
  eyebrow: string;
  pageLabel: string;
  accountHref?: string;
  transactionHref?: string;
  importHref?: string;
  transactionLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() || pageLabel.toLowerCase();
  const key = storageKey(pathname);
  const [retryState, setRetryState] = useState<RetryState>({ attempts: 0, lastAttemptAt: 0 });
  const [isRetrying, setIsRetrying] = useState(true);

  useEffect(() => {
    const nextState = readRetryState(key);
    setRetryState(nextState);
    setIsRetrying(nextState.attempts < MAX_AUTOMATIC_RETRIES);
  }, [key]);

  useEffect(() => {
    if (!isRetrying || retryState.attempts >= MAX_AUTOMATIC_RETRIES) {
      return;
    }

    const delay = INITIAL_RETRY_DELAY_MS * 2 ** retryState.attempts;
    const timer = window.setTimeout(() => {
      const nextState = {
        attempts: retryState.attempts + 1,
        lastAttemptAt: Date.now(),
      };
      writeRetryState(key, nextState);
      setRetryState(nextState);
      router.refresh();
    }, delay);

    return () => window.clearTimeout(timer);
  }, [isRetrying, key, retryState.attempts, router]);

  const retryNow = () => {
    const nextState = { attempts: 0, lastAttemptAt: Date.now() };
    writeRetryState(key, nextState);
    setRetryState(nextState);
    setIsRetrying(true);
    router.refresh();
  };

  const exhausted = retryState.attempts >= MAX_AUTOMATIC_RETRIES;

  return (
    <EmptyDataCta
      className="dashboard-empty-state"
      eyebrow={eyebrow}
      title={exhausted ? `${pageLabel} could not refresh yet` : `Loading your latest ${pageLabel.toLowerCase()} data`}
      copy={
        exhausted
          ? "Your data is safe. The connection is taking longer than expected, but you can try again without re-importing anything."
          : "Clover is checking your latest workspace data. We'll try again automatically before asking you to do anything."
      }
      highlights={
        exhausted
          ? ["Nothing has been deleted or changed.", "Try again now, or open another area while Clover recovers."]
          : [`Automatic retry ${Math.min(retryState.attempts + 1, MAX_AUTOMATIC_RETRIES)} of ${MAX_AUTOMATIC_RETRIES}.`]
      }
      illustration="/illustrations/clover-empty-dashboard-3d.png"
      illustrationAlt="Clover workspace refresh"
      actions={
        <>
          <button className="button button-primary button-small" type="button" onClick={retryNow} disabled={isRetrying && !exhausted}>
            {exhausted ? "Try again" : "Retry now"}
          </button>
          <a className="button button-secondary button-small" href={accountHref}>
            Open accounts
          </a>
          <a className="pill-link pill-link--inline transactions-empty-state__manual-link" href={transactionHref}>
            {transactionLabel}
          </a>
          <a className="pill-link pill-link--inline transactions-empty-state__manual-link" href={importHref}>
            Upload files
          </a>
        </>
      }
      accountHref={accountHref}
      transactionHref={transactionHref}
    />
  );
}
