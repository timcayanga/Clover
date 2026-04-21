"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImportFilesModal } from "@/components/import-files-modal";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";

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

export function DashboardImportLauncher({ workspaceId, accounts, initialOpen }: DashboardImportLauncherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);

  useEffect(() => {
    setOpen(initialOpen);
  }, [initialOpen]);

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

    router.refresh();
    handleClose();
  };

  return (
    <ImportFilesModal
      open={open}
      workspaceId={workspaceId}
      accounts={accounts}
      defaultAccountId={accounts.find((account) => account.type !== "cash" && account.type !== "other" && account.type !== "investment")?.id ?? accounts[0]?.id ?? null}
      onClose={handleClose}
      onImported={handleImported}
    />
  );
}
