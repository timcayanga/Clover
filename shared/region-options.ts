const FALLBACK_TIME_ZONES = [
  "GMT",
  "UTC",
  "Africa/Johannesburg",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/New_York",
  "America/Phoenix",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Kolkata",
  "Asia/Manila",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Pacific/Auckland",
] as const;

export const getTimeZoneOptions = (current?: string) => {
  const supportedValuesOf = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const browserTimeZones = typeof supportedValuesOf === "function" ? supportedValuesOf("timeZone") : [];
  return Array.from(new Set(["GMT", "UTC", ...browserTimeZones, ...FALLBACK_TIME_ZONES, ...(current ? [current] : [])])).sort((left, right) => left.localeCompare(right));
};

export const formatTimeZoneLabel = (value: string) => (value === "GMT" || value === "UTC" ? value : value.replaceAll("_", " / "));
