"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ImportErrorToast } from "@/components/import-error-toast";
import { ImportUploadDock } from "@/components/import-upload-dock";
import { UploadInsightsToast } from "@/components/upload-insights-toast";
import { clearImportActivity, readImportActivity, subscribeImportActivity, type ImportActivitySnapshot } from "@/lib/import-activity";
import { getImportErrorNextSteps, getImportErrorSpecForCode } from "@/lib/import-error-spec";

const isCompletedSummary = (activity: ImportActivitySnapshot | null) =>
  Boolean(activity && activity.status === "done" && activity.summary);

const isBackgroundFinalizationActivity = (activity: ImportActivitySnapshot | null) =>
  Boolean(
    activity &&
      activity.status !== "error" &&
      /visible in clover|accounts and transactions are visible|cleaning up names and categories|finalizing_enrichment/i.test(
        activity.detail ?? ""
      )
  );

const IMPORT_ACTIVITY_APP_PATH_PREFIXES = [
  "/accounts",
  "/admin",
  "/dashboard",
  "/goals",
  "/home",
  "/imports",
  "/insights",
  "/investments",
  "/more",
  "/notifications",
  "/onboarding",
  "/profile",
  "/recurring",
  "/reports",
  "/review",
  "/settings",
  "/split-bill",
  "/transactions",
];

const canShowImportActivityOnPath = (pathname: string | null) => {
  const currentPath = pathname || "/";
  return IMPORT_ACTIVITY_APP_PATH_PREFIXES.some(
    (prefix) => currentPath === prefix || currentPath.startsWith(`${prefix}/`)
  );
};

const dismissedImportActivityStorageKey = "clover.import.activity.dismissed.v1";

const getDismissKey = (activity: ImportActivitySnapshot | null) => {
  if (!activity) {
    return null;
  }

  return [
    activity.workspaceId,
    activity.status,
    activity.fileName ?? "file",
    activity.errorCode ?? "no-code",
    activity.detail ?? "",
  ].join("|");
};

const readDismissedKeys = () => {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(dismissedImportActivityStorageKey) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : []);
  } catch {
    return new Set<string>();
  }
};

const writeDismissedKeys = (keys: Set<string>) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(dismissedImportActivityStorageKey, JSON.stringify([...keys].slice(-50)));
  } catch {
    // Dismissal is best-effort; storage can be unavailable in private contexts.
  }
};

export function GlobalImportActivity() {
  const pathname = usePathname();
  const dismissedKeysRef = useRef<Set<string>>(readDismissedKeys());
  const [activity, setActivity] = useState<ImportActivitySnapshot | null>(() => {
    const snapshot = readImportActivity();
    if (isBackgroundFinalizationActivity(snapshot)) {
      clearImportActivity();
      return null;
    }
    const dismissKey = getDismissKey(snapshot);
    return dismissKey && dismissedKeysRef.current.has(dismissKey) ? null : snapshot;
  });
  const [pageModalActive, setPageModalActive] = useState(() =>
    typeof document === "undefined" ? false : document.body.hasAttribute("data-clover-page-modal")
  );
  const [accountsSplashActive, setAccountsSplashActive] = useState(() =>
    typeof document === "undefined" ? false : document.body.hasAttribute("data-clover-accounts-loading")
  );
  const shouldShowOnCurrentPath = canShowImportActivityOnPath(pathname);

  useEffect(
    () =>
      subscribeImportActivity(() => {
        const snapshot = readImportActivity();
        if (isBackgroundFinalizationActivity(snapshot)) {
          clearImportActivity();
          setActivity(null);
          return;
        }
        const dismissKey = getDismissKey(snapshot);
        if (dismissKey && dismissedKeysRef.current.has(dismissKey)) {
          setActivity(null);
          return;
        }

        setActivity(snapshot);
      }),
    []
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const updatePageModalState = () => {
      setPageModalActive(document.body.hasAttribute("data-clover-page-modal"));
    };

    updatePageModalState();
    const observer = new MutationObserver(updatePageModalState);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-clover-page-modal"] });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const updateAccountsSplashState = () => {
      setAccountsSplashActive(document.body.hasAttribute("data-clover-accounts-loading"));
    };

    updateAccountsSplashState();
    const observer = new MutationObserver(updateAccountsSplashState);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-clover-accounts-loading"] });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!activity || activity.status !== "done") {
      return;
    }

    const timeout = window.setTimeout(() => {
      clearImportActivity();
      setActivity(null);
    }, 1500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activity]);

  if (!activity || !shouldShowOnCurrentPath || (activity.surface === "modal" && pageModalActive)) {
    return null;
  }

  const handleClose = () => {
    const dismissKey = getDismissKey(activity);
    if (dismissKey) {
      dismissedKeysRef.current.add(dismissKey);
      writeDismissedKeys(dismissedKeysRef.current);
    }
    clearImportActivity();
    setActivity(null);
  };

  if (isCompletedSummary(activity) && activity.summary) {
    return <UploadInsightsToast summary={activity.summary} onClose={handleClose} />;
  }

  const isError = activity.status === "error";

  if (isError) {
    if (accountsSplashActive) {
      return null;
    }

    const code = activity.errorCode ?? "I-199";
    const spec = getImportErrorSpecForCode(code);
    return (
      <ImportErrorToast
        code={code}
        httpClass={spec.httpClass}
        title={activity.errorTitle || spec.title || activity.detail || "Clover hit an import snag"}
        message={activity.errorMessage ?? spec.message}
        nextSteps={activity.errorNextSteps ?? getImportErrorNextSteps(code)}
        onClose={handleClose}
      />
    );
  }

  return (
    <ImportUploadDock
      open
      tone="default"
      fileName={activity.fileName}
      fileIndex={activity.fileIndex}
      fileTotal={activity.fileTotal}
      completedFiles={activity.completedFiles}
      progress={activity.progress}
      detail={activity.detail}
      onClose={handleClose}
    />
  );
}
