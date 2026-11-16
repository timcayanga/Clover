"use client";

import { useEffect, useState } from "react";
import { getCloverAvatarBackgroundStyle, getAvatarInitials } from "@/lib/avatar-utils";

type SplitBillEntityAvatarProps = {
  name: string;
  avatarUrl: string | null;
  sizeClass?: string;
  title?: string;
  className?: string;
};

export function SplitBillEntityAvatar({
  name,
  avatarUrl,
  sizeClass = "split-bill-person-avatar--small",
  title,
  className = "split-bill-person-avatar",
}: SplitBillEntityAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <span className={`${className} ${sizeClass}`} title={title ?? name} style={getCloverAvatarBackgroundStyle(name)}>
      {avatarUrl && !imageFailed ? (
        <img className="split-bill-person-avatar__image" src={avatarUrl} alt="" onError={() => setImageFailed(true)} />
      ) : (
        getAvatarInitials(name)
      )}
    </span>
  );
}
