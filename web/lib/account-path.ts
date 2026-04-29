type AccountPathInput = {
  id: string;
  name?: string | null;
};

export const slugifyAccountName = (value: string | null | undefined) => {
  const trimmed = (value ?? "").trim();
  const slug = trimmed
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "account";
};

export const getAccountPath = ({ id, name }: AccountPathInput) => `/accounts/${slugifyAccountName(name)}-${id}`;

export const extractAccountIdFromPathSegment = (segment: string | null | undefined) => {
  const trimmed = (segment ?? "").trim();
  if (!trimmed) {
    return "";
  }

  const lastDashIndex = trimmed.lastIndexOf("-");
  if (lastDashIndex === -1) {
    return trimmed;
  }

  return trimmed.slice(lastDashIndex + 1);
};
