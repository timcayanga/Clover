// Reserve the slot before preparing a temporary file. Upload OCR can outlive
// the transport's wait, so release it only after the native read and cleanup.
let occupied = false;

export async function tryRunLocalOcr<T>(run: () => Promise<T>): Promise<T | undefined> {
  if (occupied) return undefined;
  occupied = true;
  try {
    return await run();
  } finally {
    occupied = false;
  }
}
