const avatarBackgrounds = [
  "linear-gradient(135deg, rgba(3, 168, 192, 0.92), rgba(94, 211, 208, 0.88))",
  "linear-gradient(135deg, rgba(3, 168, 192, 0.82), rgba(110, 231, 183, 0.86))",
  "linear-gradient(135deg, rgba(110, 231, 183, 0.9), rgba(94, 211, 208, 0.9))",
  "linear-gradient(135deg, rgba(181, 246, 239, 0.95), rgba(3, 168, 192, 0.22))",
  "linear-gradient(135deg, rgba(15, 23, 42, 0.16), rgba(3, 168, 192, 0.84))",
] as const;

const brightAvatarBackgrounds = [
  "linear-gradient(135deg, #ff3d68, #ff7b54)",
  "linear-gradient(135deg, #ff7a00, #ffc400)",
  "linear-gradient(135deg, #84cc16, #16a34a)",
  "linear-gradient(135deg, #00c2a8, #00a8e8)",
  "linear-gradient(135deg, #0096ff, #4361ee)",
  "linear-gradient(135deg, #5f43e9, #9333ea)",
  "linear-gradient(135deg, #c026d3, #f72585)",
  "linear-gradient(135deg, #ef4444, #f97316)",
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

export const getBrightAvatarBackgroundStyle = (value: string) => ({
  background: brightAvatarBackgrounds[Math.abs(hashString(value.trim() || value)) % brightAvatarBackgrounds.length],
});
