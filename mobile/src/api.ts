export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
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
export async function apiRequest<T>(
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    path.includes("/process") || path.startsWith("adviser/chat") ? 120000 : 25000,
  );
  try {
    const url = new URL(`${apiBase()}/api/mobile/v1/${path}`);
    if (!url.pathname.startsWith("/api/mobile/v1/"))
      throw new Error("Invalid mobile API path.");
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (typeof options.body === "string")
      headers.set("Content-Type", "application/json");
    const response = await fetch(url.toString(), {
      ...options,
      headers,
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        data?.error ?? "Clover could not complete the request.",
        response.status,
      );
    if (!data)
      throw new Error("Clover returned an unexpected response. Please retry.");
    return data as T;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        path.includes("/process") ? "The connection timed out. Check the import status before trying the upload again." : "The connection timed out. Check your connection and try again.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
