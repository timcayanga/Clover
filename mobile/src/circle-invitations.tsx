import { useEffect, useRef, useState } from "react";
import { Share } from "react-native";
import { apiBase } from "./api";
import { useSession } from "./session";
import { Body, Card, Field, Notice, Screen } from "./ui";
import { PlanAction, PlanHeader } from "./plan-ui";
import { Choices } from "./transaction-entry";

type Invitation = {
  id: string;
  circleName?: string;
  invitedBy?: string;
  email?: string;
  displayName?: string;
  role: string;
  expiresAt: string;
  href?: string;
};
type InvitationDetail = {
  invitation: {
    circle: { name: string; description: string; memberCount: number };
    role: string;
    privacy: string;
    invitedBy: string;
  };
};
export function CircleInvitations({
  circleId,
  onClose,
  onJoined,
}: {
  circleId?: string;
  onClose: () => void;
  onJoined: () => void;
}) {
  const session = useSession();
  const [items, setItems] = useState<Invitation[]>([]);
  const [selected, setSelected] = useState<Invitation | null>(null);
  const [detail, setDetail] = useState<InvitationDetail | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [confirm, setConfirm] = useState<{
    method: string;
    id?: string;
  } | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const lock = useRef(false),
    live = useRef(true);
  const path = circleId
    ? `circles/${circleId}/invitations`
    : "circle-invitations";
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => setConfirm(null), [email, name, role]);
  useEffect(() => {
    let active = true;
    if (session.demo) return;
    setBusy(true);
    setError("");
    void session
      .request<{ invitations: Invitation[] }>(path)
      .then((r) => {
        if (active) setItems(r.invitations);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision, session.demo, session.request]);
  const token = (invitation: Invitation) => {
    const match = invitation.href?.match(/^\/circles\/join\/([a-f0-9]{48})$/i);
    if (!match) throw new Error("This invitation link is unavailable.");
    return match[1];
  };
  const open = async (item: Invitation) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await session.request<InvitationDetail>(
        `circle-invitations/${token(item)}`,
      );
      if (live.current) {
        setSelected(item);
        setDetail(result);
      }
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  };
  const act = async (method: string, id?: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setShareUrl("");
    try {
      if (session.demo) throw new Error("Sign in to manage invitations.");
      if (!circleId && selected) {
        await session.request(`circle-invitations/${token(selected)}`, {
          method: "POST",
        });
        if (live.current) onJoined();
        return;
      }
      const result = await session.request<{
        invitation?: { shareUrl: string; emailSent: boolean };
      }>(`${path}${id ? `/${id}` : ""}`, {
        method,
        ...(method === "POST"
          ? {
              body: JSON.stringify({
                email: email.trim(),
                displayName: name.trim() || null,
                role,
              }),
            }
          : {}),
      });
      if (live.current) {
        setConfirm(null);
        setRevision((v) => v + 1);
        setNotice(
          method === "DELETE"
            ? "Invitation revoked."
            : result.invitation?.emailSent
              ? "Invitation sent."
              : "Invitation created. Share the link to invite this person.",
        );
        if (result.invitation?.shareUrl)
          setShareUrl(
            new URL(result.invitation.shareUrl, apiBase()).toString(),
          );
        if (method === "POST") {
          setEmail("");
          setName("");
        }
      }
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  };
  return (
    <Screen>
      <PlanHeader
        title={circleId ? "Invite people" : "Circle invitations"}
        back={() => {
          if (!busy) {
            if (selected) {
              setSelected(null);
              setDetail(null);
            } else onClose();
          }
        }}
      />
      {error ? <Notice>{error}</Notice> : null}
      {notice ? <Body>{notice}</Body> : null}
      {shareUrl ? (
        <PlanAction
          title="Share invitation link"
          onPress={() =>
            void Share.share({ message: shareUrl }).catch((e) =>
              setError(e.message),
            )
          }
        />
      ) : null}
      {session.demo ? (
        <Notice>Sign in to see and manage your Circle invitations.</Notice>
      ) : selected && detail ? (
        <Card>
          <Body muted={false}>{detail.invitation.circle.name}</Body>
          <Body>{detail.invitation.circle.description}</Body>
          <Body>
            Invited by {detail.invitation.invitedBy} · {detail.invitation.role}{" "}
            · {detail.invitation.circle.memberCount} members
          </Body>
          <Body>{detail.invitation.privacy}</Body>
          <PlanAction
            title="Accept and join Circle"
            tone="primary"
            disabled={busy}
            onPress={() => void act("POST")}
          />
          <PlanAction
            title="Not now"
            disabled={busy}
            onPress={() => {
              setSelected(null);
              setDetail(null);
            }}
          />
        </Card>
      ) : (
        <>
          {circleId ? (
            <Card>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                maxLength={254}
              />
              <Field
                label="Name (optional)"
                value={name}
                onChangeText={setName}
                maxLength={100}
              />
              <Body>Access</Body>
              <Choices
                value={role}
                onChange={setRole}
                options={[
                  { value: "participant", label: "View only" },
                  { value: "member", label: "Contribute" },
                  { value: "organizer", label: "Manage Circle" },
                ]}
              />
              <Body>
                Only information shared with the Circle is visible. Organizers
                can manage members and settings.
              </Body>
              <PlanAction
                title="Review invitation"
                tone="primary"
                disabled={busy || !email.trim()}
                onPress={() => setConfirm({ method: "POST" })}
              />
            </Card>
          ) : null}
          {confirm ? (
            <Card>
              <Body>
                {confirm.method === "DELETE"
                  ? "Revoke this invitation? Its link will stop working."
                  : confirm.method === "PATCH"
                    ? "Send a new invitation? The previous link will stop working."
                    : `Send an email invitation to ${email.trim()} with ${role} access?`}
              </Body>
              <PlanAction
                title={
                  confirm.method === "DELETE"
                    ? "Revoke invitation"
                    : "Send invitation"
                }
                tone={confirm.method === "DELETE" ? "delete" : "primary"}
                disabled={busy}
                onPress={() => void act(confirm.method, confirm.id)}
              />
              <PlanAction
                title="Cancel"
                disabled={busy}
                onPress={() => setConfirm(null)}
              />
            </Card>
          ) : null}
          <Body>{circleId ? "Pending invitations" : "Invited to join"}</Body>
          {busy ? <Body>Loading…</Body> : null}
          {!busy && !items.length ? <Body>No pending invitations.</Body> : null}
          {items.map((item) => (
            <Card key={item.id}>
              <Body muted={false}>
                {item.circleName || item.displayName || item.email}
              </Body>
              {item.displayName && item.email ? (
                <Body>{item.email}</Body>
              ) : null}
              <Body>
                {item.role} · Expires {item.expiresAt.slice(0, 10)}
              </Body>
              {circleId ? (
                <>
                  <PlanAction
                    title="Resend"
                    disabled={busy}
                    onPress={() => setConfirm({ method: "PATCH", id: item.id })}
                  />
                  <PlanAction
                    title="Revoke"
                    tone="delete"
                    disabled={busy}
                    onPress={() =>
                      setConfirm({ method: "DELETE", id: item.id })
                    }
                  />
                </>
              ) : (
                <PlanAction
                  title="View invitation"
                  disabled={busy}
                  onPress={() => void open(item)}
                />
              )}
            </Card>
          ))}
          <PlanAction
            title="Refresh invitations"
            disabled={busy || session.demo}
            onPress={() => setRevision((v) => v + 1)}
          />
        </>
      )}
    </Screen>
  );
}
