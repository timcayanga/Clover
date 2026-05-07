export const createAvatarFileFromUrl = async (url: string, fileName: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Unable to load the selected avatar.");
  }

  const blob = await response.blob();
  return new File([blob], fileName, {
    type: blob.type || "image/png",
  });
};
