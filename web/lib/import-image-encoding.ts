import { RECEIPT_IMAGE_MAX_EDGE } from "../../shared/native-upload";
export const RECEIPT_JPEG_QUALITY = 0.9;

export async function encodeImportImage(
  width: number,
  height: number,
  receipt: boolean,
  targetBytes: number,
  renderJpeg: (width: number, height: number, quality: number) => Promise<Blob>
): Promise<Blob> {
  const render = (maxDimension: number, quality: number) => {
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    return renderJpeg(
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
      quality,
    );
  };

  // The receipt's byte target determines when preparation is worthwhile.
  // Use one spatial transform and keep its detail even above the soft target.
  if (receipt) return render(RECEIPT_IMAGE_MAX_EDGE, RECEIPT_JPEG_QUALITY);

  let maxDimension = 2600;
  let quality = 0.9;
  for (let attempt = 0; ; attempt += 1) {
    const output = await render(maxDimension, quality);
    if (output.size <= targetBytes || attempt === 6) return output;
    maxDimension = Math.max(1400, Math.round(maxDimension * 0.82));
    quality = Math.max(0.68, quality - 0.06);
  }
}
