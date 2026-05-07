"use client";

import { useState, useTransition } from "react";
import { useUser } from "@clerk/nextjs";
import { SplitBillAvatarPicker } from "@/components/split-bill-avatar-picker";
import { createAvatarFileFromUrl } from "@/lib/avatar-files";

type UserAvatarEditorProps = {
  displayName: string;
  avatarUrl: string | null;
};

export function UserAvatarEditor({ displayName, avatarUrl }: UserAvatarEditorProps) {
  const { isLoaded, isSignedIn, user } = useUser();
  const [message, setMessage] = useState<string | null>(null);
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
        setMessage("Profile picture updated.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to update your profile picture.");
      }
    });
  };

  const handleSelectAvatar = (value: string | null) => {
    updateProfileImage(async () => {
      if (!user) {
        return;
      }

      if (!value) {
        await user.setProfileImage({ file: null });
        return;
      }

      const file = await createAvatarFileFromUrl(value, `${displayName || "avatar"}.png`);
      await user.setProfileImage({ file });
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

  return (
    <div className="user-avatar-editor">
      <SplitBillAvatarPicker
        name={displayName}
        value={avatarUrl}
        onChange={handleSelectAvatar}
        onUploadFile={handleUploadFile}
        uploadLabel="Upload photo"
        defaultToSuggestedAvatar={false}
        disabled={isPending}
      />
      {message ? <p className="settings-helper">{message}</p> : null}
    </div>
  );
}
