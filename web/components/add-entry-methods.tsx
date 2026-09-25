"use client";
import { FinverseConnectButton } from "./finverse-connect-button";
import type { EntryFormContext } from "@/lib/adviser-entry-types";
import type { AddFormDraft } from "../../shared/add-form-draft";
import dynamic from "next/dynamic";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  UploadSourcePicker,
  UploadSecurityCopy,
} from "./upload-source-buttons";
import { ImportFilesModal } from "./import-files-modal";
import type { AdviserPlanningSurface } from "@/lib/adviser-planning";
import "./add-entry-methods.css";
const AdviserChat = dynamic(() =>
  import("./adviser-chat").then((m) => m.AdviserChat),
);
const guidance = {
  trade: {
    title: "Describe the trade you want to record",
    prompt:
      "Help me record a trade. Prepare the details for review without changing any records.",
    upload:
      "Upload a trade confirmation or statement, then review the matching holding and activity. Recording a trade does not execute it.",
  },
  accounts: {
    title: "Describe the account you want to add",
    prompt: "Help me add an account. Prepare a draft for me to review.",
    upload:
      "Upload an account statement. Review the account match before confirming. Existing confirmed balances are preserved.",
  },
  recurring: {
    title: "Describe the payment and schedule",
    prompt:
      "Help me plan a recurring payment. Ask me to confirm its type, due date, frequency and account.",
    upload:
      "Upload a bill or statement to review its transactions. Then confirm the recurring type, due date, frequency and account in Manual. A single bill does not establish a repeating schedule.",
  },
  investments: {
    title: "Describe your holding or trade",
    prompt:
      "Help me add an investment holding. Prepare an editable draft for me to review.",
    upload:
      "Upload an investment statement. Review the institution and holdings before confirming. Use Add Trade to record a buy, sell, dividend, reinvestment or transfer.",
  },
  split: {
    title: "Describe the bill and who shared it",
    prompt:
      "Help me split a bill. Ask about the items, people, who paid and how to divide it. Do not send payment requests.",
    upload:
      "Upload a receipt, review its items, then choose people and how to split it. Payment requests are a separate action.",
  },
};
export function AddEntryMethods({
  kind,
  workspaceId,
  accounts = [],
  children,
  onUpload,
  onUploadFiles,
  disabled = false,
  enabled = true,
  formContext,
  onReviewForm,
  initialMethod = "manual",
  onAccountsSynced,
}: {
  initialMethod?: "manual" | "connect";
  onAccountsSynced?: () => Promise<void> | void;
  kind: keyof typeof guidance;
  workspaceId?: string;
  accounts?: {
    id: string;
    name: string;
    institution: string | null;
    currency?: string | null;
    type: string;
  }[];
  children: ReactNode;
  onUpload?: () => void;
  onUploadFiles?: (files: File[]) => void;
  disabled?: boolean;
  enabled?: boolean;
  formContext?: EntryFormContext;
  onReviewForm?: (draft: AddFormDraft) => void;
}) {
  const [tab, setTab] = useState(initialMethod as string),
    [visited, setVisited] = useState(false),
    [isPro, setIsPro] = useState(false),
    [upload, setUpload] = useState(false),
    [files, setFiles] = useState<File[]>([]);
  const id = useId();
  const router = useRouter();
  useEffect(() => {
    let active = true;
    void fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (active) setIsPro((v?.user?.planTier === "pro" || v?.user?.planTier === "premium"));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  if (!enabled) return <>{children}</>;
  const info = guidance[kind];
  const methods = kind === "accounts" ? ["manual", "ask", "upload", "connect"] : ["manual", "ask", "upload"];
  return (
    <div className="add-entry-methods">
      <div
        className="transaction-creation-tabs"
        role="tablist"
        aria-label="How to add"
      >
        {methods.map((method, index) => (
          <button
            type="button"
            role="tab"
            key={method}
            id={`${id}-${method}`}
            aria-controls={`${id}-${method}-panel`}
            aria-selected={tab === method}
            tabIndex={tab === method ? 0 : -1}
            disabled={disabled}
            onClick={() => {
              setTab(method);
              if (method === "ask") setVisited(true);
            }}
            onKeyDown={(e) => {
              const n =
                e.key === "ArrowRight"
                  ? (index + 1) % methods.length
                  : e.key === "ArrowLeft"
                    ? (index + methods.length - 1) % methods.length
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? methods.length - 1
                        : null;
              if (n !== null) {
                e.preventDefault();
                setTab(methods[n]);
                if (methods[n] === "ask") setVisited(true);
                document.getElementById(`${id}-${methods[n]}`)?.focus();
              }
            }}
          >
            <img src={`/assets/organize/method-${method === "connect" ? "sync" : method}.svg`} width="18" height="18" alt="" />
            {method === "manual"
              ? "Manual"
              : method === "ask"
                ? "Ask Clover"
                : method === "connect" ? "Connect" : "Upload"}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-manual-panel`}
        aria-labelledby={`${id}-manual`}
        hidden={tab !== "manual"}
      >
        {children}
      </div>
      {visited ? (
        <div
          role="tabpanel"
          id={`${id}-ask-panel`}
          aria-labelledby={`${id}-ask`}
          hidden={tab !== "ask"}
        >
          <AdviserChat minimal
            formContext={formContext}
            onReviewForm={
              onReviewForm
                ? (draft) => {
                    onReviewForm(draft);
                    setTab("manual");
                  }
                : undefined
            }
            workspaceId={workspaceId}
            prompts={[]}
            isPro={isPro}
            surface={
              kind === "split"
                ? "general"
                : kind === "trade"
                  ? "investments"
                  : (kind as AdviserPlanningSurface)
            }
            pageLabel={info.title}
            initialPrompt=""
            storageKey={`clover-add-${kind}`}
          />
        </div>
      ) : null}
      <div
        role="tabpanel"
        id={`${id}-upload-panel`}
        aria-labelledby={`${id}-upload`}
        hidden={tab !== "upload"}
      >
        <h4>
          {kind === "split"
            ? "Upload a receipt"
            : "Upload statements, receipts, and screenshots"}
        </h4>
        {kind !== "accounts" && kind !== "recurring" && kind !== "investments" ? <p>{info.upload}</p> : null}
        {onUploadFiles ? <UploadSourcePicker onSelect={onUploadFiles} /> : onUpload ? (
          <button
            className="button button-primary"
            type="button"
            onClick={onUpload}
          >
            Choose file
          </button>
        ) : workspaceId ? (
          <UploadSourcePicker
            onSelect={(value) => {
              setFiles(value);
              setUpload(true);
            }}
          />
        ) : (
          <p>Choose a Profile before uploading.</p>
        )}
        <UploadSecurityCopy />
      </div>
      {kind === "accounts" && tab === "connect" ? <div role="tabpanel" id={`${id}-connect-panel`} aria-labelledby={`${id}-connect`}>{workspaceId ? <FinverseConnectButton workspaceId={workspaceId} onSynced={onAccountsSynced} /> : <p>Choose a Profile before connecting your bank.</p>}</div> : null}
      {workspaceId && upload ? (
        <ImportFilesModal
          open={upload}
          workspaceId={workspaceId}
          accounts={accounts}
          initialFiles={files}
          onInitialFilesConsumed={() => setFiles([])}
          onClose={() => setUpload(false)}
          onImported={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
