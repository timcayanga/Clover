"use client";

import type { FormEvent } from "react";
import { useState } from "react";

type ContactUsFormProps = {
  helpEmail: string;
};

export function ContactUsForm({ helpEmail }: ContactUsFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);

  const canSubmit = name.trim().length >= 2 && email.trim().length > 0 && message.trim().length >= 10 && status !== "submitting";

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
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to submit your message right now.");
      }

      setName("");
      setEmail("");
      setMessage("");
      setStatus("success");
      setFeedback("Thanks. Your message has been sent to the Clover support inbox.");
    } catch (error) {
      setStatus("error");
      setFeedback(error instanceof Error ? error.message : "Unable to submit your message right now.");
    }
  };

  return (
    <form className="contact-form glass" onSubmit={onSubmit}>
      <div className="contact-form__fields">
        <label className="contact-field">
          <span>Name</span>
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
          <span>Email</span>
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
          <span>Inquiry / question / concern</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Tell us what you need help with..."
            required
            minLength={10}
            maxLength={4000}
          />
        </label>
      </div>

      <div className="contact-form__footer">
        <p className="contact-form__note">
          Your message will be stored in Clover&apos;s admin inbox. The team can reply using <a href={`mailto:${helpEmail}`}>{helpEmail}</a>.
        </p>
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
