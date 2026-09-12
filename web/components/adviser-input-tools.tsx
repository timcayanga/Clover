"use client";
import { useEffect, useRef, useState } from "react";
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((event: {
        results: {
          [index: number]: { [index: number]: { transcript: string } };
        };
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export function AdviserInputTools({
  disabled,
  onText,
  onPhoto,
}: {
  disabled: boolean;
  onText: (text: string) => void;
  onPhoto: (file: File) => void;
}) {
  const photo = useRef<HTMLInputElement>(null);
  const recognition = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => () => recognition.current?.abort(), []);
  useEffect(() => {
    if (disabled) recognition.current?.abort();
  }, [disabled]);
  const speak = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Speech =
      (window as SpeechWindow).SpeechRecognition ??
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!Speech) {
      setNotice(
        "Voice input isn’t available in this browser. Use your keyboard’s dictation microphone or type below.",
      );
      return;
    }
    const current = new Speech();
    recognition.current = current;
    current.lang = navigator.language || "en-PH";
    current.continuous = false;
    current.interimResults = false;
    current.onresult = (event) => onText(event.results[0][0].transcript);
    current.onerror = () => {
      setListening(false);
      setNotice(
        "Voice input could not start. Check microphone permission, or type your message.",
      );
    };
    current.onend = () => setListening(false);
    setNotice("");
    try {
      current.start();
      setListening(true);
    } catch {
      setNotice("Microphone unavailable. Please try again or type below.");
    }
  };
  return (
    <>
      <div className="adviser-input-tools">
        <img src="/assets/organize/clover.svg" alt="Clover" />
        <button
          type="button"
          disabled={disabled}
          aria-pressed={listening}
          onClick={speak}
        >
          <img src="/assets/organize/microphone.svg" alt="" />
          {listening ? "Stop listening" : "Speak"}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => photo.current?.click()}
        >
          <img src="/assets/organize/camera.svg" alt="" />
          Take photo
        </button>
        <input
          ref={photo}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onPhoto(file);
            event.target.value = "";
          }}
        />
      </div>
      {notice || listening ? (
        <p role="status">
          {listening
            ? "Listening… Your words will be added for you to review before sending."
            : notice}
        </p>
      ) : null}
    </>
  );
}
