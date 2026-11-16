import { PHOTO_RETAKE_INSTRUCTION } from "../../shared/import-photo-retake";

export const IMAGE_QUALITY_SIGNALS = ["crop", "blur", "glare", "unreadable_text"] as const;
export const IMAGE_QUALITY_FIELDS = ["merchant", "date", "total", "transaction_rows"] as const;

export type ImageQualitySignal = (typeof IMAGE_QUALITY_SIGNALS)[number];
export type ImageQualityIssue = {
  signal: ImageQualitySignal;
  blocked_fields: (typeof IMAGE_QUALITY_FIELDS)[number][];
};

const guidance: Record<ImageQualitySignal, string> = {
  crop: "Part of the document is cut off. Fit the whole document in the frame.",
  blur: "The text is blurry. Hold the camera steady and let it focus.",
  glare: "Glare covers some text. Turn off the flash or move the document away from reflections.",
  unreadable_text: "Use good lighting and make sure the key text is legible.",
};

export function getImageQualityRetake(issues: ImageQualityIssue[], missingFields: readonly string[]) {
  const blockers = issues.filter(issue => issue.blocked_fields.some(field => missingFields.includes(field)));
  const signals = [...new Set(blockers.map(issue => issue.signal))];
  const fields = [...new Set(blockers.flatMap(issue => issue.blocked_fields.filter(field => missingFields.includes(field))))];
  if (!signals.length) return null;

  const fieldLabels = fields.map(field => field === "transaction_rows" ? "transaction details" : field);
  return {
    signals,
    message: `Clover could not read the ${fieldLabels.join(", ")} clearly. ${PHOTO_RETAKE_INSTRUCTION} ${signals.map(signal => guidance[signal]).join(" ")}`,
  };
}

export const IMAGE_QUALITY_GUIDANCE =
  "For photos and screenshots, return image_quality observations only for visible physical problems: crop (document text or edge cut off), blur (defocused or motion-smeared letters), glare (reflection obscures printed text), unreadable_text (visible text cannot be read due to poor contrast, resolution, or obstruction). List only fields whose printed text the problem actually obscures in blocked_fields. Use an empty array when the image is legible or when you only have text. Missing or unprinted fields, unfamiliar language, templates, privacy redaction, unrelated images and parser uncertainty do not establish a quality problem.";
