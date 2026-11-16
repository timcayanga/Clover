"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "@/app/install/install.module.css";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallState = "checking" | "installed" | "ios" | "browser" | "prompt";

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 16V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 7v10M7 12h10" />
    </svg>
  );
}

export function InstallClover() {
  const [state, setState] = useState<InstallState>("checking");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    if (standalone) {
      setState("installed");
      return;
    }

    const isIos = /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    setState(isIos ? "ios" : "browser");

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setState("prompt");
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") {
      setState("installed");
    }
    setInstallPrompt(null);
  };

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="install-title">
        <div className={styles.brand}>
          <span className={styles.mark}>
            <Image src="/clover-mark.svg" width={62} height={62} alt="" priority />
          </span>
          <span>Clover</span>
        </div>

        <div className={styles.copy}>
          <p className={styles.eyebrow}>{state === "installed" ? "Ready to use" : "Clover for iPhone"}</p>
          <h1 id="install-title">
            {state === "installed" ? "Clover is on your Home Screen." : "Your finances, one tap away."}
          </h1>
          <p>
            {state === "installed"
              ? "Open Clover below and continue with the same synced account you use on desktop."
              : "Add Clover to your Home Screen for a focused, full-screen experience. Your data stays synced with clover.ph."}
          </p>
        </div>

        {state === "ios" ? (
          <ol className={styles.steps} aria-label="Install Clover on iPhone">
            <li>
              <span className={styles.stepIcon}><ShareIcon /></span>
              <span><strong>Tap Share</strong><small>Use Safari’s Share button.</small></span>
            </li>
            <li>
              <span className={styles.stepIcon}><AddIcon /></span>
              <span><strong>Add to Home Screen</strong><small>Scroll down if the option is not visible.</small></span>
            </li>
            <li>
              <span className={styles.number}>3</span>
              <span><strong>Turn on Open as Web App</strong><small>Then tap Add.</small></span>
            </li>
          </ol>
        ) : null}

        {state === "browser" ? (
          <p className={styles.note}>Open this page in Safari on your iPhone, then use Share and Add to Home Screen.</p>
        ) : null}

        <div className={styles.actions}>
          {state === "prompt" ? (
            <button type="button" className={styles.primary} onClick={() => void install()}>Install Clover</button>
          ) : (
            <Link className={styles.primary} href="/continue">Open Clover</Link>
          )}
          <Link className={styles.secondary} href="/">Back to clover.ph</Link>
        </div>

        <p className={styles.footnote}>No App Store download is required.</p>
      </section>
    </main>
  );
}
