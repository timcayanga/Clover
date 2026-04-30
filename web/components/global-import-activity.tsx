"use client";

import { useEffect, useState } from "react";
import { ImportUploadDock } from "@/components/import-upload-dock";
import { UploadInsightsToast } from "@/components/upload-insights-toast";
import { clearImportActivity, readImportActivity, subscribeImportActivity, type ImportActivitySnapshot } from "@/lib/import-activity";

const isCompletedSummary = (activity: ImportActivitySnapshot | null) =>
  Boolean(activity && activity.status === "done" && activity.summary);

export function GlobalImportActivity() {
  const [activity, setActivity] = useState<ImportActivitySnapshot | null>(() => readImportActivity());

  useEffect(() => subscribeImportActivity(() => setActivity(readImportActivity())), []);

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
  const tone = isError ? "error" : "default";

  return (
    <ImportUploadDock
      open
      tone={tone}
      fileName={activity.fileName}
      fileIndex={activity.fileIndex}
      fileTotal={activity.fileTotal}
      completedFiles={activity.completedFiles}
      progress={activity.progress}
      detail={activity.errorMessage ?? activity.detail}
      onClose={handleClose}
    />
  );
}
