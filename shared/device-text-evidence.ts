/** Coordinates are normalized to the oriented image, with origin at the top left. */
export type OpticalTextAlternative = { text: string; confidence?: number };

export type OpticalTextLine = {
  text: string;
  box: [left: number, top: number, right: number, bottom: number];
  confidence?: number;
  minimumCharacterConfidence?: number;
  alternatives?: OpticalTextAlternative[];
  characterAlternatives?: Array<OpticalTextAlternative & { index: number }>;
};

const isConfidence = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

export function normalizeOpticalTextLines(value: unknown): OpticalTextLine[] {
  if (!Array.isArray(value) || value.length > 300) return [];
  const lines: OpticalTextLine[] = [];
  let length = 0;
  let alternateLength = 0;
  for (const line of value) {
    if (!line || typeof line.text !== "string" || !Array.isArray(line.box) || line.box.length !== 4 ||
        !line.box.every((coordinate: unknown) => typeof coordinate === "number" && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)) return [];
    const [left, top, right, bottom] = line.box;
    const text = line.text.replace(/\u0000/g, "").trim();
    length += text.length;
    if (length > DEVICE_TEXT_MAX_CHARACTERS || !text || /[\r\n]/.test(text) || right <= left || bottom <= top) return [];
    const alternatives: OpticalTextAlternative[] = [];
    const seen = new Set([text]);
    if (/\d/u.test(text) && Array.isArray(line.alternatives)) {
      for (const entry of line.alternatives.slice(0, 2)) {
        if (!entry || typeof entry.text !== "string" || entry.text.length > 400) continue;
        const candidate = entry.text.replace(/\u0000/g, "").trim();
        if (!candidate || /[\r\n]/.test(candidate) || seen.has(candidate) || alternateLength + candidate.length > 12_000) continue;
        seen.add(candidate);
        alternateLength += candidate.length;
        alternatives.push({ text: candidate, ...(isConfidence(entry.confidence) ? { confidence: entry.confidence } : {}) });
      }
    }
    const characterAlternatives: NonNullable<OpticalTextLine["characterAlternatives"]> = [];
    if (/\d/u.test(text) && Array.isArray(line.characterAlternatives)) {
      const characters = Array.from(text);
      const positions = new Set<number>();
      for (const entry of line.characterAlternatives.slice(0, 8)) {
        if (!entry || !Number.isSafeInteger(entry.index) || entry.index < 0 ||
            entry.index >= characters.length || positions.has(entry.index) ||
            typeof entry.text !== "string" || !/^[0-9OoIlSBZ]$/.test(entry.text) ||
            entry.text === characters[entry.index] || !isConfidence(entry.confidence)) continue;
        positions.add(entry.index);
        characterAlternatives.push({ index: entry.index, text: entry.text, confidence: entry.confidence });
      }
    }
    lines.push({
      text, box: [left, top, right, bottom],
      ...(isConfidence(line.confidence) ? { confidence: line.confidence } : {}),
      ...(isConfidence(line.minimumCharacterConfidence) ? { minimumCharacterConfidence: line.minimumCharacterConfidence } : {}),
      ...(alternatives.length ? { alternatives } : {}),
      ...(characterAlternatives.length ? { characterAlternatives } : {}),
    });
  }
  return lines;
}

/** OCR is source evidence supplied by the client, never confirmed financial data. */
export type DeviceTextEvidence = {
  version: 1;
  source: "apple_vision" | "google_mlkit";
  text: string;
  pagesRead: number;
  totalPages: number;
  complete: boolean;
  durationMs: number;
  opticalLines?: OpticalTextLine[];
};

export const DEVICE_TEXT_MAX_CHARACTERS = 40_000;

/** Reject malformed evidence; a valid original can still use server extraction. */
export function normalizeDeviceTextEvidence(value: unknown): DeviceTextEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.version !== 1 || !["apple_vision", "google_mlkit"].includes(String(item.source)) ||
      typeof item.text !== "string" || item.text.length > DEVICE_TEXT_MAX_CHARACTERS ||
      typeof item.complete !== "boolean" ||
      !Number.isSafeInteger(item.pagesRead) || !Number.isSafeInteger(item.totalPages) ||
      Number(item.pagesRead) < 1 || Number(item.pagesRead) > Number(item.totalPages) ||
      Number(item.totalPages) > 5 ||
      !Number.isFinite(item.durationMs) || Number(item.durationMs) < 0 || Number(item.durationMs) > 120_000) return null;
  const text = item.text.replace(/\u0000/g, "").trim();
  if (!text) return null;
  const opticalLines = item.totalPages === 1 ? normalizeOpticalTextLines(item.opticalLines) : [];
  return {
    version: 1,
    source: item.source as DeviceTextEvidence["source"],
    text,
    ...(opticalLines.length ? { opticalLines } : {}),
    pagesRead: Number(item.pagesRead),
    totalPages: Number(item.totalPages),
    complete: item.complete && item.pagesRead === item.totalPages,
    durationMs: Math.round(Number(item.durationMs)),
  };
}


/** A partial read is worth sending if it contains a labeled amount or a dated amount. */
export function hasUsefulPartialReceiptText(text: string) {
  const lines = text.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const amount = /\d[.,]\d{2}(?!\d)/u;
  const labeledAmount = /\b(?:grand total|total|amount paid|subtotal|jumlah|tunai|importe|totale)\b|合計|합계|총액|ยอดรวม/iu;
  const date = /\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/u;
  return lines.some(line => labeledAmount.test(line) && /\d/u.test(line)) ||
    (lines.some(line => date.test(line)) && lines.some(line => amount.test(line) && !date.test(line)));
}
