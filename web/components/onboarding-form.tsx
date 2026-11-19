"use client";

import { getEntryMethodIconSrc } from "@/lib/entry-method-icons";

import dynamic from "next/dynamic";
import type { ChangeEvent } from "react";
import { UploadSourceButtons } from "@/components/upload-source-buttons";
import { PUBLIC_IMPORT_ACCEPT } from "@/lib/import-format-policies";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageFileDropZone } from "@/components/page-file-drop-zone";
import { analyticsOnceKey, PostHogEvent } from "@/components/posthog-analytics";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import { getFinancialExperienceDefinition, type FinancialExperienceLevel } from "@/lib/goals";
import { type PricingMarket } from "@/lib/public-plan-comparison";
import { OnboardingPlanOffers } from './onboarding-plan-offers';
import upgradeStyles from './onboarding-plan-offers.module.css';
import { onboardingCanConnect, readOnboardingUpgradeDraft, stageAfterVerifiedUpgrade } from '../../shared/onboarding-upgrade';
import type { CloverPlanTier } from '../../shared/plan-catalog';
import { CloverRouteLoadingScreen } from "@/components/clover-route-loading-screen";
import { CurrencySelector } from "@/components/currency-selector";
import { getCurrencyCatalogCodes, getCurrencyCatalogOption } from "@/lib/currencies";
import {
  normalizeRegionalPreferences,
  persistRegionalPreferences,
  type RegionalPreferences,
} from "@/lib/regional-preferences";

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

type OnboardingStep = "upgrade" | "experience" | "upload";

const EXPERIENCE_OPTIONS: ExperienceOption[] = [
  {
    value: "beginner",
    title: "Still learning",
    description: "Keep the language simple and show me what matters first.",
    icon: "/assets/3d%20icons/beginner.png?v=20260724",
  },
  {
    value: "comfortable",
    title: "Comfortable",
    description: "I understand budgets, statements, and general money tracking.",
    icon: "/assets/3d%20icons/intermediate.png?v=20260724",
  },
  {
    value: "advanced",
    title: "Very comfortable",
    description: "Give me the numbers, trends, and short explanations.",
    icon: "/assets/3d%20icons/advanced.png?v=20260724",
  },
];

type OnboardingFormProps = {
  workspaceId: string;
  billingCustomerId: string;
  workspaceAccounts: Array<{
    id: string;
    name: string;
    institution: string | null;
    type: string;
  }>;
  currentExperience?: string | null;
  upgradeForPro?: boolean;
  upgradeInterval?: "monthly" | "annual";
  paypalClientId?: string | null;
  paypalMonthlyPlanId?: string | null;
  paypalAnnualPlanId?: string | null;
  paypalBuyerCountry?: string | null;
  pricingMarket?: PricingMarket;
  completionUrl?: string;
  regionalDefaults: RegionalPreferences;
  initialPlanTier?: CloverPlanTier;
  customerEmail?: string;
  paddleClientToken?: string | null;
  paddleEnvironment?: 'sandbox' | 'live';
};

const jsonHeaders = { "Content-Type": "application/json" };

export function OnboardingForm({
  workspaceId,
  billingCustomerId,
  workspaceAccounts,
  currentExperience = null,
  upgradeForPro = false,
  upgradeInterval = "annual",
  paypalClientId = null,
  paypalMonthlyPlanId = null,
  paypalAnnualPlanId = null,
  paypalBuyerCountry = null,
  pricingMarket = "global",
  completionUrl = "/dashboard",
  regionalDefaults,
  initialPlanTier = 'free', customerEmail = '', paddleClientToken = null, paddleEnvironment = 'sandbox',
}: OnboardingFormProps) {
  const router = useRouter();
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [experience, setExperience] = useState<FinancialExperienceLevel | null>(
    (currentExperience as FinancialExperienceLevel | null) ?? null,
  );
  const [step, setStep] = useState<OnboardingStep>(onboardingCanConnect(initialPlanTier) ? "experience" : "upgrade");
  const [message, setMessage] = useState<string | null>(null);
  const [planTier, setPlanTier] = useState(initialPlanTier);
  const [returnStep, setReturnStep] = useState<'experience' | 'upload'>('experience');
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const draftKey = `clover:onboarding-upgrade:v1:${billingCustomerId}`;
  useEffect(() => {
    try { const draft = readOnboardingUpgradeDraft(sessionStorage.getItem(draftKey));
      if (draft) { setStep(onboardingCanConnect(initialPlanTier) && draft.step === 'upgrade' ? stageAfterVerifiedUpgrade(initialPlanTier,draft.returnStep,draft.experience) : draft.step); setExperience(draft.experience); setReturnStep(draft.returnStep); setCheckoutPending(draft.pending && !onboardingCanConnect(initialPlanTier)); if(draft.pending && draft.returnStep==='upload')setAccountMethod('connect'); }
    } catch { /* In-memory setup still works without browser storage. */ }
    setDraftReady(true);
  }, [draftKey, initialPlanTier]);
  useEffect(() => { if (!draftReady) return; try { sessionStorage.setItem(draftKey,JSON.stringify({step,returnStep,experience,pending:checkoutPending})); } catch {} }, [draftReady,draftKey,step,returnStep,experience,checkoutPending]);
  const [isPending, startTransition] = useTransition();
  const [isCompleting, setIsCompleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [accountMethod, setAccountMethod] = useState<"connect" | "upload" | "manual">("upload");
  const [importSeedFiles, setImportSeedFiles] = useState<File[] | null>(null);
  const [regionalPreferences, setRegionalPreferences] = useState<RegionalPreferences>(regionalDefaults);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [isSavingCurrency, setIsSavingCurrency] = useState(false);

  const getBrowserRegionalDefaults = () =>
    normalizeRegionalPreferences({
      ...regionalPreferences,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || regionalPreferences.timeZone,
      locale: navigator.languages?.[0] || navigator.language || regionalPreferences.locale,
    });

  useEffect(() => {
    const resolved = normalizeRegionalPreferences({
      ...regionalDefaults,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || regionalDefaults.timeZone,
      locale: navigator.languages?.[0] || navigator.language || regionalDefaults.locale,
    });
    setRegionalPreferences(resolved);
    persistRegionalPreferences(resolved);
    // The server-provided defaults change only when this onboarding page is recreated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionalDefaults]);

  const selectedExperienceDefinition = getFinancialExperienceDefinition(experience);
  const selectedCurrency = getCurrencyCatalogOption(regionalPreferences.baseCurrency);

  const planOffers = <OnboardingPlanOffers embedded={step === "upload"} customerId={billingCustomerId} email={customerEmail} paddleClientToken={paddleClientToken} paddleEnvironment={paddleEnvironment} paypalClientId={paypalClientId} paypalBuyerCountry={paypalBuyerCountry} interval={upgradeInterval} pending={checkoutPending}
    onPending={() => { setCheckoutPending(true); setReturnStep(step === 'upload' ? 'upload' : 'experience'); }}
    onVerified={tier => { setPlanTier(tier); setCheckoutPending(false); setStep(stageAfterVerifiedUpgrade(tier,step === 'upload' ? 'upload' : returnStep,experience)); setMessage(`${tier === 'premium' ? 'Pro' : 'Plus'} access verified. Bank connections are ready.`); }} />;

  const persistOnboarding = async (startAction: "import" | "skip" | "connect" | "manual") => {
    const preferences = getBrowserRegionalDefaults();
    persistRegionalPreferences(preferences);
    const payload = JSON.stringify({
      experience,
      startAction,
      skipped: startAction === "skip",
      regionalPreferences: preferences,
    });

    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: jsonHeaders,
      body: payload,
      keepalive: true,
    });
    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(result?.error || "Unable to finish Clover setup.");
    }
    try { sessionStorage.removeItem(draftKey); } catch {}
  };

  const saveRegionalPreferences = async () => {
    const preferences = getBrowserRegionalDefaults();
    persistRegionalPreferences(preferences);
    const response = await fetch("/api/onboarding", {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ regionalPreferences: preferences }),
    });
    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(result?.error || "Unable to save your default currency.");
    }
    return preferences;
  };

  const openImportFiles = (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    startTransition(() => {
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
    setIsCompleting(true);
    setMessage(completionUrl === "/dashboard" ? "Opening your dashboard..." : "Opening your Circle invitation...");
    void persistOnboarding("skip")
      .then(() => router.replace(completionUrl))
      .catch((error) => {
        setIsCompleting(false);
        setMessage(error instanceof Error ? error.message : "Unable to finish Clover setup.");
      });
  };

  const experienceStep = (
    <>
      <h3>How comfortable are you with financial management?</h3>
      <div className="onboarding-grid onboarding-grid--experience" role="group" aria-label="Financial experience">
        {EXPERIENCE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`onboarding-option onboarding-option--experience onboarding-option--experience-${option.value} ${experience === option.value ? "is-selected" : ""}`}
            onClick={() => {
              setExperience(option.value);
              setMessage(option.description);
            }}

            aria-pressed={experience === option.value}
          >
            <span className="onboarding-option__icon" aria-hidden="true">
            <img src={option.icon} alt="" loading="eager" decoding="async" />
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

      <div className="onboarding-currency">
        <div className="onboarding-currency__copy">
          <strong>Default currency</strong>
          <span>
            {regionalPreferences.detectionSource === "manual"
              ? `${selectedCurrency.name} will be used for your starter Cash account.`
              : `Suggested from your location or device. You can change it now.`}
          </span>
        </div>
        <CurrencySelector
          value={regionalPreferences.baseCurrency}
          options={getCurrencyCatalogCodes()}
          onChange={(baseCurrency) => {
            setCurrencyError(null);
            setRegionalPreferences((current) => ({
              ...current,
              baseCurrency,
              detectionSource: "manual",
            }));
          }}
          showFullName
          ariaLabel="Select your default currency"
          className="onboarding-currency__selector"
          buttonClassName="onboarding-currency__button"
          menuClassName="onboarding-currency__menu"
          showGroupedSections
          portalMenu
        />
      </div>
      {currencyError ? <p className="onboarding-currency__error" role="alert">{currencyError}</p> : null}

      <div className="onboarding-actions onboarding-actions--single">
        <div className="onboarding-actions__group onboarding-actions__group--primary">
          <button
            className="button button-primary"
            type="button"
            disabled={isPending || isSavingCurrency || experience === null}
            onClick={() => {
              setIsSavingCurrency(true);
              setCurrencyError(null);
              void saveRegionalPreferences()
                .then((preferences) => {
                  setRegionalPreferences(preferences);
                  setStep("upload");
                  setMessage(null);
                })
                .catch((error) => {
                  setCurrencyError(error instanceof Error ? error.message : "Unable to save your default currency.");
                })
                .finally(() => setIsSavingCurrency(false));
            }}
          >
            {isSavingCurrency ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    </>
  );

  const uploadStep = (
    <>
      <h3>Record your first transaction</h3>
      <div className={upgradeStyles.firstChoices} role="group" aria-label="Add your accounts">
        {(['connect','upload'] as const).map(method => <button type="button" key={method} id={`onboarding-${method}`} aria-pressed={accountMethod===method} onClick={()=>setAccountMethod(method)}><img src={getEntryMethodIconSrc(method)} width={32} height={32} alt="" /><strong>{method==='connect'?'Connect a bank':'Upload documents'}</strong><span>{method==='connect'?'Automatic bank sync':'Statements and receipts'}</span></button>)}
      </div>
      <button type="button" className={upgradeStyles.manual} id="onboarding-manual" onClick={()=>setAccountMethod('manual')}>Add a transaction manually →</button>
      <div role="tabpanel" id={`onboarding-${accountMethod}-panel`} aria-labelledby={`onboarding-${accountMethod}`} className="onboarding-account-method">
        {accountMethod === "upload" ? <>
          <h4>Add a statement or receipt</h4>
          <PageFileDropZone enabled={!importOpen} title="Add a statement or receipt" subtitle="Drop a file to get started." onFilesDropped={openImportFiles} />
          <button type="button" className="onboarding-desktop-drop" onClick={() => fileInputRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); openImportFiles(Array.from(event.dataTransfer.files)); }}>Drop files here or choose files</button>
          <div className="onboarding-mobile-sources"><UploadSourceButtons onFiles={() => fileInputRef.current?.click()} onCamera={() => photoInputRef.current?.click()} onLibrary={() => libraryInputRef.current?.click()} /></div>
          <input ref={photoInputRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={handleFilePickerChange} />
          <input ref={libraryInputRef} className="sr-only" type="file" accept="image/*" multiple onChange={handleFilePickerChange} />
          <input ref={fileInputRef} className="sr-only" type="file" accept={PUBLIC_IMPORT_ACCEPT} multiple onChange={handleFilePickerChange} />
        </> : <>
          <h4>{accountMethod === "connect" ? "Connect a supported bank" : "Add a transaction manually"}</h4>
          <p className="onboarding-card__copy">{accountMethod === "connect" ? "Choose your bank and securely link the accounts you want to see in Clover." : "Record something you spent or earned. You can use Cash and add other accounts later."}</p>
          {accountMethod === "connect" && !onboardingCanConnect(planTier) ? <div className={upgradeStyles.upsell}><p>Choose Plus or Pro to connect your bank. You can also upload documents on Free.</p>{planOffers}</div> : null}
          {accountMethod !== "connect" || onboardingCanConnect(planTier) ? <button className="button button-primary" type="button" disabled={isCompleting} onClick={() => {
            const method = accountMethod;
            if (method === 'connect' && !onboardingCanConnect(planTier)) return;
            setIsCompleting(true);
            void persistOnboarding(method).then(() => router.replace(method === "manual" ? "/transactions?manual=1" : "/accounts/new?onboarding=connect")).catch(error => { setIsCompleting(false); setMessage(error instanceof Error ? error.message : "Unable to continue setup."); });
          }}>{accountMethod === "connect" ? "Connect a bank" : "Add transaction"}</button> : null}
        </>}
      </div>

      <div className="onboarding-actions onboarding-actions--upload">
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

  const upgradeStep = <>
    {planOffers}
    <button className={`button button-secondary ${upgradeStyles.free}`} type="button" onClick={() => { setStep(experience && returnStep === 'upload' ? 'upload' : 'experience'); setMessage(null); }}>{checkoutPending ? 'Continue setup' : 'Continue with Free'}</button>
    <p className={upgradeStyles.freeHint}>No card required for Free. You can upgrade later.</p>
  </>;

  if (isCompleting) {
    return <CloverRouteLoadingScreen label="Clover" viewport />;
  }

  return (
    <>
      <PostHogEvent
        event="onboarding_started"
        onceKey={analyticsOnceKey("onboarding_started", "session")}
        properties={{
          current_experience: currentExperience ?? null,
        }}
      />
      <section className="glass onboarding-card onboarding-card--plans">
        <div className="onboarding-icon-preload" aria-hidden="true">
          {EXPERIENCE_OPTIONS.map((option) => (
            <img key={option.value} src={option.icon} alt="" width={1} height={1} loading="eager" decoding="async" />
          ))}
        </div>
        <div className={`onboarding-card__brand ${step === "upgrade" ? upgradeStyles.brand : ""}`} aria-label="Clover">
          <img className="onboarding-card__mark" src={step === "upgrade" ? "/clover-mark.svg" : step === "experience" ? "/assets/mascots/velvet-chat.webp" : accountMethod === "connect" ? "/assets/mascots/velvet-banks.webp" : accountMethod === "upload" ? "/assets/mascots/velvet-receipt.webp" : "/assets/mascots/velvet-manual.webp"} alt="" aria-hidden="true" loading="eager" fetchPriority="high" />
          {step === "upgrade" ? <strong>Welcome to Clover</strong> : null}
        </div>

        {step === "upgrade" ? upgradeStep : step === "experience" ? experienceStep : uploadStep}
        {message && step !== "experience" ? <p className="onboarding-card__message">{message}</p> : null}
      </section>

      {importOpen ? (
        <ImportFilesModal
          open
          workspaceId={workspaceId}
          accounts={workspaceAccounts}
          defaultAccountId={workspaceAccounts.find((account) => account.type !== "cash")?.id ?? workspaceAccounts[0]?.id ?? null}
          showManualTransactionLink={false}
          initialFiles={importSeedFiles}
          onInitialFilesConsumed={() => setImportSeedFiles(null)}
          onClose={() => {
            setImportOpen(false);
            setImportSeedFiles(null);
            setMessage("");
          }}
          onImported={async (summary: UploadInsightsSummary) => {
            if (summary.optimistic) {
              return;
            }

            try {
              setIsCompleting(true);
              await persistOnboarding("import");
              setMessage(completionUrl === "/dashboard" ? "Import complete. Taking you to the dashboard." : "Import complete. Opening your Circle invitation.");
              router.replace(completionUrl);
            } catch (error) {
              setIsCompleting(false);
              setMessage(error instanceof Error ? error.message : "Unable to finish Clover setup.");
            }
          }}
        />
      ) : null}
    </>
  );
}
