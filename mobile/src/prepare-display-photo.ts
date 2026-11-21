import type { ImagePickerAsset } from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { removeUploadCopy } from "./upload";

/** Artwork fields store compact JPEG data URLs; resize the copy, never the source. */
export async function displayPhoto(asset: ImagePickerAsset, edge: number, maxLength: number) {
  const prefix = "data:image/jpeg;base64,";
  if (asset.base64 && prefix.length + asset.base64.length <= maxLength)
    return prefix + asset.base64;
  for (const scale of [1, 0.7, 0.5]) {
    const side = Math.round(Math.min(edge, Math.max(asset.width, asset.height)) * scale);
    const context = ImageManipulator.manipulate(asset.uri);
    try {
      context.resize(asset.width >= asset.height ? { width: side } : { height: side });
      const image = await context.renderAsync();
      try {
        const copy = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.82, base64: true });
        try {
          if (copy.base64 && prefix.length + copy.base64.length <= maxLength) return prefix + copy.base64;
        } finally {
          removeUploadCopy(copy.uri);
        }
      } finally {
        image.release();
      }
    } finally {
      context.release();
    }
  }
  throw new Error("This photo could not be prepared. Please choose another image.");
}
