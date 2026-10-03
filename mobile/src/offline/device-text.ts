import { Platform } from "react-native";
import { normalizeDeviceTextEvidence, type DeviceTextEvidence } from "../../../shared/device-text-evidence";
import { isUploadPhoto } from "../../../shared/native-upload";
import { CloverLocalAI } from "../../modules/clover-local-ai";
import type { QueuedFile } from "./file-queue";
import { withUploadCopy } from "./file-storage";

/** Vision and bundled ML Kit OCR need neither a language-model download nor cloud credits. */
export async function readDeviceText(file: QueuedFile, bytes: string): Promise<DeviceTextEvidence | undefined> {
  if (!CloverLocalAI || !["ios", "android"].includes(Platform.OS) ||
      !isUploadPhoto(file.name, file.mimeType)) return undefined;
  const started = Date.now();
  try {
    // Keep this promise alive until native OCR finishes, even when transport stops
    // waiting. Deleting its temporary file on a timeout can interrupt native reading.
    return await withUploadCopy(file, bytes, async uri => {
      const result = await CloverLocalAI!.extractText(uri);
      return normalizeDeviceTextEvidence({
        version: 1,
        source: Platform.OS === "ios" ? "apple_vision" : "google_mlkit",
        ...result,
        durationMs: Date.now() - started,
      }) ?? undefined;
    });
  } catch {
    // Unsupported formats, low-quality images, and unavailable OCR still retain
    // the original and continue through the server's existing extraction path.
    return undefined;
  }
}
