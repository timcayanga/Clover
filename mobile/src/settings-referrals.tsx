import { apiBase } from "./api-base";
import { useEffect, useState } from "react";
import { Share } from "react-native";
import { useSession } from "./session";
import { Body, Button, Card, Heading, Notice, dateLabel } from "./ui";

type Referrals = {
  verified: boolean;
  campaigns: { id: string; name: string; terms: string; codes: { code: string }[] }[];
  rewards: { id: string; months: number; status: string; availableAt: string; expiresAt: string | null }[];
  access: { renewing: boolean; user: { planTierLocked: boolean } };
};
export function SettingsReferrals() {
  const session = useSession();
  const [data, setData] = useState<Referrals | null>(null);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (session.demo) return;
    void session.request<Referrals>("referrals").then(value => { if (active) setData(value); })
      .catch(() => { if (active) setError("Unable to load referrals. Please try again."); });
    return () => { active = false; };
  }, [session.demo, session.request, revision]);
  const act = async (action: "code" | "claim", id: string) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await session.request("referrals", { method: "POST", body: JSON.stringify({ action, id, ...(action === "code" ? { acceptTerms: accepted[id] === true } : {}) }) });
      setRevision(v => v + 1);
      session.refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  if (session.demo) return null;
  return <Card>
    <Heading>Refer and earn</Heading>
    {error ? <><Notice>{error}</Notice><Button title="Retry referrals" secondary onPress={() => { setError(""); setRevision(v => v + 1); }} /></> : null}
    {!data && !error ? <Body>Loading referrals…</Body> : null}
    {data && !data.verified ? <Body>Verify your email before participating.</Body> : null}
    {data && !data.campaigns.length ? <Body>No referral campaigns are available right now.</Body> : null}
    {data?.campaigns.map(campaign => <Card key={campaign.id}>
      <Heading>{campaign.name}</Heading>
      <Body>{campaign.terms}</Body>
      {campaign.codes.length ? campaign.codes.map(({ code }) => <Button key={code} title={`Share referral code ${code}`} secondary onPress={() => void Share.share({ message: `${apiBase()}/referrals?ref=${encodeURIComponent(code)}` }).catch(() => setError("Unable to share this referral code."))} />) : <>
        <Button title={accepted[campaign.id] ? "✓ Campaign terms accepted" : "Accept campaign terms"} secondary disabled={busy} onPress={() => setAccepted(v => ({ ...v, [campaign.id]: !v[campaign.id] }))} />
        <Button title="Get referral code" disabled={busy || !data.verified || !accepted[campaign.id]} onPress={() => void act("code", campaign.id)} />
      </>}
    </Card>)}
    {data?.rewards.map(reward => {
      const ready = reward.status === "pending" && new Date(reward.availableAt).getTime() <= Date.now() && (!reward.expiresAt || new Date(reward.expiresAt).getTime() > Date.now());
      return <Card key={reward.id}>
        <Body>{reward.months} month{reward.months === 1 ? "" : "s"} · {reward.status}</Body>
        <Body>Available {dateLabel(reward.availableAt)}{reward.expiresAt ? ` · Expires ${dateLabel(reward.expiresAt)}` : ""}</Body>
        {ready ? <Button title="Activate reward" disabled={busy || data.access.renewing || data.access.user.planTierLocked} onPress={() => void act("claim", reward.id)} /> : null}
        {ready && data.access.renewing ? <Body>Manage your current subscription before activating a reward.</Body> : null}
      </Card>;
    })}
  </Card>;
}
