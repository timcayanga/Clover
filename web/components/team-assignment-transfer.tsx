"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { assignmentRequest } from "@/lib/team-agent.client";
import { agentProfiles } from "@/lib/team-studio";
import type { AssignmentView } from "@/lib/team-agent-contract";
export function AssignmentTransfer({ run }: { run: AssignmentView }) {
  const router = useRouter();
  const lock = useRef(false);
  const [kind, setKind] = useState<"brief" | "draft">("brief");
  const [agent, setAgent] = useState("creator");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("Draft from approved assignment");
  const [caption, setCaption] = useState(run.result.slice(0, 6000));
  const [channel, setChannel] = useState("Instagram");
  const [format, setFormat] = useState("Text");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await assignmentRequest(
        `/api/team/assignments/${run.id}`,
        kind === "brief"
          ? { kind, agent, text }
          : { kind, title, caption, channel, format },
      );
      router.push(result.href);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to create the next step.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <section className="studio-brief studio-form">
      <h2>Put approved work into action</h2>
      <label>
        Next step
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "brief" | "draft")}
        >
          <option value="brief">Create a follow-up brief</option>
          <option value="draft">Create a content draft</option>
        </select>
      </label>
      {kind === "brief" ? (
        <>
          <p>
            The receiving agent will get this approved result as context when
            you start the saved brief.
          </p>
          <label>
            Team member
            <select value={agent} onChange={(e) => setAgent(e.target.value)}>
              {agentProfiles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            What should they do next?
            <textarea
              rows={4}
              maxLength={6000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Turn this approved plan into three launch captions and visual directions."
            />
          </label>
        </>
      ) : (
        <>
          <p>
            This creates an editable draft for its own review. You can attach
            images or videos on the content board.
          </p>
          <label>
            Draft title
            <input
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Draft copy
            <textarea
              rows={8}
              maxLength={6000}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </label>
          {run.result.length > 6000 ? (
            <p className="studio-fine">
              The result exceeds the draft’s 6,000-character limit. The first
              6,000 characters are shown; choose the copy to include before
              saving.
            </p>
          ) : null}
          <label>
            Channel
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              {["Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn"].map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Format
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              {["Text", "Image", "Carousel", "Video"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </>
      )}
      <button
        className="studio-button"
        disabled={
          busy ||
          (kind === "brief" ? !text.trim() : !title.trim() || !caption.trim())
        }
        onClick={submit}
      >
        {busy
          ? "Saving…"
          : kind === "brief"
            ? "Save follow-up brief"
            : "Create content draft"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
