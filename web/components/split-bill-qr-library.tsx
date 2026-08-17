"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useCloverChrome } from "@/components/clover-shell";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";
import {
  detectPaymentQrProvider,
  getPaymentQrTheme,
} from "@/lib/payment-qr";
import { readSelectedWorkspaceId } from "@/lib/workspace-selection";

type PaymentProfile = {
  id: string;
  label: string;
  provider: string;
  currency: string;
  personName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  qrPayload: string | null;
  qrImageData: string | null;
  isDefault: boolean;
};

type QrDraft = {
  label: string;
  provider: string;
  currency: string;
  personName: string;
  accountName: string;
  accountNumber: string;
  qrPayload: string;
  qrImageData: string;
  isDefault: boolean;
};

type PaymentAccount = {
  id: string;
  name: string;
  institution: string | null;
  accountNumber: string | null;
  type: "bank" | "wallet";
  currency: string;
};

type BarcodeDetectorConstructor = new (options: { formats: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

const emptyDraft: QrDraft = {
  label: "",
  provider: "",
  currency: "PHP",
  personName: "",
  accountName: "",
  accountNumber: "",
  qrPayload: "",
  qrImageData: "",
  isDefault: false,
};

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_SAVED_DATA_LENGTH = 1_450_000;

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image could not be opened."));
    };
    image.src = url;
  });

const drawImageToCanvas = (image: HTMLImageElement, maxDimension: number) => {
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser could not prepare the QR image.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, context };
};

async function decodeQr(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  const BarcodeDetector = (window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (BarcodeDetector) {
    try {
      const results = await new BarcodeDetector({ formats: ["qr_code"] }).detect(canvas);
      const payload = results.find((result) => result.rawValue)?.rawValue;
      if (payload) return payload;
    } catch {
      // The pure JavaScript decoder below covers browsers without a working detector.
    }
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { default: jsQR } = await import("jsqr");
  const direct = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
  if (direct?.data) return direct.data;

  const contrasted = new Uint8ClampedArray(imageData.data);
  for (let index = 0; index < contrasted.length; index += 4) {
    const luminance = contrasted[index] * 0.299 + contrasted[index + 1] * 0.587 + contrasted[index + 2] * 0.114;
    const value = luminance > 148 ? 255 : 0;
    contrasted[index] = value;
    contrasted[index + 1] = value;
    contrasted[index + 2] = value;
  }
  return jsQR(contrasted, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

const compressQrImage = (image: HTMLImageElement) => {
  let maxDimension = 1_200;
  let quality = 0.9;
  let encoded = "";

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { canvas } = drawImageToCanvas(image, maxDimension);
    encoded = canvas.toDataURL("image/jpeg", quality);
    if (encoded.length <= MAX_SAVED_DATA_LENGTH) break;
    maxDimension = Math.round(maxDimension * 0.82);
    quality = Math.max(0.7, quality - 0.05);
  }

  if (!encoded || encoded.length > MAX_SAVED_DATA_LENGTH) {
    throw new Error("This image is too large. Please crop it closer to the QR code and try again.");
  }
  return encoded;
};

const profileToDraft = (profile: PaymentProfile): QrDraft => ({
  label: profile.label,
  provider: profile.provider,
  currency: profile.currency,
  personName: profile.personName ?? "",
  accountName: profile.accountName ?? "",
  accountNumber: profile.accountNumber ?? "",
  qrPayload: profile.qrPayload ?? "",
  qrImageData: profile.qrImageData ?? "",
  isDefault: profile.isDefault,
});

export function SplitBillQrLibrary() {
  const { setMobileOverlayChrome } = useCloverChrome();
  const [profiles, setProfiles] = useState<PaymentProfile[]>([]);
  const [draft, setDraft] = useState<QrDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [viewingProfile, setViewingProfile] = useState<PaymentProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [selectedPaymentAccountId, setSelectedPaymentAccountId] = useState("");
  const [isLoadingPaymentAccounts, setIsLoadingPaymentAccounts] = useState(false);
  const chooseInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const editorNameInputRef = useRef<HTMLInputElement>(null);

  const closeEditor = useCallback(() => {
    setIsEditorOpen(false);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/split-bill-payment-profiles")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to load saved payment options.");
        if (active) setProfiles(payload.profiles ?? []);
      })
      .catch(() => active && setError("Saved payment options could not load. Please try again."))
      .finally(() => active && setIsLoading(false));
    capturePostHogClientEvent("split_bill_qr_viewed");
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadPaymentAccounts = async () => {
      setIsLoadingPaymentAccounts(true);
      try {
        let workspaceId = readSelectedWorkspaceId();
        if (!workspaceId) {
          const workspaceResponse = await fetch("/api/workspaces", { cache: "no-store" });
          const workspacePayload = await workspaceResponse.json();
          workspaceId = workspaceResponse.ok && Array.isArray(workspacePayload.workspaces)
            ? String(workspacePayload.workspaces[0]?.id ?? "")
            : "";
        }
        if (!workspaceId) throw new Error("No active profile");

        const response = await fetch(
          `/api/split-bill-payment-accounts?workspaceId=${encodeURIComponent(workspaceId)}`,
          { cache: "no-store" },
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to load accounts");
        if (active) setPaymentAccounts(Array.isArray(payload.accounts) ? payload.accounts : []);
      } catch {
        if (active) setPaymentAccounts([]);
      } finally {
        if (active) setIsLoadingPaymentAccounts(false);
      }
    };

    void loadPaymentAccounts();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isEditorOpen && !viewingProfile) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsEditorOpen(false);
        setViewingProfile(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isEditorOpen, viewingProfile]);

  useEffect(() => {
    if (!isEditorOpen) {
      setMobileOverlayChrome(null);
      return;
    }

    const mobileQuery = window.matchMedia("(max-width: 1100px)");
    const syncMobileChrome = () => {
      setMobileOverlayChrome(
        mobileQuery.matches
          ? { title: editingId ? "Edit Payment Option" : "Add Payment Option", onBack: closeEditor }
          : null,
      );
    };

    syncMobileChrome();
    mobileQuery.addEventListener("change", syncMobileChrome);
    return () => {
      mobileQuery.removeEventListener("change", syncMobileChrome);
      setMobileOverlayChrome(null);
    };
  }, [closeEditor, editingId, isEditorOpen, setMobileOverlayChrome]);

  useLayoutEffect(() => {
    if (!isEditorOpen && !viewingProfile) return;

    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.dataset.splitBillModalOpen = "true";
    body.style.overflow = "hidden";

    return () => {
      if (body.dataset.splitBillModalOpen === "true") {
        body.dataset.splitBillModalOpen = "false";
      }
      body.style.overflow = previousOverflow;
    };
  }, [isEditorOpen, viewingProfile]);

  useEffect(() => {
    if (!isEditorOpen) return;
    if (!window.matchMedia("(min-width: 1101px)").matches) return;
    const frame = window.requestAnimationFrame(() => editorNameInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isEditorOpen]);

  useEffect(() => {
    if (!isEditorOpen || selectedPaymentAccountId || paymentAccounts.length === 0 || !draft.provider) return;
    const normalizedNumber = draft.accountNumber.replace(/\D/g, "");
    const match = paymentAccounts.find((account) => {
      const provider = (account.institution || account.name).trim().toLowerCase();
      const accountNumber = (account.accountNumber ?? "").replace(/\D/g, "");
      return provider === draft.provider.trim().toLowerCase() && (!normalizedNumber || accountNumber === normalizedNumber);
    });
    if (match) setSelectedPaymentAccountId(match.id);
  }, [draft.accountNumber, draft.provider, isEditorOpen, paymentAccounts, selectedPaymentAccountId]);

  const openCreate = () => {
    setDraft({ ...emptyDraft, isDefault: profiles.length === 0 });
    setSelectedPaymentAccountId("");
    setEditingId(null);
    setNotice(null);
    setError(null);
    setIsEditorOpen(true);
  };

  useEffect(() => {
    const handleOpenPaymentOption = () => {
      setDraft({ ...emptyDraft, isDefault: profiles.length === 0 });
      setSelectedPaymentAccountId("");
      setEditingId(null);
      setNotice(null);
      setError(null);
      setIsEditorOpen(true);
    };
    window.addEventListener("clover:open-payment-option", handleOpenPaymentOption);
    return () => window.removeEventListener("clover:open-payment-option", handleOpenPaymentOption);
  }, [profiles.length]);

  const openEdit = (profile: PaymentProfile) => {
    setDraft(profileToDraft(profile));
    setSelectedPaymentAccountId("");
    setEditingId(profile.id);
    setNotice(null);
    setError(null);
    setIsEditorOpen(true);
  };

  const selectPaymentAccount = (accountId: string) => {
    setSelectedPaymentAccountId(accountId);
    const account = paymentAccounts.find((item) => item.id === accountId);
    if (!account) {
      setDraft((current) => ({ ...current, provider: "", accountNumber: "" }));
      return;
    }

    const provider = account.institution?.trim() || account.name.trim();
    setDraft((current) => ({
      ...current,
      label: current.label.trim() ? current.label : `My ${account.name}`,
      provider,
      currency: account.currency,
      accountNumber: account.accountNumber ?? "",
    }));
  };

  const formatPaymentAccountLabel = (account: PaymentAccount) => {
    const digits = account.accountNumber?.replace(/\D/g, "") ?? "";
    const suffix = digits ? ` •••• ${digits.slice(-4)}` : "";
    return `${account.name}${suffix} · ${account.currency}`;
  };

  const readImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const source = cameraInputRef.current === event.currentTarget ? "camera" : "file";
    event.target.value = "";
    if (!file) return;
    setError(null);
    setNotice(null);
    if (!/^image\/(?:png|jpeg|webp)$/i.test(file.type)) {
      setError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError("This image is too large. Choose an image under 12 MB.");
      return;
    }

    setIsReading(true);
    try {
      const image = await loadImage(file);
      const { canvas, context } = drawImageToCanvas(image, 1_600);
      const payload = await decodeQr(canvas, context);
      const detection = detectPaymentQrProvider(payload, file.name);
      const imageData = compressQrImage(image);
      setDraft((current) => ({
        ...current,
        label: current.label || (detection.provider === "Other" ? "Payment QR" : `${detection.provider} QR`),
        qrPayload: payload ?? "",
        qrImageData: imageData,
      }));
      const matchingAccount = paymentAccounts.find((account) =>
        `${account.institution ?? ""} ${account.name}`.toLowerCase().includes(detection.provider.toLowerCase())
      );
      if (matchingAccount) selectPaymentAccount(matchingAccount.id);
      setNotice(payload ? detection.reason : "Image added. Confirm the bank so it is easy to recognize.");
      capturePostHogClientEvent("split_bill_qr_uploaded", {
        provider: detection.provider,
        detection_confidence: detection.confidence,
        qr_decoded: Boolean(payload),
        source,
      });
      if (!payload) capturePostHogClientEvent("split_bill_qr_detection_failed", { file_type: file.type });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "This QR image could not be read.");
      capturePostHogClientEvent("split_bill_qr_detection_failed", { file_type: file.type });
    } finally {
      setIsReading(false);
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch(
        editingId ? `/api/split-bill-payment-profiles/${editingId}` : "/api/split-bill-payment-profiles",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to save this payment option.");
      setProfiles((current) => {
        const next = editingId
          ? current.map((profile) => (profile.id === editingId ? payload.profile : profile))
          : [payload.profile, ...current];
        return payload.profile.isDefault
          ? next.map((profile) => ({ ...profile, isDefault: profile.id === payload.profile.id }))
          : next;
      });
      capturePostHogClientEvent(editingId ? "split_bill_qr_updated" : "split_bill_qr_saved", {
        provider: payload.profile.provider,
        qr_decoded: Boolean(payload.profile.qrPayload),
      });
      window.dispatchEvent(new Event("clover:payment-options-changed"));
      setIsEditorOpen(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to save this payment option.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteProfile = async (profile: PaymentProfile) => {
    if (!window.confirm(`Delete ${profile.label}? This payment option will no longer be available for requests.`)) return;
    setError(null);
    try {
      const response = await fetch(`/api/split-bill-payment-profiles/${profile.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to delete this payment option.");
      setProfiles((current) => {
        const next = current.filter((item) => item.id !== profile.id);
        if (profile.isDefault && next[0]) next[0] = { ...next[0], isDefault: true };
        return next;
      });
      capturePostHogClientEvent("split_bill_qr_deleted", { provider: profile.provider });
      window.dispatchEvent(new Event("clover:payment-options-changed"));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to delete this payment option.");
    }
  };

  return (
    <section className="split-bill-qr-library panel glass" aria-labelledby="split-bill-qr-title">
      <div className="split-bill-qr-library__head">
        <div>
          <h2 id="split-bill-qr-title">Payment Options</h2>
          <p>Save bank details or a QR code once, then share the right option with a payment request.</p>
        </div>
        <button className="button button-primary button-small transactions-action-button" type="button" onClick={openCreate}>
          <span aria-hidden="true">+</span> Add option
        </button>
      </div>

      {error && !isEditorOpen ? <p className="split-bill-qr-library__error" role="alert">{error}</p> : null}
      {isLoading ? (
        <div className="split-bill-qr-library__loading" aria-label="Loading saved QR codes">
          <span /><span /><span />
        </div>
      ) : profiles.length > 0 ? (
        <div className="split-bill-qr-library__grid">
          {profiles.map((profile) => {
            const theme = getPaymentQrTheme(profile.provider);
            return (
              <article
                className="split-bill-qr-card"
                key={profile.id}
                style={{ "--qr-start": theme.start, "--qr-end": theme.end, "--qr-accent": theme.accent } as CSSProperties}
              >
                <div className="split-bill-qr-card__copy">
                  <div className="split-bill-qr-card__provider">
                    <span aria-hidden="true">▦</span>
                    <strong>{profile.provider}</strong>
                    {profile.isDefault ? <small>Default</small> : null}
                  </div>
                  <h3>{profile.label}</h3>
                  <p>{profile.accountName || "Ready to share"}</p>
                  {profile.accountNumber ? <span>{profile.accountNumber}</span> : null}
                </div>
                {profile.qrImageData ? (
                  <button className="split-bill-qr-card__image" type="button" onClick={() => setViewingProfile(profile)} aria-label={`View ${profile.label} QR code`}>
                    <img src={profile.qrImageData} alt={`${profile.provider} payment QR code`} />
                  </button>
                ) : (
                  <div className="split-bill-qr-card__image split-bill-qr-card__image--details" aria-hidden="true">BANK</div>
                )}
                <div className="split-bill-qr-card__actions">
                  <button type="button" onClick={() => openEdit(profile)}>Edit</button>
                  <button type="button" onClick={() => void deleteProfile(profile)}>Delete</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <button className="split-bill-qr-library__empty" type="button" onClick={openCreate}>
          <span aria-hidden="true">▦</span>
          <strong>Keep your payment details ready</strong>
          <small>Add bank details, a QR image, or both.</small>
        </button>
      )}

      {isEditorOpen && typeof document !== "undefined" ? createPortal(
        <div className="split-bill-modal split-bill-qr-modal split-bill-qr-editor-surface" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeEditor()}>
          <form className="split-bill-modal__card split-bill-qr-editor panel glass" onSubmit={saveProfile} role="dialog" aria-modal="true" aria-labelledby="split-bill-qr-editor-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="split-bill-qr-editor__head">
              <div>
                <p className="eyebrow">Payment Options</p>
                <h3 id="split-bill-qr-editor-title">{editingId ? "Edit Payment Option" : "Add Payment Option"}</h3>
                <p>Add bank details, a QR code, or both.</p>
              </div>
              <button className="split-bill-qr-editor__close" type="button" aria-label="Back to Split Bills" onClick={closeEditor}>
                <span className="split-bill-qr-editor__close-mobile" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="split-bill-qr-editor__close-desktop" aria-hidden="true">×</span>
              </button>
            </div>

            <div className="split-bill-qr-editor__fields">
              <label>
                <span>Name</span>
                <input ref={editorNameInputRef} value={draft.label} maxLength={80} required placeholder="My GCash" onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} />
              </label>
              <label>
                <span>Bank</span>
                <select
                  value={selectedPaymentAccountId}
                  required
                  disabled={isLoadingPaymentAccounts || paymentAccounts.length === 0}
                  onChange={(event) => selectPaymentAccount(event.target.value)}
                >
                  <option value="">
                    {isLoadingPaymentAccounts
                      ? "Loading banks and wallets…"
                      : paymentAccounts.length === 0
                        ? "No bank or wallet accounts available"
                        : "Select a bank or wallet"}
                  </option>
                  {paymentAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{formatPaymentAccountLabel(account)}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Account name <small>Optional</small></span>
                <input value={draft.accountName} maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, accountName: event.target.value }))} />
              </label>
              <label>
                <span>Account number <small>Optional</small></span>
                <input value={draft.accountNumber} maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, accountNumber: event.target.value }))} />
              </label>
            </div>

            <div className="split-bill-qr-editor__upload-block">
              <div>
                <strong>QR Code <small>Optional</small></strong>
                <span>Upload a saved image, screenshot, or clear photo.</span>
              </div>
              <div className="split-bill-qr-editor__upload-row">
                <input ref={chooseInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={readImage} />
                <input ref={cameraInputRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={readImage} />
                <button className="button button-secondary button-small" type="button" disabled={isReading} onClick={() => chooseInputRef.current?.click()}>
                  {draft.qrImageData ? "Replace QR" : "Upload QR"}
                </button>
                <button className="button button-secondary button-small split-bill-qr-editor__camera" type="button" disabled={isReading} onClick={() => cameraInputRef.current?.click()}>
                  Take photo
                </button>
                {isReading ? <span className="split-bill-qr-editor__reading">Reading QR…</span> : null}
              </div>
            </div>

            {draft.qrImageData ? (
              <div className="split-bill-qr-editor__preview">
                <img src={draft.qrImageData} alt="QR preview" />
                <div>
                  <strong>{draft.provider}</strong>
                  <span>{notice ?? (draft.qrPayload ? "QR code verified" : "Image ready")}</span>
                </div>
              </div>
            ) : null}
            {error ? <p className="split-bill-qr-library__error" role="alert">{error}</p> : null}
            <div className="split-bill-qr-editor__actions">
              <button className="button button-primary button-small" type="submit" disabled={isSaving || isReading || !draft.label.trim() || !selectedPaymentAccountId}>
                {isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      ) : null}

      {viewingProfile && typeof document !== "undefined" ? createPortal(
        <div className="split-bill-modal split-bill-qr-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setViewingProfile(null)}>
          <div className="split-bill-modal__card split-bill-qr-viewer panel glass" role="dialog" aria-modal="true" aria-label={viewingProfile.label}>
            <button className="split-bill-qr-editor__close" type="button" aria-label="Close" onClick={() => setViewingProfile(null)}>×</button>
            <img src={viewingProfile.qrImageData ?? ""} alt={`${viewingProfile.provider} payment QR code`} />
            <div>
              <strong>{viewingProfile.label}</strong>
              <span>{viewingProfile.provider}{viewingProfile.accountNumber ? ` · ${viewingProfile.accountNumber}` : ""}</span>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}
