/** Divisible by three so encrypted base64 can be sliced without decoding the entire file. */
export const NATIVE_UPLOAD_PART_SIZE = 1_572_864;
export const NATIVE_UPLOAD_MAX_SIZE = 25 * 1024 * 1024;
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
