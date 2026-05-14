"use client";

import { useEffect, useState } from "react";
import { useClerk } from "@clerk/nextjs";

export function SignOutScreen() {
  const { signOut } = useClerk();
  const [message, setMessage] = useState("Signing you out...");

  useEffect(() => {
    void signOut({ redirectUrl: "/sign-in" }).catch(() => {
      window.location.assign("/sign-in");
    });
  }, [signOut]);

  return (
    <main className="auth-page auth-page--signin">
      <section className="glass" style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
        <p className="eyebrow">Signing out</p>
        <h1>{message}</h1>
        <p>If you are still signed in, Clover will send you back to the sign-in page.</p>
      </section>
    </main>
  );
}
