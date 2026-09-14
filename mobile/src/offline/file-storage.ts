import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import type { QueuedFile } from "./file-queue";
import type { SelectedFile } from "../upload";
export async function readUploadBytes(file: SelectedFile) {
  if (Platform.OS === "web")
    throw new Error("Offline file retention is available in the native app.");
  return FileSystem.readAsStringAsync(file.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}
export async function withUploadCopy<T>(
  file: QueuedFile,
  base64: string,
  run: (uri: string) => Promise<T>,
) {
  if (!/^[a-f0-9-]{36}$/i.test(file.id) || !FileSystem.cacheDirectory)
    throw new Error("Invalid saved file.");
  const extension =
    file.name
      .split(".")
      .pop()
      ?.replace(/[^a-z0-9]/gi, "") ?? "bin";
  const uri = `${FileSystem.cacheDirectory}clover-offline-${file.id}.${extension}`;
  try {
    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
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
