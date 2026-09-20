import { NATIVE_UPLOAD_MAX_SIZE } from "../../shared/native-upload";
import { Platform } from "react-native";
import type { DocumentPickerAsset } from "expo-document-picker";
import { File, Paths } from "expo-file-system";

// Only delete copies inside this app's cache, never the user's original file.
export function removeUploadCopy(uri: string) {
  if (Platform.OS === "web") {
    if (uri.startsWith("blob:")) URL.revokeObjectURL(uri);
    return;
  }
  if (uri.startsWith(Paths.cache.uri)) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      /* Best-effort cache cleanup. */
    }
  }
}
export type SelectedFile = Pick<
  DocumentPickerAsset,
  "uri" | "name" | "mimeType" | "size"
>;
export function fileProblem(file: SelectedFile) {
  if (file.size === undefined || file.size <= 0)
    return "This file is empty or its size could not be checked.";
  if (file.size > NATIVE_UPLOAD_MAX_SIZE)
    return "Choose a file up to 25 MB.";
  if (
    !/\.(pdf|csv|tsv|xlsx?|xlsm|xlsb|ods|png|jpe?g|webp|hei[cf]|ofx|qfx|qif|mt940|sta|xml|json)$/i.test(
      file.name,
    )
  )
    return "Choose a supported financial document, spreadsheet, or image.";
  return null;
}
