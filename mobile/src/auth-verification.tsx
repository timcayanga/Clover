import { useState } from "react";
import { useHostedAuth } from "@clerk/expo/hosted-auth";
import { Button, Notice } from "./ui";
export function AuthVerification({ signup }: { signup: boolean }) {
  const { startHostedAuth } = useHostedAuth(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <><Button title="Continue security verification" disabled={busy} onPress={() => { setBusy(true); setError(""); void startHostedAuth({ mode: signup ? "sign-up" : "sign-in" }).catch(() => setError("Unable to open secure verification.")).finally(() => setBusy(false)); }} />{error ? <Notice>{error}</Notice> : null}</>;
}
