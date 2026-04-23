"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import { UploadInsightsToast } from "@/components/upload-insights-toast";

type DashboardImportLauncherProps = {
  workspaceId: string;
  accounts: Array<{
    id: string;
    name: string;
    institution: string | null;
    type: string;
    currency: string;
  }>;
  initialOpen: boolean;
};

const ImportFilesModal = dynamic(
  () => import("@/components/import-files-modal").then((module) => module.ImportFilesModal),
  { ssr: false }
);

export function DashboardImportLauncher({ workspaceId, accounts, initialOpen }: DashboardImportLauncherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);
  const [toastSummary, setToastSummary] = useState<UploadInsightsSummary | null>(null);

  useEffect(() => {
    setOpen(initialOpen);
  }, [initialOpen]);

  useEffect(() => {
    if (!toastSummary) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToastSummary(null);
    }, 7000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [toastSummary]);

  if (!workspaceId) {
    return null;
  }

  const handleClose = () => {
    setOpen(false);
    router.replace("/dashboard");
  };

  const handleImported = async (_summary: UploadInsightsSummary) => {
    if (_summary.optimistic) {
      return;
    }

    setToastSummary(_summary);
    router.refresh();
    handleClose();
  };

  return (
    <>
      <ImportFilesModal
        open={open}
        workspaceId={workspaceId}
        accounts={accounts}
        defaultAccountId={accounts.find((account) => account.type !== "cash" && account.type !== "other" && account.type !== "investment")?.id ?? accounts[0]?.id ?? null}
        onClose={handleClose}
        onImported={handleImported}
      />
      {toastSummary ? <UploadInsightsToast summary={toastSummary} onClose={() => setToastSummary(null)} /> : null}
    </>
  );
}
