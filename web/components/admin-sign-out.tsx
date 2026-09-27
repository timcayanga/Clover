"use client";

import { useClerk } from "@clerk/nextjs";
import { useState } from "react";
import { persistRememberedSessionId } from "@/lib/clerk-session-persistence";
import { getNavigationIconSrc } from "@/lib/navigation-icons";

export function AdminSignOut() {
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      persistRememberedSessionId(null);
      await signOut({ redirectUrl: "/sign-in" });
    } catch {
      setError("Unable to log out. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="admin-sign-out">
    <button type="button" className="admin-sign-out__button" onClick={() => void handleSignOut()} disabled={busy}>
      <img src={getNavigationIconSrc("signOut")} alt="" width={20} height={20} />
      {busy ? "Logging out…" : "Log out"}
    </button>
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
