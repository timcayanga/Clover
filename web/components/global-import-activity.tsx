"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ImportErrorToast } from "@/components/import-error-toast";
import { ImportUploadDock } from "@/components/import-upload-dock";
import { UploadInsightsToast } from "@/components/upload-insights-toast";
import { clearImportActivity, readImportActivity, subscribeImportActivity, type ImportActivitySnapshot } from "@/lib/import-activity";
import { getImportErrorNextSteps, getImportErrorSpecForCode } from "@/lib/import-error-spec";

const isCompletedSummary = (activity: ImportActivitySnapshot | null) =>
  Boolean(activity && activity.status === "done" && activity.summary);

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

export function GlobalImportActivity() {
  const pathname = usePathname();
  const [activity, setActivity] = useState<ImportActivitySnapshot | null>(() => readImportActivity());
  const [pageModalActive, setPageModalActive] = useState(() =>
    typeof document === "undefined" ? false : document.body.hasAttribute("data-clover-page-modal")
  );
  const shouldShowOnCurrentPath = canShowImportActivityOnPath(pathname);

  useEffect(() => subscribeImportActivity(() => setActivity(readImportActivity())), []);

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
    clearImportActivity();
    setActivity(null);
  };

  if (isCompletedSummary(activity) && activity.summary) {
    return <UploadInsightsToast summary={activity.summary} onClose={handleClose} />;
  }

  const isError = activity.status === "error";

  if (isError) {
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
