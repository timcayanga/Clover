export type UserEnvironment = "production" | "staging" | "local";

export function getCurrentUserEnvironment(): UserEnvironment {
  if (process.env.VERCEL_ENV === "production") {
    return "production";
  }

  if (process.env.VERCEL_ENV === "preview") {
    return "staging";
  }

  if (process.env.NODE_ENV !== "production") {
    return "local";
  }

  return "production";
}

export function resolvePersistedUserEnvironment(
  currentEnvironment: UserEnvironment,
  existingEnvironment?: string | null
): UserEnvironment {
  if (currentEnvironment === "production" || existingEnvironment === "production") {
    return "production";
  }

  return currentEnvironment;
}
