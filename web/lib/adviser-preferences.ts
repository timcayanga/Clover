export type AdviserPreferences = {
  paydayDay: number | null;
  preferredBuffer: number | null;
};

export const normalizeAdviserPreferences = (value: unknown): AdviserPreferences => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { paydayDay: null, preferredBuffer: null };
  }

  const record = value as Record<string, unknown>;
  const paydayDay = Number(record.paydayDay);
  const preferredBuffer = Number(record.preferredBuffer);

  return {
    paydayDay: Number.isInteger(paydayDay) && paydayDay >= 1 && paydayDay <= 31 ? paydayDay : null,
    preferredBuffer: Number.isFinite(preferredBuffer) && preferredBuffer > 0 ? preferredBuffer : null,
  };
};
