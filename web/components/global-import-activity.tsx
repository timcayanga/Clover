"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ImportErrorToast } from "@/components/import-error-toast";
import { ImportUploadDock } from "@/components/import-upload-dock";
import {
  clearImportActivity,
  readImportActivity,
  setImportActivity,
  subscribeImportActivity,
  type ImportActivitySnapshot,
} from "@/lib/import-activity";
import { getImportErrorNextSteps, getImportErrorSpecForCode } from "@/lib/import-error-spec";

const IMPORT_ACTIVITY_APP_PATH_PREFIXES = [
  "/accounts",
  "/admin",
  "/dashboard",
  "/goals",
  "/home",
  "/imports",
  "/adviser",
  "/investments",
  "/more",
  "/notifications",
  "/onboarding",
  "/profile",
  "/recurring",
  "/adviser",
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
const staleActiveImportBaseTimeoutMs = 60 * 1000;
const staleActiveImportPerFileTimeoutMs = 15 * 1000;
const staleActiveImportMaxTimeoutMs = 5 * 60 * 1000;

const getStaleActiveImportTimeoutMs = (activity: ImportActivitySnapshot) => {
  const fileTotal = Number.isFinite(Number(activity.fileTotal)) ? Math.max(1, Number(activity.fileTotal)) : 1;
  return Math.min(
    staleActiveImportMaxTimeoutMs,
    staleActiveImportBaseTimeoutMs + Math.max(0, fileTotal - 1) * staleActiveImportPerFileTimeoutMs
  );
};

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
    const dismissKey = getDismissKey(snapshot);
    return dismissKey && dismissedKeysRef.current.has(dismissKey) ? null : snapshot;
  });
  const [pageModalActive, setPageModalActive] = useState(() =>
    typeof document === "undefined" ? false : document.body.hasAttribute("data-clover-page-modal")
  );
  const [importModalVisible, setImportModalVisible] = useState(() =>
    typeof document === "undefined" ? false : document.body.hasAttribute("data-clover-import-modal-visible")
  );
  const [accountsSplashActive, setAccountsSplashActive] = useState(() =>
    typeof document === "undefined" ? false : document.body.hasAttribute("data-clover-accounts-loading")
  );
  const shouldShowOnCurrentPath = canShowImportActivityOnPath(pathname);

  useEffect(
    () =>
      subscribeImportActivity(() => {
        const snapshot = readImportActivity();
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

    const updateImportModalVisibleState = () => {
      setImportModalVisible(document.body.hasAttribute("data-clover-import-modal-visible"));
    };

    updateImportModalVisibleState();
    const observer = new MutationObserver(updateImportModalVisibleState);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-clover-import-modal-visible"] });

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
    if (!activity || activity.status !== "active") {
      return;
    }

    const remainingMs = Math.max(0, getStaleActiveImportTimeoutMs(activity) - (Date.now() - activity.updatedAt));
    const timeout = window.setTimeout(() => {
      const current = readImportActivity();
      if (!current || current.status !== "active" || current.updatedAt !== activity.updatedAt) {
        return;
      }

      const timedOutSnapshot: ImportActivitySnapshot = {
        ...current,
        status: "error",
        progress: Math.min(Math.max(current.progress, 0), 99),
        detail: "Import timed out",
        errorCode: "I-107",
        errorTitle: "Import timed out",
        errorMessage:
          "Clover could not finish reading this file in time. Try uploading the original statement again, or add the missing details manually.",
        errorNextSteps: getImportErrorNextSteps("I-107"),
        updatedAt: Date.now(),
      };
      setImportActivity(timedOutSnapshot);
      setActivity(timedOutSnapshot);
    }, remainingMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activity]);

  if (!activity || !shouldShowOnCurrentPath || pageModalActive || importModalVisible) {
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

  if (activity.status === "done") {
    return (
      <ImportUploadDock
        open
        tone="success"
        fileName={activity.fileName}
        fileIndex={activity.fileIndex}
        fileTotal={activity.fileTotal}
        completedFiles={activity.completedFiles}
        progress={100}
        detail={activity.detail || "Import complete. Your data is ready in Clover."}
        summary={activity.summary}
        onClose={handleClose}
      />
    );
  }

  const isError = activity.status === "error";

  if (isError) {
    if (accountsSplashActive) {
      return null;
    }

    const code = activity.errorCode ?? "I-199";
    const spec = getImportErrorSpecForCode(code);
    if (code === "I-104") {
      return (
        <ImportUploadDock
          open
          tone="error"
          fileName={activity.fileName}
          fileIndex={activity.fileIndex}
          fileTotal={activity.fileTotal}
          completedFiles={activity.completedFiles}
          progress={activity.progress}
          detail={spec.message}
          errorCode={code}
          errorTitle={activity.errorTitle || spec.title || "File not readable"}
          errorNextSteps={activity.errorNextSteps ?? getImportErrorNextSteps(code)}
          onClose={handleClose}
        />
      );
    }

    return (
      <ImportErrorToast
        code={code}
        fileName={activity.fileName}
        title={activity.errorTitle || spec.title || "Clover hit an import snag"}
        message={spec.message}
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
