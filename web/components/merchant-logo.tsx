"use client";

import { useState, type ReactNode } from "react";
import { asIdentityRecord, merchantIdentityInputKey } from "@/lib/merchant-identity-context";
import type { MerchantIdentityInput, MerchantIdentityResult } from "@/lib/logo-identity-types";

function readSuggestion(transaction: MerchantIdentityInput): MerchantIdentityResult | null {
  const result = asIdentityRecord(asIdentityRecord(transaction.normalizedPayload).merchantIdentity);
  if (result.inputKey !== merchantIdentityInputKey(transaction)) return null;
  if (!["suggested", "needs_review", "unmatched"].includes(String(result.status))) return null;
  if (!Array.isArray(result.candidates) || typeof result.confidence !== "number" || typeof result.reason !== "string") return null;
  if (!result.candidates.every(c => typeof c?.name === "string" && typeof c?.entryId === "string" && typeof c?.industry === "string" && Array.isArray(c?.conflicts) && Array.isArray(c?.countryCodes) && Array.isArray(c?.evidence)
    && (!c.matchedEntities || Array.isArray(c.matchedEntities) && c.matchedEntities.every((e: unknown) => {
      const entity = asIdentityRecord(e);
      return typeof entity.entityId === "string" && typeof entity.role === "string" && typeof entity.sourceUrl === "string" && Array.isArray(entity.names) && entity.names.every(n => typeof n === "string") && Array.isArray(entity.countryCodes) && entity.countryCodes.every(n => typeof n === "string") && (entity.registeredCountryCode == null || typeof entity.registeredCountryCode === "string");
    })))) return null;
  if (!Array.isArray(result.observations) || !result.observations.every(o => typeof o?.field === "string" && typeof o?.value === "string" && typeof o?.confidence === "number")) return null;
  if (result.logoPath != null && typeof result.logoPath !== "string") return null;
  if (result.reviewHints && (!Array.isArray(result.reviewHints) || !result.reviewHints.every(h => typeof h?.field === "string" && typeof h?.message === "string"))) return null;
  if (!result.candidates.every(c => (!c.missingContext || Array.isArray(c.missingContext) && c.missingContext.every((f:unknown) => typeof f === "string")) && (!c.sources || Array.isArray(c.sources) && c.sources.every((s:unknown) => {
    const source = asIdentityRecord(s);
    return typeof source.kind === "string" && typeof source.label === "string" && typeof source.url === "string" && Array.isArray(source.countryCodes) && source.countryCodes.every(c=>typeof c === "string") && (source.validFrom == null || typeof source.validFrom === "string") && (source.validTo == null || typeof source.validTo === "string");
  })))) return null;
  return result as MerchantIdentityResult;
}

export function MerchantLogo({ transaction, size = 24, fallback = null }: { transaction: MerchantIdentityInput; size?: number; fallback?: ReactNode }) {
  const result = readSuggestion(transaction);
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const candidate = result?.candidates.find(c => c.entryId === result.entryId);
  const src = result?.status === "suggested" && Number.isFinite(result.confidence) && result.confidence >= 84
    && candidate && candidate.confidence >= 84 && !candidate.conflicts.length
    ? result.logoPath : null;
  if (!src || src === failedPath || !src.startsWith("/assets/") || src.includes("..")) return fallback;
  const name = result?.candidates?.find(c => c.entryId === result.entryId)?.name ?? "Merchant";
  return <img src={src} alt="" title={`${name} · logo suggestion (${result?.confidence}%)`}
    loading="lazy" width={size} height={size} onError={() => setFailedPath(src)}
    style={{ width: size, height: size, objectFit: "contain", borderRadius: 6, flexShrink: 0 }} />;
}

export function MerchantIdentityDetails({ transaction }: { transaction: MerchantIdentityInput }) {
  const result = readSuggestion(transaction);
  if (!result || result.status === "unmatched" && !result.reviewHints?.length) return null;
  return <details style={{ marginTop: 8, fontSize: 12 }}>
    <summary>{result.status !== "suggested" ? "Merchant identity needs review" : "Suggested merchant identity"}</summary>
    <p>{result.reason.replaceAll("_", " ")} · {result.confidence}% confidence</p>
    {result.reviewHints?.length ? <ul>{result.reviewHints.map(h => <li key={h.field}>{h.message}</li>)}</ul> : null}
    <ul>{result.candidates.map(c => <li key={c.entryId}>{c.name} · {[c.locality, c.countryCodes.join(", "), c.industry.replaceAll("-", " ")].filter(Boolean).join(" · ")} · {c.confidence}%
      {c.conflicts.length ? ` · ${c.conflicts.join(", ").replaceAll("_", " ")}` : ""}
      {c.matchedEntities?.map(entity => <div key={entity.entityId}>
        {entity.role === "parent_owner" ? "Parent company" : entity.role === "franchisee" ? "Franchise operator" : entity.role === "developer" ? "App developer" : entity.role === "payment_processor" ? "Payment processor" : entity.role === "shared_operator" ? "Shared company" : entity.role === "website_operator" ? "Website operator" : entity.role === "privacy_controller" ? "Privacy controller" : entity.role === "manufacturer" ? "Manufacturer" : "Operating company"}: {entity.names[0]}
        {entity.countryCodes.length ? ` (${entity.countryCodes.join(", ")})` : ""}
        {entity.registeredCountryCode ? ` · incorporated in ${entity.registeredCountryCode}` : ""}
        {entity.sourceUrl.startsWith("https://") ? <> · <a href={entity.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a></> : null}
      </div>)}
      {c.sources?.map((source,index) => source.url.startsWith("https://") ? <div key={`${source.kind}-${index}`}>
        <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label.replaceAll("_"," ")}</a>
        {source.countryCodes.length ? ` · ${source.countryCodes.join(", ")}` : ""}
        {source.validFrom || source.validTo ? ` · recorded dates: ${source.validFrom ?? "unspecified"} to ${source.validTo ?? "unspecified"}` : ""}
      </div> : null)}
    </li>)}</ul>
    <p>{result.observations.filter(o => o.field !== "settlementCurrency").map(o => `${o.field.replace(/([A-Z])/g, " $1").toLowerCase()}: ${o.value} (${o.confidence}%)`).join(" · ")}</p>
    <p>Logo suggestions do not change your merchant name or category.</p>
  </details>;
}
