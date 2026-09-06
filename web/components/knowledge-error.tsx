"use client";
import { KnowledgeShell, KnowledgeContact } from "./knowledge-shell";
import styles from "./knowledge.module.css";
export function KnowledgeError({
  reset,
  active = "help",
}: {
  reset: () => void;
  active?: "help" | "guide";
}) {
  return (
    <KnowledgeShell active={active}>
      <section className={styles.empty}>
        <h1>{active === "guide" ? "Guides" : "Help Center"}</h1>
        <p>We couldn’t load the latest articles. Please try again shortly.</p>
        <button className={styles.button} onClick={reset}>
          Try again
        </button>
      </section>
      <KnowledgeContact />
    </KnowledgeShell>
  );
}
