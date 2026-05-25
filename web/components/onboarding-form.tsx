"use client";

import dynamic from "next/dynamic";
import type { ChangeEvent } from "react";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageFileDropZone } from "@/components/page-file-drop-zone";
import { analyticsOnceKey, PostHogEvent } from "@/components/posthog-analytics";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import { getFinancialExperienceDefinition, getFinancialExperienceProfile, type FinancialExperienceLevel } from "@/lib/goals";

const ImportFilesModal = dynamic(
  () => import("@/components/import-files-modal").then((module) => module.ImportFilesModal),
  { ssr: false }
);

type ExperienceOption = {
  value: FinancialExperienceLevel;
  title: string;
  description: string;
  icon: string;
};

type OnboardingStep = "experience" | "upload";

const EXPERIENCE_OPTIONS: ExperienceOption[] = [
  {
    value: "beginner",
    title: "Still learning",
    description: "Keep the language simple and show me what matters first.",
    icon: "/onboarding-icons/beginner.png",
  },
  {
    value: "comfortable",
    title: "Comfortable",
    description: "I understand budgets, statements, and general money tracking.",
    icon: "/onboarding-icons/intermediate.png",
  },
  {
    value: "advanced",
    title: "Very comfortable",
    description: "Give me the numbers, trends, and short explanations.",
    icon: "/onboarding-icons/advanced.png",
  },
];

type OnboardingFormProps = {
  workspaceId: string;
  workspaceAccounts: Array<{
    id: string;
    name: string;
    institution: string | null;
    type: string;
  }>;
  currentExperience?: string | null;
};

const acceptedImportFiles = ".csv,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif";

const jsonHeaders = { "Content-Type": "application/json" };

export function OnboardingForm({
  workspaceId,
  workspaceAccounts,
  currentExperience = null,
}: OnboardingFormProps) {
  const router = useRouter();
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [experience, setExperience] = useState<FinancialExperienceLevel | null>(
    (currentExperience as FinancialExperienceLevel | null) ?? null,
  );
  const [step, setStep] = useState<OnboardingStep>("experience");
  const [message, setMessage] = useState("How comfortable are you with financial management?");
  const [isPending, startTransition] = useTransition();
  const [importOpen, setImportOpen] = useState(false);
  const [importSeedFiles, setImportSeedFiles] = useState<File[] | null>(null);

  const selectedExperienceProfile = getFinancialExperienceProfile(experience);
  const selectedExperienceDefinition = getFinancialExperienceDefinition(experience);

  const persistOnboarding = (startAction: "import" | "skip") => {
    const payload = JSON.stringify({
      experience,
      startAction,
      skipped: startAction === "skip",
    });

    void fetch("/api/onboarding", {
      method: "POST",
      headers: jsonHeaders,
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Best effort only. The visible flow should continue either way.
    });
  };

  const openImportFiles = (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    startTransition(() => {
      persistOnboarding("import");
      setMessage(`Opening ${files.length === 1 ? files[0].name : `${files.length} files`}...`);
      setImportSeedFiles(files);
      setImportOpen(true);
    });
  };

  const handleFilePickerChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    openImportFiles(files);
  };

  const handleSkip = () => {
    startTransition(() => {
      persistOnboarding("skip");
      setMessage("Opening your dashboard...");
      router.replace("/dashboard");
    });
  };

  const experienceStep = (
    <>
      <h3>How comfortable are you with financial management?</h3>
      <p className="onboarding-card__copy">{selectedExperienceProfile.onboardingLead}</p>

      <div className="onboarding-grid onboarding-grid--experience" role="list" aria-label="Financial experience">
        {EXPERIENCE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`onboarding-option onboarding-option--experience onboarding-option--experience-${option.value} ${experience === option.value ? "is-selected" : ""}`}
            onClick={() => {
              setExperience(option.value);
              setMessage(option.description);
            }}
            role="listitem"
            aria-pressed={experience === option.value}
          >
            <span className="onboarding-option__icon" aria-hidden="true">
              <img src={encodeURI(option.icon)} alt="" />
            </span>
            <span className="onboarding-option__content">
              <span className="onboarding-option__title-row">
                <span className="onboarding-option__title">{option.title}</span>
                {experience === option.value ? <span className="onboarding-option__badge">Selected</span> : null}
              </span>
              <span className="onboarding-option__copy">{option.description}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="onboarding-actions onboarding-actions--single">
        <div className="onboarding-actions__group onboarding-actions__group--primary">
          <button
            className="button button-primary"
            type="button"
            disabled={isPending || experience === null}
            onClick={() => {
              setStep("upload");
              setMessage("Upload a statement, screenshot, or receipt to see Clover read it with OCR.");
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </>
  );

  const uploadStep = (
    <>
      <h3>Upload your first file</h3>
      <p className="onboarding-card__copy">
        Drop a statement, screenshot, or receipt here. Clover will read it with OCR and show you the magic behind the import.
      </p>
      <p className="onboarding-card__copy onboarding-card__copy--subtle">
        On mobile, you can choose a photo or pick files from your device. On desktop, you can drag files straight onto this page.
      </p>

      <div
        className="onboarding-upload"
        role="presentation"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            fileInputRef.current?.click();
          }
        }}
      >
        <PageFileDropZone
          enabled={!importOpen}
          title="Drop statements, screenshots, or receipts anywhere"
          subtitle="Clover will start the import flow as soon as you release the files."
          onFilesDropped={(files) => openImportFiles(files)}
        />

        <div className="onboarding-upload__visual" aria-hidden="true">
          <span className="onboarding-upload__icon">
            <svg viewBox="0 0 24 24">
              <path d="M12 3v10" />
              <path d="m8 7 4-4 4 4" />
              <path d="M5 13v6h14v-6" />
            </svg>
          </span>
        </div>

        <div className="onboarding-upload__copy">
          <strong>Files only, nothing manual.</strong>
          <span>Use Clover to turn the file into transactions with OCR and parsing.</span>
        </div>

        <div className="onboarding-upload__actions">
          <button className="button button-primary" type="button" disabled={isPending} onClick={() => photoInputRef.current?.click()}>
            Upload photos
          </button>
          <button className="button button-secondary" type="button" disabled={isPending} onClick={() => fileInputRef.current?.click()}>
            Upload files
          </button>
        </div>
      </div>

      <input
        ref={photoInputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleFilePickerChange}
      />
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept={acceptedImportFiles}
        multiple
        onChange={handleFilePickerChange}
      />

      <div className="onboarding-actions">
        <div className="onboarding-actions__group onboarding-actions__group--secondary">
          <button
            className="button button-secondary"
            type="button"
            disabled={isPending}
            onClick={() => {
              setStep("experience");
              setMessage(selectedExperienceDefinition.description);
            }}
          >
            Back
          </button>
          <button className="button button-secondary" type="button" disabled={isPending} onClick={handleSkip}>
            Skip for now
          </button>
        </div>
        <div className="onboarding-actions__group onboarding-actions__group--primary" aria-hidden="true" />
      </div>
    </>
  );

  return (
    <>
      <PostHogEvent
        event="onboarding_started"
        onceKey={analyticsOnceKey("onboarding_started", "session")}
        properties={{
          current_experience: currentExperience ?? null,
        }}
      />
      <section className="glass onboarding-card">
        <div className="onboarding-card__brand" aria-label="Clover">
          <img className="onboarding-card__mark" src="/clover-mark.svg" alt="" aria-hidden="true" loading="eager" fetchPriority="high" />
        </div>

        {step === "experience" ? experienceStep : uploadStep}
        {message ? <p className="onboarding-card__message">{message}</p> : null}
      </section>

      <ImportFilesModal
        open={importOpen}
        workspaceId={workspaceId}
        accounts={workspaceAccounts}
        defaultAccountId={workspaceAccounts.find((account) => account.type !== "cash")?.id ?? workspaceAccounts[0]?.id ?? null}
        showManualTransactionLink={false}
        initialFiles={importSeedFiles}
        onInitialFilesConsumed={() => setImportSeedFiles(null)}
        onClose={() => {
          setImportOpen(false);
          setImportSeedFiles(null);
        }}
        onImported={async (summary: UploadInsightsSummary) => {
          if (summary.optimistic) {
            return;
          }

          setMessage("Import complete. Taking you to the dashboard.");
          router.replace("/dashboard");
        }}
      />
    </>
  );
}
