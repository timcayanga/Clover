"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { assignmentRequest } from "@/lib/team-agent.client";
export function AssignmentImage({ mediaId }: { mediaId: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    assignmentRequest(`/api/team/media/${encodeURIComponent(mediaId)}`, undefined, controller.signal)
      .then((data) => { setUrl(data.url); setError(""); })
      .catch(() => { if (!controller.signal.aborted) setError("Could not load the private image. Refresh to try again."); });
    return () => controller.abort();
  }, [mediaId, refresh]);
  return <section className="studio-brief">
    <h2>Generated image</h2>
    <p>Unpublished artwork. Check text, visual details, and brand fit before approval.</p>
    {url ? <Image src={url} alt="Generated assignment artwork for owner review" width={1024} height={1024} unoptimized style={{ width: "100%", maxWidth: 640, height: "auto", borderRadius: 16 }} onError={() => setError("The private image link may have expired. Refresh to load it again.")} /> : null}
    {error ? <p role="alert">{error}</p> : null}
    <div className="assignment-actions">
      <button className="studio-button secondary" onClick={() => setRefresh((value) => value + 1)}>Refresh image</button>
      <a className="studio-button secondary" href={`/api/team/media/${mediaId}/download`}>Download image</a>
    </div>
  </section>;
}
