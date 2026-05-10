const avatarBackgrounds = [
  "linear-gradient(135deg, rgba(3, 168, 192, 0.92), rgba(94, 211, 208, 0.88))",
  "linear-gradient(135deg, rgba(3, 168, 192, 0.82), rgba(110, 231, 183, 0.86))",
  "linear-gradient(135deg, rgba(110, 231, 183, 0.9), rgba(94, 211, 208, 0.9))",
  "linear-gradient(135deg, rgba(181, 246, 239, 0.95), rgba(3, 168, 192, 0.22))",
  "linear-gradient(135deg, rgba(15, 23, 42, 0.16), rgba(3, 168, 192, 0.84))",
] as const;

const hashString = (value: string) =>
  value.split("").reduce((hash, char) => {
    const next = (hash << 5) - hash + char.charCodeAt(0);
    return next & next;
  }, 0);

export const getAvatarInitials = (value: string, maxLength = 2) => {
  const parts = value.split(/\s+/).filter(Boolean);
  const initials =
    parts.length === 0
      ? ""
      : parts.length === 1
        ? parts[0]?.[0]?.toUpperCase() ?? ""
        : `${parts[0]?.[0]?.toUpperCase() ?? ""}${parts[parts.length - 1]?.[0]?.toUpperCase() ?? ""}`.slice(0, maxLength);

  return initials || "?";
};

export const getAvatarBackgroundStyle = (value: string) => ({
  background: avatarBackgrounds[Math.abs(hashString(value.trim() || value)) % avatarBackgrounds.length],
});
