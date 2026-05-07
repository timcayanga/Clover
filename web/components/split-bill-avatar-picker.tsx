"use client";

import { useMemo, useRef } from "react";
import { pickSplitBillAvatarUrl, splitBillProfileAvatarUrls } from "@/lib/split-bill-avatars";
import { getAvatarBackgroundStyle, getAvatarInitials } from "@/lib/avatar-utils";

type SplitBillAvatarPickerProps = {
  name: string;
  value: string | null;
  onChange: (value: string | null) => void;
  onUploadFile?: (file: File) => void | Promise<void>;
  allowUpload?: boolean;
  uploadLabel?: string;
  defaultToSuggestedAvatar?: boolean;
  avatarUrls?: readonly string[];
  disabled?: boolean;
};

export function SplitBillAvatarPicker({
  name,
  value,
  onChange,
  onUploadFile,
  allowUpload = true,
  uploadLabel = "Upload photo",
  defaultToSuggestedAvatar = false,
  avatarUrls = splitBillProfileAvatarUrls,
  disabled = false,
}: SplitBillAvatarPickerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const suggestedAvatar = useMemo(() => pickSplitBillAvatarUrl(name || "Split Bill"), [name]);
  const previewAvatar = value ?? (defaultToSuggestedAvatar ? suggestedAvatar : null);
  const fallbackName = name || "?";

  return (
    <div className="split-bill-avatar-picker">
      <div className="split-bill-avatar-picker__preview" style={!previewAvatar ? getAvatarBackgroundStyle(fallbackName) : undefined}>
        {previewAvatar ? (
          <img className="split-bill-avatar-picker__image" src={previewAvatar} alt="" />
        ) : (
          <span className="split-bill-avatar-picker__initials">{getAvatarInitials(fallbackName)}</span>
        )}
      </div>

      <div className="split-bill-avatar-picker__actions">
        {defaultToSuggestedAvatar ? (
          <button className="button button-secondary button-small" type="button" onClick={() => onChange(suggestedAvatar)} disabled={disabled}>
            Use suggested
          </button>
        ) : (
          <button className="button button-secondary button-small" type="button" onClick={() => onChange(null)} disabled={disabled}>
            Use initials
          </button>
        )}
        <button className="button button-secondary button-small" type="button" onClick={() => onChange(null)} disabled={disabled}>
          Remove
        </button>
        {allowUpload ? (
          <>
            <button className="button button-secondary button-small" type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled}>
              {uploadLabel}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="split-bill-manual-modal__file-input"
              disabled={disabled}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (!file) {
                  return;
                }

                if (onUploadFile) {
                  void onUploadFile(file);
                } else {
                  const reader = new FileReader();
                  reader.onload = () => onChange(String(reader.result ?? ""));
                  reader.readAsDataURL(file);
                }
                event.currentTarget.value = "";
              }}
            />
          </>
        ) : null}
      </div>

      <div className="split-bill-avatar-picker__grid">
        {avatarUrls.map((avatarUrl) => (
          <button
            key={avatarUrl}
            type="button"
            className={`split-bill-avatar-picker__option${previewAvatar === avatarUrl ? " is-selected" : ""}`}
            onClick={() => onChange(avatarUrl)}
            disabled={disabled}
          >
            <img src={avatarUrl} alt="" />
          </button>
        ))}
      </div>
    </div>
  );
}
