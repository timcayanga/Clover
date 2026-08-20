export const ADMIN_ACTIVE_IMPORT_WINDOW_MS = 30 * 60 * 1000;

export function getAdminImportActivityCutoff(now = new Date()) {
  return new Date(now.getTime() - ADMIN_ACTIVE_IMPORT_WINDOW_MS);
}

export function isAdminImportActive(status: string, updatedAt: Date, now = new Date()) {
  return status === "processing" && updatedAt >= getAdminImportActivityCutoff(now);
}
