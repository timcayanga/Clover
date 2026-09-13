import { useSensitiveAction } from "./sensitive-action";
import { useEffect, useRef, useState } from "react";
import { useUser, useAuth } from "@clerk/expo";
import { useSession } from "./session";
import { Body, Button, Card, Field, Notice } from "./ui";
export function SettingsSecurity() {
  const session = useSession();
  return session.demo ? (
    <Card>
      <Body>Sign in to manage your password and active sessions.</Body>
    </Card>
  ) : (
    <SecurityControls />
  );
}
function SecurityControls() {
  const sensitive = useSensitiveAction();
  const { user, isLoaded } = useUser();
  const { sessionId, signOut } = useAuth();
  const [sessions, setSessions] = useState<
    Awaited<ReturnType<NonNullable<typeof user>["getSessions"]>>
  >([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [changePassword, setChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [revision, setRevision] = useState(0);
  const pending = useRef(false);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setReady(false);
    void user
      .getSessions()
      .then((rows) => {
        if (active) {
          setSessions(rows.filter((s) => s.status === "active"));
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user, revision]);
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await sensitive.execute(action);
      setConfirm(null);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to update security settings.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  if (!isLoaded || !user) return <Body>Loading security settings…</Body>;
  return (
    <>
      {sensitive.view}
      <Card style={{ borderRadius: 16 }}>
        <Body>Password</Body>
        <Button
          title={user.passwordEnabled ? "Change password" : "Set password"}
          disabled={busy}
          secondary
          onPress={() => setChangePassword((v) => !v)}
        />
        {changePassword ? (
          <>
            {user.passwordEnabled ? (
              <Field
                label="Current password"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                editable={!busy}
              />
            ) : null}
            <Field
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              editable={!busy}
            />
            <Field
              label="Confirm new password"
              value={repeat}
              onChangeText={setRepeat}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              editable={!busy}
            />
            <Body>
              Other sessions will be signed out after your password changes.
            </Body>
            <Button
              title="Save password"
              disabled={
                busy ||
                !password ||
                password !== repeat ||
                (user.passwordEnabled && !currentPassword)
              }
              onPress={() =>
                void run(async () => {
                  await user.updatePassword({
                    ...(user.passwordEnabled ? { currentPassword } : {}),
                    newPassword: password,
                    signOutOfOtherSessions: true,
                  });
                  setCurrentPassword("");
                  setPassword("");
                  setRepeat("");
                  setChangePassword(false);
                  setMessage("Password updated.");
                })
              }
            />
            <Button
              title="Cancel"
              secondary
              disabled={busy}
              onPress={() => {
                setChangePassword(false);
                setCurrentPassword("");
                setPassword("");
                setRepeat("");
              }}
            />
          </>
        ) : null}
      </Card>
      <Card style={{ borderRadius: 16 }}>
        <Body>Active sessions</Body>
        {!ready ? <Body>Loading sessions…</Body> : null}
        {sessions.map((item) => (
          <Card key={item.id}>
            <Body>
              {item.latestActivity.deviceType ||
                item.latestActivity.browserName ||
                "Device"}
              {item.id === sessionId ? " · Current" : ""}
            </Body>
            <Body>
              Last active {new Date(item.lastActiveAt).toLocaleString()}
            </Body>
            <Button
              title="Sign out this device"
              secondary
              disabled={busy}
              onPress={() => setConfirm(item.id)}
            />
          </Card>
        ))}
        <Button
          title="Sign out of all devices"
          secondary
          disabled={busy || !ready}
          onPress={() => setConfirm("all")}
        />
        <Button
          title="Refresh sessions"
          secondary
          disabled={busy}
          onPress={() => setRevision((v) => v + 1)}
        />
      </Card>
      {confirm ? (
        <Card>
          <Body>
            {confirm === "all"
              ? "Sign out of all devices, including this one?"
              : "Sign out the selected device?"}
          </Body>
          <Button
            title="Confirm sign out"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                const current = await user.getSessions();
                const targets = current.filter(
                  (s) =>
                    s.status === "active" &&
                    (confirm === "all" || s.id === confirm),
                );
                // Revoke this session last so the remaining authenticated calls can finish.
                for (const target of targets.filter((s) => s.id !== sessionId))
                  await target.revoke();
                if (targets.some((s) => s.id === sessionId)) await signOut();
                else setMessage("Selected session signed out.");
              })
            }
          />
          <Button
            title="Cancel"
            secondary
            disabled={busy}
            onPress={() => setConfirm(null)}
          />
        </Card>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Body>{message}</Body> : null}
    </>
  );
}
