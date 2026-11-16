// Percentages describe milestones, not the server's current activity. In
// particular, 75–94% must not invent an "enrichment" phase while a save retries.
export const getImportStageLabel = (label: string, progress: number) => {
  const text = label.trim().toLowerCase();
  if (/cancel/.test(text)) return /cancelling|canceling/.test(text) ? "Cancelling import" : "Import cancelled";
  if (/paus/.test(text)) return /pausing/.test(text) ? "Pausing import" : "Import paused";
  if (/ready.*review|review.*ready/.test(text)) return "Ready to review";
  if (/offline|reconnect|waiting.*connection/.test(text)) return "Waiting for connection";
  if (/password/.test(text)) return "Password needed";
  if (/retry.*sav|retrying.*final|reconnect/.test(text)) return "Retrying save";
  if (/visible|updating home|account totals|placing.*transaction/.test(text)) return "Updating your pages";
  if (/sav|reconcil|finaliz|wrapping|lining/.test(text)) return "Saving transactions";
  if (/categor|enrich|normal|duplicate|apply/.test(text)) return "Refining transaction details";
  if (/identif|parsing|finding transactions/.test(text)) return "Identifying transactions";
  if (/account|matching/.test(text)) return "Matching account";
  if (/read|scan|statement|document|details|layout/.test(text)) return "Reading file";
  if (/queue|wait|start/.test(text)) return "Queued for import";
  if (/upload|receiv|prepar/.test(text)) return "Uploading file";
  return progress >= 75 ? "Saving transactions" : progress >= 50 ? "Identifying transactions" : "Reading file";
};
