import * as Device from "expo-device";
import { AppState, Platform } from "react-native";
import { hasUsefulPartialReceiptText, normalizeDeviceTextEvidence, type DeviceTextEvidence } from "../../../shared/device-text-evidence";
import { isUploadPhoto } from "../../../shared/native-upload";
import { CloverLocalAI } from "../../modules/clover-local-ai";
import type { QueuedFile, UploadSource } from "./file-queue";
import { withUploadCopy } from "./file-storage";
import { tryRunLocalOcr } from "./local-ocr-slot";

const lowMemoryThreshold = 3 * 1024 ** 3;
const generousUploadSize = 6 * 1024 ** 2;
const conservativeUploadSize = 2 * 1024 ** 2;

/** Vision and bundled ML Kit OCR need neither a language-model download nor cloud credits. */
export function readDeviceText(file: QueuedFile, bytes: UploadSource) {
  return prepareDeviceText(file, read => withUploadCopy(file, bytes, read));
}

export function prepareSelectedPhoto(file: QueuedFile, uri: string, previewReceipt = true) {
  if (!previewReceipt) return { full: prepareDeviceText(file, read => read(uri)) };
  let publish!: (result?: DeviceTextEvidence) => void;
  const partial = new Promise<DeviceTextEvidence | undefined>(resolve => { publish = resolve; });
  const full = prepareDeviceText(file, read => read(uri), publish);
  return { full, partial: Promise.race([full, partial]) };
}

async function prepareDeviceText(
  file: QueuedFile,
  withPhoto: (read: (uri: string) => Promise<DeviceTextEvidence | undefined>) => Promise<DeviceTextEvidence | undefined>,
  publishPartial?: (result: DeviceTextEvidence) => void,
): Promise<DeviceTextEvidence | undefined> {
  if (!CloverLocalAI || !["ios", "android"].includes(Platform.OS) ||
      !isUploadPhoto(file.name, file.mimeType)) return undefined;
  const memory = Device.totalMemory ?? 0;
  const maxBytes = memory >= lowMemoryThreshold ? generousUploadSize : conservativeUploadSize;
  if (AppState.currentState !== "active" || file.size > maxBytes) return undefined;

  const started = Date.now();
  try {
    // Keep this promise alive until native OCR finishes, even when transport stops
    // waiting. Deleting its temporary file on a timeout can interrupt native reading.
    return await tryRunLocalOcr(() => withPhoto(async uri => {
      const source = Platform.OS === "ios" ? "apple_vision" : "google_mlkit";
      if (publishPartial && CloverLocalAI!.extractPhotoTextFast) {
        const fast = await CloverLocalAI!.extractPhotoTextFast(uri).catch(() => undefined);
        if (Platform.OS === "android" && fast?.complete && fast.pagesRead === 1 && fast.totalPages === 1) {
          const full = normalizeDeviceTextEvidence({ version: 1, source, ...fast, durationMs: Date.now() - started });
          if (full) return full;
        }
        if (fast && hasUsefulPartialReceiptText(fast.text)) {
          const evidence = normalizeDeviceTextEvidence({
            version: 1, source, ...fast, complete: false, durationMs: Date.now() - started,
          });
          if (evidence) publishPartial(evidence);
        }
      }
      const result = await CloverLocalAI!.extractText(uri);
      return normalizeDeviceTextEvidence({ version: 1, source, ...result, durationMs: Date.now() - started }) ?? undefined;
    }));
  } catch {
    // Unsupported formats, low-quality images, and unavailable OCR still retain
    // the original and continue through the server's existing extraction path.
    return undefined;
  }
}
