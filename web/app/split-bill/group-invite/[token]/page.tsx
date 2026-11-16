"use client";

import { useEffect, useState } from "react";

type InviteGroup = { name: string; avatarUrl: string | null; members: Array<{ id: string; name: string }> };

export default function SplitBillGroupInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const [group, setGroup] = useState<InviteGroup | null>(null);
  const [message, setMessage] = useState("Loading group invite...");
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    void params.then(({ token }) => fetch(`/api/split-bill-groups/invite/${token}`).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Invite unavailable");
      setGroup(payload.group);
    }).catch((error) => setMessage(error instanceof Error ? error.message : "Invite unavailable")));
  }, [params]);

  const joinGroup = async () => {
    setIsJoining(true);
    const { token } = await params;
    const response = await fetch(`/api/split-bill-groups/invite/${token}`, { method: "POST" });
    if (response.ok) window.location.href = "/split-bill";
    else setMessage("Unable to join this group.");
    setIsJoining(false);
  };

  return <main className="split-bill-public-request"><section className="panel glass split-bill-public-request__card">
    <p className="eyebrow">Split Bills group</p>
    {group ? <><h1>{group.name}</h1><p>{group.members.length} member{group.members.length === 1 ? "" : "s"}: {group.members.map((member) => member.name).join(", ")}</p><button className="button button-primary" type="button" onClick={() => void joinGroup()} disabled={isJoining}>{isJoining ? "Joining..." : "Join group"}</button></> : <p>{message}</p>}
  </section></main>;
}
