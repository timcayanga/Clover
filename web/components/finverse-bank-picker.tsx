"use client";

import { useState } from "react";
import { finverseCountries } from "../../shared/finverse-countries";
import { FINVERSE_BETA_NOTICE, finverseOptionLabel, groupFinverseBanks, type FinverseBankOption } from "../../shared/finverse-bank-options";

export function FinverseBankPicker({ banks, busy, onConnect }: { banks: FinverseBankOption[]; busy: boolean; onConnect: (id: string) => void }) {
  const [country, setCountry] = useState<string | null>(null);
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [betaId, setBetaId] = useState<string | null>(null);
  const countries = finverseCountries(banks);
  const groups = country ? groupFinverseBanks(banks, country) : [];
  const group = groups.find(g => g.key === groupKey);
  const beta = group?.options.find(o => o.id === betaId && o.status === "BETA");
  const choose = (option: FinverseBankOption) => { if (option.status === "BETA") setBetaId(option.id); else onConnect(option.id); };
  const logo = (src: string) => <img className="finverse-bank-logo" src={src} alt="" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = "/assets/account-types/bank.png"; }} />;
  return <div className="finverse-bank-picker">
    {country ? <button type="button" disabled={busy} className="button button-secondary" onClick={() => { if (group) { setGroupKey(null); setBetaId(null); } else setCountry(null); }}>‹ {group ? "Banks" : "Countries"} · {countries.find(c => c.code === country)?.name}</button> : null}
    {!country ? <div className="finverse-connect__grid" aria-label="Countries">{countries.map(c => <button key={c.code} disabled={busy} className="finverse-connect__tile" type="button" onClick={() => setCountry(c.code)}><span className="finverse-connect__flag" aria-hidden="true">{c.flagSrc ? <img src={c.flagSrc} alt="" /> : c.flag}</span><span>{c.name}</span></button>)}</div>
      : group ? <section className="finverse-bank-picker__options" aria-label={`${group.name} bank access`}>
        <div className="finverse-bank-picker__heading">{logo(group.logoUrl)}<h4>{group.name}</h4></div>
        {group.options.length > 1 ? <><p>Choose your bank access</p>{group.options.map(option => <button key={option.id} type="button" className="finverse-bank-picker__option" disabled={busy} data-selected={option.id === betaId} onClick={() => choose(option)}><span>{finverseOptionLabel(option, group.options)}</span>{option.status === "BETA" ? <span className="finverse-bank-picker__beta">Beta</span> : null}<span aria-hidden="true">›</span></button>)}</> : null}
        {beta ? <div className="finverse-bank-picker__notice" role="status"><strong>{finverseOptionLabel(beta, group.options)} · Beta</strong><p>{FINVERSE_BETA_NOTICE}</p><button type="button" className="button button-primary" disabled={busy} onClick={() => onConnect(beta.id)}>Continue to Finverse</button></div> : null}
      </section> : <div className="finverse-connect__grid" aria-label="Banks">{groups.map(g => <button key={g.key} type="button" disabled={busy} className="finverse-connect__tile" onClick={() => { if (g.options.length === 1 && g.options[0].status !== "BETA") onConnect(g.options[0].id); else { setGroupKey(g.key); setBetaId(g.options.length === 1 ? g.options[0].id : null); } }}>{logo(g.logoUrl)}<span>{g.name}</span><small>{g.accessLabel}</small>{g.betaOnly ? <span className="finverse-bank-picker__beta">Beta</span> : null}</button>)}{!groups.length ? <p>No banks are available here right now.</p> : null}</div>}
  </div>;
}
