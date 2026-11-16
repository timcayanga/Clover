type RgbPreview = { data: Uint8Array; width: number; height: number };

/** Trim only uniform white margins. Even very faint ink counts as content. */
export function findImportImageTextRegion({ data, width, height }: RgbPreview) {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0, offset = 0; y < height; y++) {
    for (let x = 0; x < width; x++, offset += 3) {
      if (data[offset] === 255 && data[offset + 1] === 255 && data[offset + 2] === 255) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = y;
    }
  }
  if (right < left || bottom < top) return null;
  const padding = Math.max(16, Math.ceil(Math.min(width, height) * 0.025));
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(width, right + padding + 1);
  bottom = Math.min(height, bottom + padding + 1);
  const region = { left, top, width: right - left, height: bottom - top };
  return region.width * region.height <= width * height * 0.8 ? region : null;
}
