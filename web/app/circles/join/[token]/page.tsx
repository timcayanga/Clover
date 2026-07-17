"use client";

import { use, useEffect, useState } from "react";

type CircleInvite = {
  circle: {
    name: string;
    type: string;
    description: string | null;
    avatarUrl: string | null;
    memberCount: number;
    members: Array<{ displayName: string; role: string }>;
  };
  invitedBy: string;
  role: string;
  expiresAt: string;
  privacy: string;
};

export default function CircleJoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [invitation, setInvitation] = useState<CircleInvite | null>(null);
  const [message, setMessage] = useState("Loading your Circle invitation...");
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/circle-invitations/${encodeURIComponent(token)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || "This invitation is unavailable.");
        setInvitation(payload.invitation);
        setMessage("");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setMessage(
          error instanceof Error
            ? error.message
            : "This invitation is unavailable.",
        );
      });
    return () => controller.abort();
  }, [token]);

  const join = async () => {
    setIsJoining(true);
    setMessage("Joining Circle...");
    try {
      const response = await fetch(
        `/api/circle-invitations/${encodeURIComponent(token)}`,
        { method: "POST" },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Unable to join this Circle.");
      window.location.href = `/circles?circle=${encodeURIComponent(payload.circleId)}`;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to join this Circle.",
      );
      setIsJoining(false);
    }
  };

  return (
    <main className="circle-join-page">
      <section className="circle-join-card panel glass">
        <img
          className="circle-join-card__logo"
          src="/clover-mark.svg"
          alt="Clover"
        />
        {invitation ? (
          <>
            <p className="eyebrow">{invitation.circle.type} Circle invitation</p>
            <div className="circle-join-card__identity">
              {invitation.circle.avatarUrl ? (
                <img src={invitation.circle.avatarUrl} alt="" />
              ) : (
                <span>{invitation.circle.name[0]}</span>
              )}
              <div>
                <h1>{invitation.circle.name}</h1>
                <p>Invited by {invitation.invitedBy}</p>
              </div>
            </div>
            <p>
              {invitation.circle.description ||
                "A private space for coordinating selected finances together."}
            </p>
            <div className="circle-join-card__privacy">
              <strong>Your finances remain private.</strong>
              <span>{invitation.privacy}</span>
            </div>
            <div className="circle-join-card__members">
              <strong>
                {invitation.circle.memberCount} current member
                {invitation.circle.memberCount === 1 ? "" : "s"}
              </strong>
              {invitation.circle.members.map((member) => (
                <span key={`${member.displayName}:${member.role}`}>
                  {member.displayName} · {member.role}
                </span>
              ))}
            </div>
            <p className="panel-muted">
              You will join as {invitation.role}. Invitation expires{" "}
              {new Date(invitation.expiresAt).toLocaleDateString("en-PH", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              .
            </p>
            <button
              className="button button-primary"
              type="button"
              onClick={() => void join()}
              disabled={isJoining}
            >
              {isJoining ? "Joining..." : "Join Circle"}
            </button>
          </>
        ) : (
          <>
            <p className="eyebrow">Circle invitation</p>
            <h1>{message}</h1>
          </>
        )}
        {message && invitation ? (
          <p role="status" className="circles-form-message">
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
