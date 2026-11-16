export const createCircleAvatarDataUrl = async (file: File) => {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file for the Circle photo.");
  }
  if (file.size > 8_000_000) {
    throw new Error("Choose an image smaller than 8 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(
      1,
      320 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare this Circle photo.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.72, 0.58]) {
      const dataUrl = canvas.toDataURL("image/webp", quality);
      if (dataUrl.length <= 180_000) return dataUrl;
    }
    throw new Error(
      "This image is still too large. Try a simpler or smaller photo.",
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};
