import { importMediaType, PUBLIC_IMPORT_EXTENSIONS, PUBLIC_IMPORT_CONTENT_TYPES } from "../../shared/import-format-policies";
import { uploadSizeProblem } from "../../shared/native-upload";
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
export function resolveSelectedFile(file: SelectedFile): SelectedFile {
  // Android's picker can report the source photo's size even though its URI
  // points to a compressed cache copy. Validate the bytes we will actually send.
  return { ...file, size: new File(file.uri).size };
}
export function fileProblem(file: SelectedFile) {
  if (file.size === undefined || file.size <= 0)
    return "This file is empty or its size could not be checked.";
  const sizeProblem = uploadSizeProblem(file.name, file.mimeType, file.size);
  if (sizeProblem) return sizeProblem;
  const extension = file.name.trim().toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!PUBLIC_IMPORT_EXTENSIONS.some(allowed => allowed === extension) &&
      !PUBLIC_IMPORT_CONTENT_TYPES.has(importMediaType(file.mimeType)))
    return "Choose a supported financial document, spreadsheet, or image.";
  return null;
}

// Expo fetch serializes a File's bytes. Picker URI descriptors alone have no file body.
export async function receiptPhotoForm(file: SelectedFile) {
  const form = new FormData();
  if (Platform.OS === "web") {
    const response = await fetch(file.uri);
    const blob = await response.blob();
    form.append("file", blob, file.name);
  } else {
    const source = new File(file.uri);
    // A cache copy can have a different filename or no detected media type.
    Object.defineProperties(source, {
      name: {value: file.name},
      type: {value: file.mimeType || source.type || "application/octet-stream"},
    });
    form.append("file", source);
  }
  return form;
}
