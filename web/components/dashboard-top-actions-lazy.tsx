"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";

type DashboardTopActionsLazyProps = {
  workspaceId: string;
  accounts: Array<{
    id: string;
    name: string;
    institution: string | null;
    type: string;
    currency: string;
  }>;
};

const DashboardManualTransactionModal = dynamic(
  () => import("@/components/dashboard-top-actions").then((module) => module.DashboardManualTransactionModal),
  { ssr: false }
);

const ImportFilesModal = dynamic(
  () => import("@/components/import-files-modal").then((module) => module.ImportFilesModal),
  { ssr: false }
);

const normalizeName = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

export function DashboardTopActionsLazy({ workspaceId, accounts }: DashboardTopActionsLazyProps) {
  const router = useRouter();
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const defaultImportAccountId =
    accounts.find(
      (account) =>
        normalizeName(account.type) !== "cash" &&
        normalizeName(account.type) !== "other" &&
        normalizeName(account.type) !== "investment"
    )?.id ??
    accounts[0]?.id ??
    null;

  useLayoutEffect(() => {
    document.body.classList.toggle("dashboard-modal-open", manualOpen);
    document.body.toggleAttribute("data-clover-page-modal", manualOpen);

    return () => {
      document.body.classList.remove("dashboard-modal-open");
      document.body.removeAttribute("data-clover-page-modal");
    };
  }, [manualOpen]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("manual") === "1") {
      setManualOpen(true);
      return;
    }

    if (params.get("import") === "1") {
      setImportOpen(true);
    }
  }, []);

  useEffect(() => {
    const handleOpenManual = () => {
      setImportOpen(false);
      setManualOpen(true);
    };
    const handleOpenImport = () => {
      setManualOpen(false);
      setImportOpen(true);
    };

    window.addEventListener("clover:open-transaction-add", handleOpenManual);
    window.addEventListener("clover:open-dashboard-import", handleOpenImport);
    return () => {
      window.removeEventListener("clover:open-transaction-add", handleOpenManual);
      window.removeEventListener("clover:open-dashboard-import", handleOpenImport);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 720px)");
    const updateViewport = () => setIsCompactViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  if (isCompactViewport) {
    return null;
  }

  return (
    <>
      <div className="dashboard-top-actions">
        <button
          className="button button-secondary button-small transactions-action-button transactions-toolbar-add dashboard-top-actions__button"
          type="button"
          onClick={() => {
            setImportOpen(false);
            setManualOpen(true);
          }}
          aria-label="Add transaction"
          title="Add transaction"
        >
          <span className="button-icon dashboard-top-actions__icon" aria-hidden="true">
            +
          </span>
          <span>Add transaction</span>
        </button>
        <button
          className="button button-primary button-small accounts-toolbar-button accounts-toolbar-button--upload transactions-action-button transactions-toolbar-upload dashboard-top-actions__button"
          type="button"
          onClick={() => {
            setManualOpen(false);
            setImportOpen(true);
          }}
          aria-label="Upload files"
          title="Upload files"
        >
          <span className="button-icon dashboard-top-actions__icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" role="img" focusable="false">
              <path d="M10 3.25 5.8 7.45l1.1 1.1 2.3-2.3V13h1.6V6.25l2.3 2.3 1.1-1.1L10 3.25Z" fill="currentColor" />
              <path d="M4.5 13.5h1.6v1.4h7.8v-1.4h1.6v3H4.5v-3Z" fill="currentColor" />
            </svg>
          </span>
          <span>Upload files</span>
        </button>
      </div>

      {manualOpen ? (
        <DashboardManualTransactionModal
          workspaceId={workspaceId}
          accounts={accounts}
          onClose={() => {
            setManualOpen(false);
            window.history.replaceState({}, "", "/home");
          }}
        />
      ) : null}

      {importOpen ? (
        <ImportFilesModal
          open
          workspaceId={workspaceId}
          accounts={accounts}
          defaultAccountId={defaultImportAccountId}
          onClose={() => {
            setImportOpen(false);
            window.history.replaceState({}, "", "/home");
          }}
          onImported={async () => {
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
