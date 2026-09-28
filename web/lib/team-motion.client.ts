/** A local, silent 6-second zoom clip; this is not generative scene video. */
export async function createTeamMotionClip(source: Blob | string): Promise<File> {
  if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream)
    throw new Error("This browser cannot create motion clips. Use Chrome or upload a video file.");
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mime) throw new Error("This browser cannot export WebM. Use Chrome or upload a video file.");
  const blob = typeof source === "string" ? await fetch(source, { signal: AbortSignal.timeout(15000) }).then((response) => {
    if (!response.ok) throw new Error("Could not open the source image. Refresh and try again.");
    return response.blob();
  }) : source;
  const objectUrl = URL.createObjectURL(blob);
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let drawTimer: ReturnType<typeof setInterval> | undefined;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const image = new window.Image();
    image.src = objectUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1080;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Video rendering is unavailable in this browser.");
    const scale = Math.max(1080 / image.naturalWidth, 1080 / image.naturalHeight);
    function draw(progress: number) {
      const zoom = scale * (1 + 0.06 * Math.min(1, progress));
      const width = image.naturalWidth * zoom;
      const height = image.naturalHeight * zoom;
      context!.fillStyle = "#f8f6ef";
      context!.fillRect(0, 0, 1080, 1080);
      context!.drawImage(image, (1080 - width) / 2, (1080 - height) / 2, width, height);
    }
    draw(0);
    stream = canvas.captureStream(24);
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    const recorded = new Promise<Blob>((resolve, reject) => {
      const chunks: Blob[] = [];
      recorder!.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder!.onerror = () => reject(new Error("Video recording failed. Your source image is unchanged."));
      recorder!.onstop = () => chunks.length ? resolve(new Blob(chunks, { type: "video/webm" })) : reject(new Error("The video was empty. Keep this tab open while creating it."));
    });
    recorder.start(250);
    const started = performance.now();
    drawTimer = setInterval(() => draw((performance.now() - started) / 6000), 1000 / 24);
    stopTimer = setTimeout(() => { if (recorder?.state === "recording") recorder.stop(); }, 6000);
    const video = await recorded;
    return new File([video], "clover-motion-clip.webm", { type: "video/webm" });
  } finally {
    if (drawTimer) clearInterval(drawTimer);
    if (stopTimer) clearTimeout(stopTimer);
    if (recorder?.state === "recording") recorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
    URL.revokeObjectURL(objectUrl);
  }
}
