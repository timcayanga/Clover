// Standard short-context pricing verified against official model documentation
// on 2026-10-14. Keep historical models in the accounting tables for old audits.
export const DEFAULT_ADVISER_MODEL = "gpt-6-luna";
export const DEFAULT_CONTENT_MODEL = "gpt-6-luna";
export const DEFAULT_IMPORT_TEXT_MODEL = "gpt-5.4-mini";

export const isLunaModel = (model: string) =>
  /^gpt-6-luna(?:-|$)/i.test(model.trim());

/** Explicitly disable reasoning for bounded, grounded explanations and drafts.
 * Temperature is rejected by reasoning models unless reasoning is disabled.
 * Larger operator-selected models retain a supported low-effort configuration.
 */
export const openAIInteractiveOptions = (model: string) => {
  const normalized = model.trim().toLowerCase();
  if (/^gpt-6(?:\.1)?-(?:astra|sol)(?:-|$)/.test(normalized)) {
    return { reasoning: { effort: "low" as const } };
  }
  if (isLunaModel(normalized) || /^gpt-5(?:\.|-)/.test(normalized)) {
    return { reasoning: { effort: "none" as const }, temperature: 0.2 };
  }
  return { temperature: 0.2 };
};

export const isFastTextImportModel = (model: string) =>
  isLunaModel(model) || /^gpt-5\.4-mini(?:-|$)/i.test(model.trim());

export const LUNA_PRICING = { input: 0.1, cached: 0.01, cacheWrite: 0.125, output: 0.5 };
