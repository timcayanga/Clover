"use client";

import type { FormEvent } from "react";
import { useState } from "react";

export function StagingGate() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Enter the staging password to continue.");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("Checking password...");

    try {
      const response = await fetch("/api/staging-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setMessage("Wrong password. Try again.");
        return;
      }

      setMessage("Access granted.");
      window.location.reload();
    } catch {
      setMessage("Unable to verify password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(circle at top, rgba(15, 118, 110, 0.12), transparent 26%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "min(480px, 100%)",
          background: "rgba(255,255,255,0.8)",
          border: "1px solid rgba(15,23,42,0.08)",
          borderRadius: 24,
          padding: 24,
          boxShadow: "0 24px 70px rgba(15, 23, 42, 0.12)",
          display: "grid",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontWeight: 800, letterSpacing: "-0.03em", fontSize: "1.75rem" }}>Clover staging</div>
          <p style={{ color: "#52607a", lineHeight: 1.6, margin: "8px 0 0" }}>
            This environment is locked. Enter the staging password to continue.
          </p>
        </div>

        <label style={{ display: "grid", gap: 8, color: "#52607a" }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter staging password"
            style={{
              minHeight: 44,
              borderRadius: 12,
              border: "1px solid rgba(15,23,42,0.1)",
              padding: "0 14px",
              font: "inherit",
            }}
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            minHeight: 46,
            borderRadius: 14,
            border: "none",
            background: "linear-gradient(135deg, #0f766e, #115e59)",
            color: "white",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {isSubmitting ? "Checking..." : "Enter staging"}
        </button>

        <p style={{ margin: 0, color: "#52607a" }}>{message}</p>
      </form>
    </main>
  );
}
