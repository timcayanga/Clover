export function apiBase() {
  const base =
    process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
    "https://staging.clover.ph";
  const url = new URL(base);
  if (
    url.protocol !== "https:" &&
    !(__DEV__ && ["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname))
  ) {
    throw new Error("Clover mobile requires an HTTPS API.");
  }
  return base;
}
