// Older clients can display the complete server message without a new
// processing phase. New clients can also reopen the camera from that message.
export const PHOTO_RETAKE_INSTRUCTION = "Retake the photo or upload a clearer image.";

export function isPhotoRetakeMessage(message?: string | null) {
  return Boolean(message?.includes(PHOTO_RETAKE_INSTRUCTION));
}
