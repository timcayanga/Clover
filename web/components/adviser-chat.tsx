"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { trackAdviserInteraction } from "@/lib/adviser-interactions";

type AdviserPrompt = {
  id: string;
  group: string;
  label: string;
  prompt: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AdviserChatProps = {
  isPro: boolean;
  prompts: AdviserPrompt[];
};

export function AdviserChat({ isPro, prompts }: AdviserChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const visiblePrompts = useMemo(() => prompts.slice(0, 4), [prompts]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) {
      return;
    }

    setError(null);
    setIsSending(true);
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");

    try {
      const response = await fetch("/api/adviser/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to get a response from Adviser.");
      }

      const payload = (await response.json()) as { reply?: string };
      const reply = payload.reply?.trim() || "I could not generate a response just now.";

      setMessages((current) => [...current, { role: "assistant", content: reply }]);
      window.setTimeout(scrollToBottom, 0);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to get a response from Adviser.");
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendMessage(input);
  };

  if (!isPro) {
    return (
      <div className="adviser-chat adviser-chat--locked">
        <div className="adviser-chat__locked-copy">
          <p className="eyebrow">Pro only</p>
          <p>
            Upgrade to Pro to unlock conversational help, guided follow-ups, and contextual answers from the same Adviser data model.
          </p>
        </div>
        <Link href="/pricing" className="button button-primary button-small">
          View Pro
        </Link>
      </div>
    );
  }

  return (
    <div className="adviser-chat">
      <form className="adviser-chat__composer" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="adviser-chat-input">
          Ask Clover anything
        </label>
        <div className="adviser-chat__composer-bar">
          <input
            id="adviser-chat-input"
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask Clover a question about your money..."
          />
          <button type="submit" className="button button-primary button-small" disabled={isSending || input.trim().length === 0}>
            {isSending ? "Sending" : "Send"}
          </button>
          {isSending || error ? <span className="adviser-chat__status">{isSending ? "Thinking..." : error}</span> : null}
        </div>
      </form>

      <div className="adviser-chat__prompt-row" aria-label="Suggested questions">
        {visiblePrompts.map((prompt) => (
          <button
            key={prompt.id}
            type="button"
            className="adviser-chat__prompt"
            onClick={() => {
              trackAdviserInteraction({
                kind: "prompt",
                group: prompt.group,
                itemId: prompt.id,
                label: prompt.label,
                pathname: window.location.pathname,
              });
              void sendMessage(prompt.prompt);
            }}
          >
            {prompt.label}
          </button>
        ))}
      </div>

      {messages.length > 0 ? (
        <div className="adviser-chat__thread" role="log" aria-live="polite" aria-relevant="additions text">
          {messages.map((message, index) => (
            <article
              key={`${message.role}-${index}`}
              className={`adviser-chat__message adviser-chat__message--${message.role}`}
            >
              <span>{message.role === "user" ? "You" : "Clover"}</span>
              <p>{message.content}</p>
            </article>
          ))}
          <div ref={bottomRef} />
        </div>
      ) : null}
    </div>
  );
}
