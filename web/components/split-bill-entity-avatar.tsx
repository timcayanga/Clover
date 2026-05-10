"use client";

import { getAvatarBackgroundStyle, getAvatarInitials } from "@/lib/avatar-utils";

type SplitBillEntityAvatarProps = {
  name: string;
  avatarUrl: string | null;
  sizeClass?: string;
  title?: string;
  className?: string;
};

export function SplitBillEntityAvatar({
  name,
  avatarUrl: _avatarUrl,
  sizeClass = "split-bill-person-avatar--small",
  title,
  className = "split-bill-person-avatar",
}: SplitBillEntityAvatarProps) {
  return (
    <span className={`${className} ${sizeClass}`} title={title ?? name} style={getAvatarBackgroundStyle(name)}>
      {getAvatarInitials(name)}
    </span>
  );
}
