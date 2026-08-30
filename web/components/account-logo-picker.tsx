"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { GENERIC_ACCOUNT_LOGO_OPTIONS, INSTITUTION_ACCOUNT_LOGO_OPTIONS } from "@/lib/account-logo";
import type { AccountBrand } from "@/lib/account-brand";

const CUSTOM_LOGO_SIZE = 256;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Clover could not read that image."));
    };
    image.src = objectUrl;
  });

const prepareCustomLogo = async (file: File) => {
  if (!/^image\/(?:png|jpeg|webp)$/i.test(file.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Choose an image smaller than 8 MB.");
  }

  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = CUSTOM_LOGO_SIZE;
  canvas.height = CUSTOM_LOGO_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Clover could not prepare that image.");

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, CUSTOM_LOGO_SIZE, CUSTOM_LOGO_SIZE);
  return canvas.toDataURL("image/webp", 0.82);
};

export function AccountLogoPicker({
  accountBrand,
  accountName,
  currentLogoUrl,
  onCommit,
}: {
  accountBrand: AccountBrand;
  accountName: string;
  currentLogoUrl?: string | null;
  onCommit: (logoUrl: string | null) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const savingRef = useRef(false);
  savingRef.current = saving;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  const commit = async (logoUrl: string | null) => {
    if (saving || logoUrl === (currentLogoUrl ?? null)) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onCommit(logoUrl);
      setOpen(false);
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : "Unable to update this account logo.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSaving(true);
    setError("");
    try {
      const logoUrl = await prepareCustomLogo(file);
      await onCommit(logoUrl);
      setOpen(false);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload this image.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        className="financial-account-card__logo-trigger"
        type="button"
        aria-label={`Change ${accountName} logo`}
        aria-haspopup="dialog"
        draggable={false}
        onPointerDown={(event) => event.stopPropagation()}
        onDragStart={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation();
          setError("");
          setOpen(true);
        }}
      >
        <AccountBrandMark accountBrand={accountBrand} label={accountName} />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="account-logo-picker__backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !saving) setOpen(false);
              }}
            >
              <section className="account-logo-picker" role="dialog" aria-modal="true" aria-labelledby="account-logo-picker-title">
                <header className="account-logo-picker__header">
                  <div>
                    <p className="account-logo-picker__eyebrow">Account appearance</p>
                    <h2 id="account-logo-picker-title">Choose a logo</h2>
                  </div>
                  <button ref={closeButtonRef} type="button" className="account-logo-picker__close" aria-label="Close logo picker" onClick={() => setOpen(false)} disabled={saving}>×</button>
                </header>

                <div className="account-logo-picker__actions">
                  <button className="account-logo-picker__upload" type="button" onClick={() => fileInputRef.current?.click()} disabled={saving}>
                    <span aria-hidden="true">＋</span> Upload your own
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleUpload} />
                  <button className="account-logo-picker__reset" type="button" onClick={() => void commit(null)} disabled={saving || !currentLogoUrl}>
                    Use automatic logo
                  </button>
                </div>

                {error ? <p className="account-logo-picker__error" role="alert">{error}</p> : null}

                <div className="account-logo-picker__scroll">
                  <p className="account-logo-picker__section-label">Generic</p>
                  <div className="account-logo-picker__grid">
                    {GENERIC_ACCOUNT_LOGO_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className="account-logo-picker__option"
                        data-selected={currentLogoUrl === option.src ? "true" : undefined}
                        aria-label={option.accessibleLabel}
                        aria-pressed={currentLogoUrl === option.src}
                        onClick={() => void commit(option.src)}
                        disabled={saving}
                      >
                        <img src={option.src} alt="" aria-hidden="true" />
                      </button>
                    ))}
                  </div>

                  <p className="account-logo-picker__section-label">Banks and providers</p>
                  <div className="account-logo-picker__grid">
                    {INSTITUTION_ACCOUNT_LOGO_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className="account-logo-picker__option"
                        data-selected={currentLogoUrl === option.src ? "true" : undefined}
                        aria-label={option.accessibleLabel}
                        aria-pressed={currentLogoUrl === option.src}
                        onClick={() => void commit(option.src)}
                        disabled={saving}
                      >
                        <img src={option.src} alt="" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
