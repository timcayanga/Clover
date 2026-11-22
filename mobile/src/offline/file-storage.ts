import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { isUploadPdf, NATIVE_UPLOAD_PART_SIZE, nativeUploadPartBytes } from "../../../shared/native-upload";
import { readUploadPart, type QueuedFile, type UploadPartReader, type UploadSource } from "./file-queue";
import type { SelectedFile } from "../upload";
let temporaryCopySequence = 0;
export function selectedUploadPartReader(file: SelectedFile): UploadPartReader {
  if (Platform.OS === "web") throw new Error("Offline file retention is available in the native app.");
  return index => FileSystem.readAsStringAsync(file.uri, {
    encoding: FileSystem.EncodingType.Base64,
    position: index * NATIVE_UPLOAD_PART_SIZE,
    length: nativeUploadPartBytes(file.size ?? 0, index),
  });
}
export async function withUploadCopy<T>(
  file: QueuedFile,
  source: UploadSource,
  run: (uri: string) => Promise<T>,
) {
  if (!/^[a-f0-9-]{36}$/i.test(file.id) || !FileSystem.cacheDirectory)
    throw new Error("Invalid saved file.");
  // Both native readers dispatch PDFs by the temporary path's extension.
  const extension = isUploadPdf(file.name, file.mimeType) ? "pdf"
    : file.name.match(/\.([a-z0-9]{1,12})$/i)?.[1] ?? "bin";
  // A user can open Preview while automatic upload OCR is still reading. Give
  // each reader its own temporary copy so one cleanup cannot delete the other's.
  const uri = `${FileSystem.cacheDirectory}clover-offline-${file.id}-${Date.now()}-${++temporaryCopySequence}.${extension}`;
  try {
    for (let index = 0; index < Math.ceil(file.size / NATIVE_UPLOAD_PART_SIZE); index++) {
      const part = await readUploadPart(source, file.size, index);
      await FileSystem.writeAsStringAsync(uri, part, {
        encoding: FileSystem.EncodingType.Base64,
        append: index > 0,
      });
    }
    return await run(uri);
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}
export async function clearTemporaryOfflineCopies() {
  if (!FileSystem.cacheDirectory || Platform.OS === "web") return;
  for (const name of await FileSystem.readDirectoryAsync(
    FileSystem.cacheDirectory,
  ))
    if (name.startsWith("clover-offline-"))
      await FileSystem.deleteAsync(FileSystem.cacheDirectory + name, {
        idempotent: true,
      });
}
