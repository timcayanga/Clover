type AccountPathInput = {
  id: string;
  name?: string | null;
};

type InvestmentInstitutionPathInput = {
  institution?: string | null;
  currency?: string | null;
};

export const slugifyAccountName = (value: string | null | undefined) => {
  const trimmed = (value ?? "").trim();
  const slug = trimmed
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "account";
};

export const getAccountPath = ({ id, name }: AccountPathInput) => `/accounts/${slugifyAccountName(name)}--${id}`;

const encodeInstitutionSegment = (value: string | null | undefined) => encodeURIComponent((value ?? "").trim() || "institution");

const encodeCurrencySegment = (value: string | null | undefined) => encodeURIComponent((value ?? "").trim().toUpperCase() || "PHP");

export const getInvestmentInstitutionPath = ({ institution, currency }: InvestmentInstitutionPathInput) =>
  `/accounts/institutions/${encodeInstitutionSegment(institution)}--${encodeCurrencySegment(currency)}`;

export const extractAccountIdFromPathSegment = (segment: string | null | undefined) => {
  const trimmed = (segment ?? "").trim();
  if (!trimmed) {
    return "";
  }

  const doubleDashIndex = trimmed.lastIndexOf("--");
  if (doubleDashIndex !== -1) {
    return trimmed.slice(doubleDashIndex + 2);
  }

  const lastDashIndex = trimmed.lastIndexOf("-");
  if (lastDashIndex === -1) {
    return trimmed;
  }

  return trimmed.slice(lastDashIndex + 1);
};

export const extractInvestmentInstitutionFromPathSegment = (segment: string | null | undefined) => {
  const trimmed = (segment ?? "").trim();
  if (!trimmed) {
    return {
      institution: "",
      currency: "PHP",
    };
  }

  const separatorIndex = trimmed.lastIndexOf("--");
  if (separatorIndex === -1) {
    return {
      institution: decodeURIComponent(trimmed),
      currency: "PHP",
    };
  }

  return {
    institution: decodeURIComponent(trimmed.slice(0, separatorIndex)),
    currency: decodeURIComponent(trimmed.slice(separatorIndex + 2)).toUpperCase() || "PHP",
  };
};
