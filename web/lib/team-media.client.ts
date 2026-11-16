/** Only the explicit design preview uses browser storage; signed-in work uses private server storage. */
async function mediaJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Media storage is unavailable.");
  return data;
}
function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("clover-team-media-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("media");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Media storage is unavailable in this browser."));
  });
}
export async function saveTeamMedia(ownerId: string, file: File) {
  if (
    ![
      "image/png",
      "image/jpeg",
      "image/webp",
      "video/mp4",
      "video/webm",
    ].includes(file.type)
  )
    throw new Error("Choose a PNG, JPEG, WebP, MP4, or WebM file.");
  if (file.size > 100 * 1024 * 1024)
    throw new Error("Choose a file smaller than 100 MB.");
  if (ownerId !== "local-design-preview") {
    const upload = await mediaJson("/api/team/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: file.type, size: file.size }),
    });
    const response = await fetch(upload.url, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new Error("Media upload failed. Please try again.");
    await mediaJson(`/api/team/media/${encodeURIComponent(upload.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return upload.id as string;
  }
  const db = await openMediaDb();
  const id = crypto.randomUUID();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("media", "readwrite");
      tx.objectStore("media").put(file, `${ownerId}:${id}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new Error("Unable to save media. Check available browser storage."),
        );
      tx.onabort = () => reject(new Error("Media could not be saved."));
    });
  } finally {
    db.close();
  }
  return id;
}
export async function readTeamMedia(
  ownerId: string,
  id: string,
): Promise<Blob | string | undefined> {
  if (ownerId !== "local-design-preview") {
    const result = await mediaJson(`/api/team/media/${encodeURIComponent(id)}`);
    return result.url as string;
  }
  const db = await openMediaDb();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const req = db
        .transaction("media", "readonly")
        .objectStore("media")
        .get(`${ownerId}:${id}`);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error("Unable to open media."));
    });
  } finally {
    db.close();
  }
}
