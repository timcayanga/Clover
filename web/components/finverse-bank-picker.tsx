"use client";

import { useEffect, useMemo, useState } from "react";
import { loadFinverseBankLogos } from "../../shared/finverse-bank-logos";
import { finverseCountries } from "../../shared/finverse-countries";
import {
  FINVERSE_BETA_NOTICE,
  finverseOptionLabel,
  groupFinverseBanks,
  type FinverseBankOption,
} from "../../shared/finverse-bank-options";

const fallbackLogo = "/assets/account-types/bank.png";

export function FinverseBankPicker({
  banks,
  busy,
  onConnect,
}: {
  banks: FinverseBankOption[];
  busy: boolean;
  onConnect: (id: string) => void;
}) {
  const [country, setCountry] = useState<string | null>(null);
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [betaId, setBetaId] = useState<string | null>(null);
  const countries = finverseCountries(banks);
  const groups = useMemo(() => country ? groupFinverseBanks(banks, country) : [], [banks, country]);
  const [logoBatch, setLogoBatch] = useState<{ groups: typeof groups; loaded: ReadonlyMap<string, string> }>();
  useEffect(() => {
    if (!groups.length) return;
    let current = true;
    void loadFinverseBankLogos([...groups.map(group => group.logoUrl), fallbackLogo], async (url) => {
      const image = new window.Image();
      image.src = url;
      await image.decode();
      return url;
    }).then(loaded => { if (current) setLogoBatch({ groups, loaded }); });
    return () => { current = false; };
  }, [groups]);
  const group = groups.find((g) => g.key === groupKey);
  const beta = group?.options.find(
    (o) => o.id === betaId && o.status === "BETA",
  );
  const choose = (option: FinverseBankOption) => {
    if (option.status === "BETA") setBetaId(option.id);
    else onConnect(option.id);
  };
  const logo = (src: string) => (
    <img
      className="finverse-bank-logo"
      src={logoBatch?.loaded.get(src) ?? fallbackLogo}
      alt=""
      width={48}
      height={48}
    />
  );
  return (
    <div className="finverse-bank-picker">
      {country ? (
        <div className="finverse-country-strip" aria-label="Countries">
          {countries.map((c) => (
            <button
              key={c.code}
              type="button"
              disabled={busy}
              aria-pressed={country === c.code}
              onClick={() => {
                setCountry(c.code);
                setGroupKey(null);
                setBetaId(null);
              }}
            >
              <span aria-hidden="true">
                {c.flagSrc ? <img src={c.flagSrc} alt="" /> : c.flag}
              </span>
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      ) : null}
      {group ? (
        <button
          type="button"
          className="button button-secondary"
          disabled={busy}
          onClick={() => {
            setGroupKey(null);
            setBetaId(null);
          }}
        >
          ‹ Banks
        </button>
      ) : null}
      {!country ? (
        <div className="finverse-connect__grid" aria-label="Countries">
          {countries.map((c) => (
            <button
              key={c.code}
              disabled={busy}
              className="finverse-connect__tile"
              type="button"
              onClick={() => setCountry(c.code)}
            >
              <span className="finverse-connect__flag" aria-hidden="true">
                {c.flagSrc ? <img src={c.flagSrc} alt="" /> : c.flag}
              </span>
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      ) : group ? (
        <section
          className="finverse-bank-picker__options"
          aria-label={`${group.name} bank access`}
        >
          <div className="finverse-bank-picker__heading">
            {logo(group.logoUrl)}
            <h4>{group.name}</h4>
          </div>
          {group.options.length > 1 ? (
            <>
              <p>Choose your bank access</p>
              {group.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="finverse-bank-picker__option"
                  disabled={busy}
                  data-selected={option.id === betaId}
                  onClick={() => choose(option)}
                >
                  <span>{finverseOptionLabel(option, group.options)}</span>
                  <span aria-hidden="true">›</span>
                </button>
              ))}
            </>
          ) : null}
          {beta ? (
            <div className="finverse-bank-picker__notice" role="status">
              <strong>{finverseOptionLabel(beta, group.options)}</strong>
              <p>{FINVERSE_BETA_NOTICE}</p>
              <button
                type="button"
                className="button button-primary"
                disabled={busy}
                onClick={() => onConnect(beta.id)}
              >
                Continue to Finverse
              </button>
            </div>
          ) : null}
        </section>
      ) : groups.length && logoBatch?.groups !== groups ? (
        <p role="status">Loading banks…</p>
      ) : (
        <div className="finverse-connect__grid" aria-label="Banks">
          {groups.map((g) => (
            <button
              key={g.key}
              type="button"
              disabled={busy}
              className="finverse-connect__tile finverse-connect__tile--bank"
              onClick={() => {
                if (g.options.length === 1 && g.options[0].status !== "BETA")
                  onConnect(g.options[0].id);
                else {
                  setGroupKey(g.key);
                  setBetaId(g.options.length === 1 ? g.options[0].id : null);
                }
              }}
            >
              {logo(g.logoUrl)}
              <span>{g.name}</span>
              <span className="finverse-bank-access">{g.accessLabels.map(label => <small key={label}>{label}</small>)}</span>
            </button>
          ))}
          {!groups.length ? (
            <p>No banks are available here right now.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
