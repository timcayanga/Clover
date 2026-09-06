"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ImportErrorToast } from "@/components/import-error-toast";
import { ImportUploadDock } from "@/components/import-upload-dock";
import { publishImportedSummary } from "@/lib/imported-summary-events";
import { resolveImportModalStatusDecision } from "@/lib/import-modal-status";
import { publishWorkspaceDataChange } from "@/lib/workspace-data-sync";
import {
  clearImportActivity,
  getImportActivityDismissKey,
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
const completedImportDismissDelayMs = 10 * 1000;
const importStatusPollMs = 2_500;
const importStatusRetryPollMs = 5_000;

const getStaleActiveImportTimeoutMs = (activity: ImportActivitySnapshot) => {
  const fileTotal = Number.isFinite(Number(activity.fileTotal)) ? Math.max(1, Number(activity.fileTotal)) : 1;
  return Math.min(
    staleActiveImportMaxTimeoutMs,
    staleActiveImportBaseTimeoutMs + Math.max(0, fileTotal - 1) * staleActiveImportPerFileTimeoutMs
  );
};

const getDismissKey = getImportActivityDismissKey;

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
  // Browser storage must not influence the first client render. Reading it in
  // a state/ref initializer makes the hydrated tree differ from the server
  // whenever an import is in progress (or was dismissed), forcing React to
  // discard the server HTML during every full navigation.
  const dismissedKeysRef = useRef<Set<string>>(new Set());
  const resumedImportIdsRef = useRef(new Set<string>());
  const publishedImportIdsRef = useRef(new Set<string>());
  const [activity, setActivity] = useState<ImportActivitySnapshot | null>(null);
  const [pageModalActive, setPageModalActive] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [accountsSplashActive, setAccountsSplashActive] = useState(false);
  const shouldShowOnCurrentPath = canShowImportActivityOnPath(pathname);

  useEffect(() => {
    const dismissedKeys = readDismissedKeys();
    dismissedKeysRef.current = dismissedKeys;
    const snapshot = readImportActivity();
    const dismissKey = getDismissKey(snapshot);
    setActivity(dismissKey && dismissedKeys.has(dismissKey) ? null : snapshot);
  }, []);

  useEffect(() => {
    if (!activity || activity.status !== "active" || !activity.importFileId || importModalVisible) {
      return;
    }

    let cancelled = false;
    let pollTimer: number | null = null;
    const importFileId = activity.importFileId;

    const schedulePoll = (delayMs: number) => {
      if (cancelled) return;
      pollTimer = window.setTimeout(() => void pollStatus(), delayMs);
    };

    const publishVisibleImport = (snapshot: ImportActivitySnapshot) => {
      if (snapshot.summary) {
        publishImportedSummary(snapshot.workspaceId, snapshot.summary);
      }
      if (publishedImportIdsRef.current.has(importFileId)) return;
      publishedImportIdsRef.current.add(importFileId);
      publishWorkspaceDataChange({
        workspaceId: snapshot.workspaceId,
        source: "transactions",
        affected: [
          "accounts",
          "transactions",
          "recurring",
          "circles",
          "split-bills",
          "budgeting",
          "goals",
          "investments",
          "adviser",
          "home",
          "reports",
        ],
        path: `/api/imports/${importFileId}/status`,
        revision: Date.now(),
      });
    };

    const pollStatus = async () => {
      try {
        const progressResponse = await fetch(`/api/imports/${encodeURIComponent(importFileId)}/progress`, {
          cache: "no-store",
        });
        if (!progressResponse.ok) {
          schedulePoll(importStatusRetryPollMs);
          return;
        }

        type ImportStatusPayload = {
          importFile?: {
            status?: string | null;
            processingPhase?: string | null;
            processingMessage?: string | null;
            processingAttempt?: number | null;
            updatedAt?: string | null;
          } | null;
          parsedRowsCount?: number | null;
          confirmedTransactionsCount?: number | null;
          visibleImportComplete?: boolean | null;
          settledImportComplete?: boolean | null;
          confirmationStatus?: string | null;
          telemetryPhase?: string | null;
          telemetryLabel?: string | null;
          telemetryMessage?: string | null;
          canResume?: boolean | null;
          statementSelfHeal?: { reason?: string | null } | null;
          receiptTransaction?: unknown;
          receiptDocument?: unknown;
        };
        let payload = (await progressResponse.json()) as ImportStatusPayload;
        const progressUpdatedAtMs = Date.parse(String(payload.importFile?.updatedAt ?? ""));
        const progressAgeMs = Number.isFinite(progressUpdatedAtMs) ? Date.now() - progressUpdatedAtMs : 0;
        const needsFullStatus =
          payload.importFile?.status === "done" ||
          payload.importFile?.status === "failed" ||
          Number(payload.confirmedTransactionsCount ?? 0) > 0 ||
          (payload.importFile?.processingPhase === "queued_retry" && progressAgeMs >= 15_000);
        if (needsFullStatus) {
          const statusResponse = await fetch(`/api/imports/${encodeURIComponent(importFileId)}/status`, {
            cache: "no-store",
          });
          if (statusResponse.ok) {
            payload = (await statusResponse.json()) as ImportStatusPayload;
          }
        }
        if (cancelled) return;

        const current = readImportActivity();
        if (!current || current.status !== "active" || current.importFileId !== importFileId) {
          return;
        }

        const importFile = payload.importFile;
        const decision = resolveImportModalStatusDecision({
          importMode: "statement",
          status: importFile?.status,
          processingPhase: importFile?.processingPhase,
          processingMessage: importFile?.processingMessage,
          telemetryPhase: payload.telemetryPhase,
          telemetryLabel: payload.telemetryLabel,
          telemetryMessage: payload.telemetryMessage,
          parsedRowsCount: payload.parsedRowsCount,
          confirmedTransactionsCount: payload.confirmedTransactionsCount,
          visibleImportComplete: payload.visibleImportComplete,
          hasStructuredReceiptVisibility: Boolean(payload.receiptTransaction || payload.receiptDocument),
          processingAttempt: importFile?.processingAttempt,
          progressFloor: current.progress,
        });

        if (decision.kind === "repair_needed") {
          const failedSnapshot: ImportActivitySnapshot = {
            ...current,
            status: "error",
            progress: decision.progress,
            detail: decision.progressLabel,
            errorCode: decision.errorCode,
            errorTitle: "File needs another read",
            errorMessage: decision.message,
            errorNextSteps: getImportErrorNextSteps(decision.errorCode),
            updatedAt: Date.now(),
          };
          setImportActivity(failedSnapshot);
          setActivity(failedSnapshot);
          return;
        }

        // Refresh real saved rows immediately, even while the account-summary
        // check is finishing. Do not publish preliminary parser rows as fact.
        if (decision.kind === "visible") {
          publishVisibleImport({ ...current, summary: null });
        }
        const durablySettled =
          payload.settledImportComplete === true || Boolean(payload.receiptTransaction);
        if (durablySettled) {
          const completedAt = Date.now();
          const startedAt = current.timing?.startedAt ?? completedAt;
          const firstVisibleAt = current.timing?.firstVisibleAt ?? completedAt;
          const doneSnapshot: ImportActivitySnapshot = {
            ...current,
            status: "done",
            completedFiles: Math.max(current.completedFiles, current.fileTotal || 1),
            progress: 100,
            detail: "Import complete. Your results are visible on Home, Accounts, and Transactions.",
            timing: {
              startedAt,
              firstVisibleAt,
              completedAt,
              visibilityLatencyMs: Math.max(0, firstVisibleAt - startedAt),
              totalLatencyMs: Math.max(0, completedAt - startedAt),
            },
            updatedAt: completedAt,
          };
          setImportActivity(doneSnapshot);
          setActivity(doneSnapshot);
          publishVisibleImport(doneSnapshot);
          return;
        }

        const nextSnapshot: ImportActivitySnapshot = {
          ...current,
          progress: Math.max(current.progress, decision.kind === "visible" ? 95 : decision.progress),
          detail:
            decision.kind === "visible"
              ? "Transactions are saved. Clover is updating Home and account totals."
              : decision.detail,
          updatedAt: Date.now(),
        };
        setImportActivity(nextSnapshot);
        setActivity(nextSnapshot);

        const shouldResume =
          !resumedImportIdsRef.current.has(importFileId) &&
          (payload.statementSelfHeal?.reason === "stale_statement_image_queue" ||
            (payload.canResume === true && importFile?.processingPhase === "queued_retry"));
        if (shouldResume) {
          resumedImportIdsRef.current.add(importFileId);
          void fetch(`/api/imports/${encodeURIComponent(importFileId)}/resume`, {
            method: "POST",
          })
            .then((response) => {
              if (!response.ok) resumedImportIdsRef.current.delete(importFileId);
            })
            .catch(() => {
              resumedImportIdsRef.current.delete(importFileId);
            });
        }
        schedulePoll(importStatusPollMs);
      } catch {
        schedulePoll(importStatusRetryPollMs);
      }
    };

    void pollStatus();
    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [activity?.importFileId, activity?.status, importModalVisible]);

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
    const timeout = window.setTimeout(async () => {
      const current = readImportActivity();
      if (!current || current.status !== "active" || current.updatedAt !== activity.updatedAt) {
        return;
      }

      // Local activity can become stale after navigation or a remount. Ask the
      // server for the durable result before turning that stale state into a
      // timeout, otherwise a parser rejection is incorrectly shown as I-107.
      if (current.importFileId) {
        try {
          const response = await fetch(`/api/imports/${current.importFileId}/status`, { cache: "no-store" });
          if (response.ok) {
            const payload = (await response.json()) as {
              importFile?: {
                status?: string | null;
                processingPhase?: string | null;
                processingMessage?: string | null;
              } | null;
              confirmedTransactionsCount?: number | null;
              visibleImportComplete?: boolean | null;
            };
            const importFile = payload.importFile;
            const processingPhase = importFile?.processingPhase ?? null;
            if (importFile?.status === "failed" || processingPhase === "repair_needed") {
              const message =
                importFile?.processingMessage?.trim() ||
                "Clover safely stopped this import because the file needs a parser update. Nothing was added.";
              const repairSnapshot: ImportActivitySnapshot = {
                ...current,
                status: "error",
                progress: Math.min(Math.max(current.progress, 0), 90),
                detail: "Review needed",
                errorCode: "I-104",
                errorTitle: "File needs another read",
                errorMessage: message,
                errorNextSteps: [
                  "Retry the original file after Clover has been updated.",
                  "Your existing data is unchanged, and no partial rows were added.",
                ],
                updatedAt: Date.now(),
              };
              setImportActivity(repairSnapshot);
              setActivity(repairSnapshot);
              return;
            }
            if (
              importFile?.status === "done" ||
              payload.visibleImportComplete ||
              Number(payload.confirmedTransactionsCount ?? 0) > 0
            ) {
              const doneSnapshot: ImportActivitySnapshot = {
                ...current,
                status: "done",
                progress: 100,
                detail: "Import complete",
                updatedAt: Date.now(),
              };
              setImportActivity(doneSnapshot);
              setActivity(doneSnapshot);
              return;
            }
            if (importFile?.status === "processing") {
              const activeSnapshot: ImportActivitySnapshot = {
                ...current,
                detail:
                  importFile.processingMessage?.trim() ||
                  "Clover is still processing this import in the background.",
                updatedAt: Date.now(),
              };
              setImportActivity(activeSnapshot);
              setActivity(activeSnapshot);
              return;
            }
          }
        } catch {
          const reconnectingSnapshot: ImportActivitySnapshot = {
            ...current,
            detail: "Clover is reconnecting while your import continues in the background.",
            updatedAt: Date.now(),
          };
          setImportActivity(reconnectingSnapshot);
          setActivity(reconnectingSnapshot);
          return;
        }
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

  useEffect(() => {
    if (!activity || activity.status !== "done") {
      return;
    }
    // Count the confirmation window only while this surface can show it.
    // A picker, navigation, or page modal must not consume the success timer.
    if (!shouldShowOnCurrentPath || pageModalActive || importModalVisible) return;
    const timeout = window.setTimeout(() => {
      const current = readImportActivity();
      // Never dismiss a newer import that reused the global activity store.
      if (!current || current.status !== "done" || current.updatedAt !== activity.updatedAt) {
        return;
      }

      clearImportActivity();
      setActivity(null);
    }, completedImportDismissDelayMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activity, shouldShowOnCurrentPath, pageModalActive, importModalVisible]);

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
