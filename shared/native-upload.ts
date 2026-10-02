/** Divisible by three so encrypted base64 can be sliced without decoding the entire file. */
export const NATIVE_UPLOAD_PART_SIZE = 1_572_864;
export const NATIVE_UPLOAD_MAX_SIZE = 25 * 1024 * 1024;
export const IMPORT_PHOTO_MAX_SIZE = 10 * 1024 * 1024;
export function isUploadPhoto(name: string, mimeType?: string | null) {
  return /\.(png|jpe?g|webp|hei[cf]|gif|bmp|avif)$/i.test(name) || /^image\//i.test(mimeType ?? "");
}
export function uploadSizeProblem(name: string, mimeType: string | null | undefined, size: number) {
  return isUploadPhoto(name, mimeType) && size > IMPORT_PHOTO_MAX_SIZE
    ? "Choose a photo up to 10 MB."
    : size > NATIVE_UPLOAD_MAX_SIZE ? "Choose a file up to 25 MB." : null;
}
export function nativeUploadPartBytes(size: number, index: number) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= Math.ceil(size / NATIVE_UPLOAD_PART_SIZE)
  )
    throw new Error("Invalid upload part.");
  return Math.min(
    NATIVE_UPLOAD_PART_SIZE,
    size - index * NATIVE_UPLOAD_PART_SIZE,
  );
}
