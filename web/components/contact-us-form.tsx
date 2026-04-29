"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";
import type { ContactInquiryAttachment } from "@/lib/contact-inquiries";

export function ContactUsForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<ContactInquiryAttachment | null>(null);
  const [attachmentLabel, setAttachmentLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);

  const canSubmit = name.trim().length >= 2 && email.trim().length > 0 && message.trim().length >= 10 && status !== "submitting";

  const onAttachmentChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      setAttachment(null);
      setAttachmentLabel(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setAttachment(null);
      setAttachmentLabel("Please choose an image file.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAttachment(null);
      setAttachmentLabel("Please choose an image under 5 MB.");
      event.target.value = "";
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Unable to read the file."));
      reader.readAsDataURL(file);
    });

    setAttachment({
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl,
    });
    setAttachmentLabel(file.name);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setStatus("submitting");
    setFeedback(null);

    try {
      const response = await fetch("/api/contact-us", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          message,
          attachment,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to submit your message right now.");
      }

      setName("");
      setEmail("");
      setMessage("");
      setAttachment(null);
      setAttachmentLabel(null);
      setStatus("success");
      setFeedback("Thanks. The Clover team will get back to you within 1 to 3 days.");
    } catch (error) {
      setStatus("error");
      setFeedback(error instanceof Error ? error.message : "Unable to submit your message right now.");
    }
  };

  return (
    <form className="contact-form glass" onSubmit={onSubmit}>
      <div className="contact-form__fields">
        <label className="contact-field">
          <span>Name *</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={120}
          />
        </label>

        <label className="contact-field">
          <span>Email *</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            maxLength={160}
          />
        </label>

        <label className="contact-field contact-field--full">
          <span>Inquiry / question / concern *</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Tell us what you need help with..."
            required
            minLength={10}
            maxLength={4000}
          />
        </label>

        <label className="contact-field contact-field--full contact-field--attachment">
          <span>Upload an image if something is wrong</span>
          <input type="file" accept="image/*" onChange={onAttachmentChange} />
          <small>Optional, but helpful if you want to show an error, broken layout, or upload issue.</small>
          {attachmentLabel ? <small>{attachmentLabel}</small> : null}
        </label>
      </div>

      <div className="contact-form__footer">
        <p className="contact-form__note">All fields marked with * are required. Uploading an image is optional.</p>
        <div className="contact-form__actions">
          <button className="button button-primary button-pill" type="submit" disabled={!canSubmit}>
            {status === "submitting" ? "Sending..." : "Send inquiry"}
          </button>
        </div>
      </div>

      {feedback ? (
        <p className={`contact-form__feedback contact-form__feedback--${status}`} aria-live="polite">
          {feedback}
        </p>
      ) : null}
    </form>
  );
}
