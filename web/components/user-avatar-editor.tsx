"use client";

import { useRef, useState, useTransition } from "react";
import { useUser } from "@clerk/nextjs";
import { getAvatarBackgroundStyle, getAvatarInitials } from "@/lib/avatar-utils";

type UserAvatarEditorProps = {
  displayName: string;
  avatarUrl: string | null;
};

export function UserAvatarEditor({ displayName, avatarUrl }: UserAvatarEditorProps) {
  const { isLoaded, isSignedIn, user } = useUser();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const updateProfileImage = (updater: () => Promise<void>) => {
    if (!isLoaded || !isSignedIn || !user) {
      setMessage("Sign in again to update your profile picture.");
      return;
    }

    setMessage(null);
    startTransition(async () => {
      try {
        await updater();
        await user.reload();
        setIsMenuOpen(false);
        setMessage("Profile picture updated.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to update your profile picture.");
      }
    });
  };

  const handleUploadFile = (file: File) => {
    updateProfileImage(async () => {
      if (!user) {
        return;
      }

      await user.setProfileImage({ file });
    });
  };

  const handleClearPhoto = () => {
    updateProfileImage(async () => {
      if (!user) {
        return;
      }

      await user.setProfileImage({ file: null });
    });
  };

  const fallbackName = displayName || "Clover";
  const previewStyle = avatarUrl ? undefined : getAvatarBackgroundStyle(fallbackName);

  return (
    <div className="user-avatar-editor">
      <div className="user-avatar-editor__preview" style={previewStyle}>
        {avatarUrl ? (
          <img className="user-avatar-editor__image" src={avatarUrl} alt="" />
        ) : (
          <span className="user-avatar-editor__initials">{getAvatarInitials(fallbackName)}</span>
        )}
      </div>

      <button
        type="button"
        className="button button-secondary button-small user-avatar-editor__toggle"
        onClick={() => setIsMenuOpen((current) => !current)}
        disabled={isPending}
      >
        Update photo
      </button>

      {isMenuOpen ? (
        <div className="user-avatar-editor__menu">
          <p>Choose a new photo or switch back to initials.</p>
          <div className="user-avatar-editor__actions">
            <button type="button" className="button button-primary button-small" onClick={() => fileInputRef.current?.click()} disabled={isPending}>
              Upload new photo
            </button>
            <button type="button" className="button button-secondary button-small" onClick={handleClearPhoto} disabled={isPending}>
              Use initials
            </button>
            <button type="button" className="button button-danger button-small" onClick={handleClearPhoto} disabled={isPending}>
              Remove photo
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="split-bill-manual-modal__file-input"
            disabled={isPending}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (!file) {
                return;
              }

              void handleUploadFile(file);
              event.currentTarget.value = "";
            }}
          />
        </div>
      ) : null}

      {message ? <p className="settings-helper">{message}</p> : null}
    </div>
  );
}
