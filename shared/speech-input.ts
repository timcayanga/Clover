/** Match device languages to recognizer locales, never assume en-PH is installed. */
export function speechLocale(preferred: string[], supported: string[]): string {
  const normalize = (value: string) => value.replace(/_/g, "-").toLowerCase();
  const available = supported.map(value => ({ value: value.replace(/_/g, "-"), key: normalize(value) }));
  for (const candidate of preferred) {
    const exact = available.find(locale => locale.key === normalize(candidate));
    if (exact) return exact.value;
  }
  for (const candidate of preferred) {
    const language = normalize(candidate).split("-")[0];
    // English (Philippines) is not supported by several Android services.
    const sameLanguage = available.find(locale => locale.key === `${language}-us`) ??
      available.find(locale => locale.key.split("-")[0] === language);
    if (sameLanguage) return sameLanguage.value;
  }
  return available.find(locale => locale.key === "en-us")?.value ?? available[0]?.value ??
    (preferred[0] && !/^en(?:[-_]|$)/i.test(preferred[0]) ? preferred[0].replace(/_/g, "-") : "en-US");
}

export function speechErrorMessage(error: string): string {
  switch (error) {
    case "aborted": return "";
    case "not-allowed": return "Allow microphone and speech recognition in Settings to dictate a message.";
    case "no-speech":
    case "speech-timeout": return "I didn’t hear any words. Tap the microphone and try again.";
    case "language-not-supported": return "Your speech language is not available. Enable a dictation language in Settings, then try again.";
    case "service-not-allowed": return "Enable speech recognition in your device settings, then try again.";
    case "network": return "Voice recognition could not connect. Check your connection and try again.";
    case "busy": return "The microphone is already in use. Finish the other recording, then try again.";
    case "audio-capture": return "The microphone could not record. Close other recording apps and try again.";
    case "interrupted": return "Dictation was interrupted. Tap the microphone to continue.";
    default: return "Dictation could not start. Try again, or use your keyboard’s microphone.";
  }
}
