"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useId, useRef, useState } from "react";
import Link from "next/link";
import styles from "./public-info.module.css";
import type { ContactInquiryAttachment } from "@/lib/contact-inquiries";

export function ContactUsForm() {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const maxAttachmentBytes = 2 * 1024 * 1024;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<ContactInquiryAttachment | null>(
    null,
  );
  const [attachmentLabel, setAttachmentLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    message: false,
  });

  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const nameError = !name.trim()
    ? "Name is required."
    : name.trim().length < 2
      ? "Please enter at least 2 characters."
      : null;
  const emailError = !email.trim()
    ? "Email is required."
    : !emailIsValid
      ? "Please enter a valid email address."
      : null;
  const messageError = !message.trim()
    ? "An inquiry is required."
    : message.trim().length < 10
      ? "Please enter at least 10 characters."
      : null;
  const canSubmit = status !== "submitting";

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

    if (file.size > maxAttachmentBytes) {
      setAttachment(null);
      setAttachmentLabel("Please choose an image under 2 MB.");
      event.target.value = "";
      return;
    }

    try {
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
    } catch {
      setAttachment(null);
      setAttachmentLabel("Unable to read this image. Please choose it again.");
      event.target.value = "";
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setTouched({ name: true, email: true, message: true });

    if (
      !event.currentTarget.reportValidity() ||
      Boolean(nameError || emailError || messageError) ||
      !canSubmit
    ) {
      setStatus("error");
      const errors = [nameError, emailError, messageError].filter(Boolean);
      setFeedback(
        errors.length > 0
          ? errors.join(" ")
          : "Please correct the highlighted fields before sending your inquiry.",
      );
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

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          payload?.error ?? "Unable to submit your message right now.",
        );
      }

      setName("");
      setEmail("");
      setMessage("");
      setAttachment(null);
      setAttachmentLabel(null);
      if (fileInput.current) fileInput.current.value = "";
      setTouched({ name: false, email: false, message: false });
      setStatus("success");
      setFeedback(
        "Your message has been received. We aim to reply by email within 1 to 3 days.",
      );
    } catch (error) {
      setStatus("error");
      setFeedback(
        error instanceof Error
          ? error.message
          : "Unable to submit your message right now.",
      );
    }
  };

  return (
    <form
      className={styles.form}
      onSubmit={onSubmit}
      aria-busy={status === "submitting"}
    >
      <div className={styles.fields}>
        <label className={styles.field}>
          <span>Name *</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={120}
            aria-invalid={touched.name && Boolean(nameError)}
            aria-describedby={
              touched.name && nameError ? `${id}-name-error` : undefined
            }
            onBlur={() => setTouched((current) => ({ ...current, name: true }))}
          />
          {touched.name && nameError ? (
            <small id={`${id}-name-error`} className={styles.error}>
              {nameError}
            </small>
          ) : null}
        </label>

        <label className={styles.field}>
          <span>Email *</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            maxLength={160}
            aria-invalid={touched.email && Boolean(emailError)}
            aria-describedby={
              touched.email && emailError ? `${id}-email-error` : undefined
            }
            onBlur={() =>
              setTouched((current) => ({ ...current, email: true }))
            }
          />
          {touched.email && emailError ? (
            <small id={`${id}-email-error`} className={styles.error}>
              {emailError}
            </small>
          ) : null}
        </label>

        <label className={`${styles.field} ${styles.full}`}>
          <span>How can we help? *</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Tell us what you need help with..."
            required
            minLength={10}
            maxLength={4000}
            aria-invalid={touched.message && Boolean(messageError)}
            aria-describedby={
              touched.message && messageError
                ? `${id}-message-error`
                : undefined
            }
            onBlur={() =>
              setTouched((current) => ({ ...current, message: true }))
            }
          />
          {touched.message && messageError ? (
            <small id={`${id}-message-error`} className={styles.error}>
              {messageError}
            </small>
          ) : null}
        </label>

        <label className={`${styles.field} ${styles.full}`}>
          <span>Screenshot (optional)</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={onAttachmentChange}
            aria-describedby={`${id}-attachment-help`}
          />
          <small id={`${id}-attachment-help`}>
            Image only, up to 2 MB. Hide account numbers, balances, and other
            private details. Never attach passwords or one-time codes.
          </small>
          {attachmentLabel ? (
            <small role="status">{attachmentLabel}</small>
          ) : null}
        </label>
      </div>

      <div className={styles.formFooter}>
        <p className={styles.formNote}>
          Fields marked * are required. We use your contact details and message
          to respond to your request. Read our{" "}
          <Link href="/privacy-policy">Privacy Policy</Link>.
        </p>
        <div>
          <button className={styles.submit} type="submit" disabled={!canSubmit}>
            {status === "submitting" ? "Sending..." : "Send message"}
          </button>
        </div>
      </div>

      {feedback ? (
        <p
          className={styles.feedback}
          data-status={status}
          role={status === "error" ? "alert" : "status"}
        >
          {feedback}
        </p>
      ) : null}
    </form>
  );
}
