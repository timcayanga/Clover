import sharp from "sharp";

export const computeImportImageDifferenceHash = async (bytes: Uint8Array) => {
  if (bytes.length === 0) return null;
  try {
    const { data } = await sharp(Buffer.from(bytes))
      .rotate()
      .greyscale()
      .resize(9, 8, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    let bits = "";
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        const offset = row * 9 + column;
        bits += data[offset]! > data[offset + 1]! ? "1" : "0";
      }
    }
    return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
  } catch {
    return null;
  }
};

export const getImportImageHashDistance = (left: string, right: string) => {
  if (!/^[0-9a-f]{16}$/i.test(left) || !/^[0-9a-f]{16}$/i.test(right)) return Number.POSITIVE_INFINITY;
  let difference = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let distance = 0;
  while (difference > 0n) {
    difference &= difference - 1n;
    distance += 1;
  }
  return distance;
};
