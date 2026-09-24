export const socialProviders = [
  { label: "Google", provider: "google", strategy: "oauth_google" },
  { label: "Apple", provider: "apple", strategy: "oauth_apple" },
] as const;

export type SocialProvider = typeof socialProviders[number];

export function isAndroidDevice(userAgent: string, platform = "") {
  return /android/i.test(platform) || /android/i.test(userAgent);
}

export function getSocialProviders(android: boolean): readonly SocialProvider[] {
  return android ? socialProviders.filter(({ provider }) => provider !== "apple") : socialProviders;
}
