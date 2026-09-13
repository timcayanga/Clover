import { useEffect, useRef, useState } from "react";
import { useSession } from "./session";
import { Body, Button, Card, Field, Notice } from "./ui";

type Profile = { id: string; name: string; required: boolean };
export function SettingsProfiles() {
  const session = useSession();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [removing, setRemoving] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const result = session.demo
      ? Promise.resolve({
          profiles: (session.data?.profiles ?? []).map((p, index) => ({
            ...p,
            required: index === 0,
          })),
        })
      : session.request<{ profiles: Profile[] }>("settings/profiles");
    void result
      .then(({ profiles }) => {
        if (!mounted.current) return;
        setProfiles(profiles);
        setNames(Object.fromEntries(profiles.map((p) => [p.id, p.name])));
        setReady(true);
      })
      .catch((e) => {
        if (mounted.current) setError(e.message);
      });
    return () => {
      mounted.current = false;
    };
  }, [session.demo, session.request]);
  const mutate = async (
    kind: "create" | "rename" | "delete",
    profile?: Profile,
  ) => {
    if (pending.current || !ready) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const name = (
      kind === "create" ? newName : (names[profile?.id ?? ""] ?? "")
    ).trim();
    try {
      if (session.demo)
        throw new Error(
          "Sign in to manage Profiles. Sample data cannot be changed here.",
        );
      const result = await session.request<{ profile?: Profile }>(
        `settings/profiles${profile ? `/${encodeURIComponent(profile.id)}` : ""}`,
        {
          method:
            kind === "create" ? "POST" : kind === "rename" ? "PATCH" : "DELETE",
          ...(kind === "delete" ? {} : { body: JSON.stringify({ name }) }),
        },
      );
      session.refresh();
      if (!mounted.current) return;
      if (kind === "delete") {
        setProfiles((current) => current.filter((p) => p.id !== profile!.id));
        setRemoving(null);
      } else if (kind === "rename") {
        setProfiles((current) =>
          current.map((p) => (p.id === profile!.id ? { ...p, name } : p)),
        );
      } else if (result.profile) {
        const created = { ...result.profile, required: false };
        setProfiles((current) => [...current, created]);
        setNames((current) => ({ ...current, [created.id]: created.name }));
        setNewName("");
      }
      setMessage(
        kind === "delete" ? "Empty Profile removed." : "Profile saved.",
      );
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Unable to update Profile.");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <>
      <Body>Each Profile keeps its own financial records.</Body>
      {!ready && !error ? <Body>Loading Profiles…</Body> : null}
      {profiles.map((profile) => (
        <Card key={profile.id} style={{ borderRadius: 16 }}>
          <Field
            label="Profile name"
            value={names[profile.id] ?? ""}
            maxLength={80}
            editable={!busy}
            onChangeText={(name) =>
              setNames((current) => ({ ...current, [profile.id]: name }))
            }
          />
          <Button
            title="Save name"
            disabled={
              busy ||
              !(names[profile.id] ?? "").trim() ||
              names[profile.id].trim() === profile.name
            }
            onPress={() => void mutate("rename", profile)}
          />
          <Button
            title={
              session.profileId === profile.id
                ? "Current Profile"
                : "Switch to this Profile"
            }
            secondary
            disabled={busy || session.profileId === profile.id}
            onPress={() => session.setProfileId(profile.id)}
          />
          {profile.required ? (
            <Body>
              Your original Personal Profile is kept for your account.
            </Body>
          ) : (
            <Button
              title="Remove empty Profile"
              secondary
              disabled={busy}
              onPress={() => setRemoving(profile)}
            />
          )}
        </Card>
      ))}
      {ready ? (
        <Card style={{ borderRadius: 16 }}>
          <Field
            label="New Profile name"
            value={newName}
            maxLength={80}
            editable={!busy}
            onChangeText={setNewName}
          />
          <Button
            title={busy ? "Saving…" : "Create Profile"}
            disabled={busy || !newName.trim()}
            onPress={() => void mutate("create")}
          />
        </Card>
      ) : null}
      {removing ? (
        <Card>
          <Body>
            Remove {removing.name}? Only an empty Profile can be removed.
            Profiles containing financial records, imports or custom categories
            are protected.
          </Body>
          <Button
            title="Remove this empty Profile"
            disabled={busy}
            onPress={() => void mutate("delete", removing)}
          />
          <Button
            title="Cancel"
            secondary
            disabled={busy}
            onPress={() => setRemoving(null)}
          />
        </Card>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Body>{message}</Body> : null}
    </>
  );
}
