import { getClearLocalPhotoRejection, NonFinancialUploadError } from "./financial-upload-scope";
import { createHash } from "node:crypto";

/** Bump when classification rules or optical evidence interpretation change. */
export const IMPORT_CLASSIFIER_VERSION = "1";

export const fingerprintImportClassificationBytes = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export type ClassificationContext = {
  workspaceId?: string | null;
  actorUserId?: string | null;
  fileFingerprint?: string | null;
  fileType: string;
  fileName: string;
  importMode: string;
  evidenceSource: "device_ocr" | "local_text" | "optical_layout" | "server_ocr";
};

const maxEntries = 256;
const ttlMs = 15 * 60_000;
const cache = new Map<string, { expiresAt: number; verdict: unknown }>();

/** Access checks belong to the import caller. An unscoped read always computes. */
export function classifyExactImportEvidence<T>(
  context: ClassificationContext,
  purpose: "photo_rejection" | "positive_route",
  evidence: string,
  classify: () => T,
): T {
  const { workspaceId, actorUserId, fileFingerprint, fileType, fileName, importMode, evidenceSource } = context;
  if (!workspaceId || !actorUserId || !fileFingerprint || !/^[a-f0-9]{64}$/.test(fileFingerprint) || !evidence.trim()) {
    return classify();
  }
  // Include the evidence itself in the digest. Different OCR readings of the
  // same photo, even with different box positions alone, can disagree.
  const key = createHash("sha256").update(JSON.stringify([
    IMPORT_CLASSIFIER_VERSION, workspaceId, actorUserId, fileFingerprint,
    fileType, fileName, importMode, evidenceSource, purpose, evidence,
  ])).digest("hex");
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) return existing.verdict as T;

  const verdict = classify();
  cache.delete(key);
  if (cache.size >= maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { verdict, expiresAt: now + ttlMs });
  return verdict;
}

export function classifyExactPhotoRejection(
  params: Parameters<typeof getClearLocalPhotoRejection>[0],
  context?: ClassificationContext,
) {
  if (!context) return getClearLocalPhotoRejection(params);
  const verdict = classifyExactImportEvidence(context, "photo_rejection", params.text ?? "", () => {
    const rejection = getClearLocalPhotoRejection(params);
    return rejection ? { reasonCode: rejection.reasonCode, ruleId: rejection.ruleId } : null;
  });
  return verdict ? new NonFinancialUploadError(verdict.reasonCode, verdict.ruleId) : null;
}
