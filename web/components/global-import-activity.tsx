"use client";

import { useEffect, useState } from "react";
import { ImportErrorToast } from "@/components/import-error-toast";
import { ImportUploadDock } from "@/components/import-upload-dock";
import { UploadInsightsToast } from "@/components/upload-insights-toast";
import { clearImportActivity, readImportActivity, subscribeImportActivity, type ImportActivitySnapshot } from "@/lib/import-activity";

const isCompletedSummary = (activity: ImportActivitySnapshot | null) =>
  Boolean(activity && activity.status === "done" && activity.summary);

const getImportErrorNextSteps = (code: string) => {
  const normalized = code.trim().toUpperCase();

  if (normalized === "I-107") {
    return [
      "Stay on the import screen a little longer, or re-upload the original statement if Clover stops tracking it again.",
      "If the account details already look right, open the account and continue with any missing rows manually.",
      "If the transactions still do not appear, add the missing entries in Transactions and use Review to verify the totals.",
    ];
  }

  if (normalized === "I-105" || normalized === "I-104") {
    return [
      "Re-upload the original PDF or CSV.",
      "If Clover still stalls, add the missing transactions manually in Transactions.",
      "If the statement looks off after import, check Review before confirming anything.",
    ];
  }

  return [
    "Re-upload the original PDF or CSV.",
    "If Clover still stalls, add the missing transactions manually in Transactions.",
    "If the statement looks off after import, check Review before confirming anything.",
  ];
};

export function GlobalImportActivity() {
  const [activity, setActivity] = useState<ImportActivitySnapshot | null>(() => readImportActivity());

  useEffect(() => subscribeImportActivity(() => setActivity(readImportActivity())), []);

  useEffect(() => {
    if (!activity || (activity.status !== "error" && activity.status !== "done")) {
      return;
    }

    const timeout = window.setTimeout(() => {
      clearImportActivity();
      setActivity(null);
    }, 5000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activity]);

  if (!activity || activity.surface === "modal") {
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
    return (
      <ImportErrorToast
        code={code}
        title={activity.errorTitle || activity.detail || "Clover hit an import snag"}
        message={activity.errorMessage ?? "Clover wasn't able to finish this file."}
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
