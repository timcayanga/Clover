export async function assignmentRequest(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    signal,
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The connection was interrupted. Refresh to check saved progress before trying again.",
    );
  }
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Unable to load this assignment. Please try again.",
    );
  return data;
}
