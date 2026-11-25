import { splitReceiptPromotionalFooter } from "./receipt-promotional-footer";

const seller = /^(?:(?:merchant|seller|supplier|store|business)\s+name|merchant|seller|sold by|trade name|trading as|doing business as|d\.?\s*b\.?\s*a\.?)\s*[:：]\s*(.+)$/iu;
const tradingName = /^(?:trade name|trading as|doing business as|d\.?\s*b\.?\s*a\.?)\b/iu;
const narrativeRole = /^(?<role>owned (?:and operated )?by|operated by|(?:payments? )?(?:processed|powered|facilitated|acquired) by|printed by)\s+(?<name>.+)$/iu;
const role = /^(?<role>branch|store location|location|outlet|(?:pos|payment|card)\s+terminal\s+(?:operator|provider)|terminal\s+(?:operator|provider)|pos\s+(?:operator|provider|vendor|supplier|software)|payment\s+(?:processor|provider|gateway|acquirer)|acquiring\s+bank|bank\s+acquirer|franchisee|franchisor|registered\s+(?:owner|business\s+name)|owned\s+(?:and\s+operated\s+)?by|operated\s+by|(?:payments?\s+)?(?:processed|powered|facilitated|acquired)\s+by|printed\s+by|accredited\s+supplier(?:\s+of\s+(?:crm|pos)[\w /-]*)?)\s*(?::|：|\s+-\s+)\s*(?<name>.*)$/iu;
const roleWithoutValue = /^(?:branch|store location|outlet|terminal operator|terminal provider|pos provider|pos vendor|payment processor|payment provider|payment gateway|franchisee|franchisor|registered owner|owned and operated by|operated by|powered by|processed by|printed by)\s*[:：]?$/iu;
const issuer = /^(?:franchisee|registered (?:owner|business name)|owned (?:and operated )?by|operated by)$/iu;
const provider = /^(?:GCash|Maya|PayMongo|PayMaya|Visa|Mastercard|JCB|American Express|Stripe|PayPal|Adyen|Dragonpay|Xendit|GrabPay)(?:\s+(?:payment|payments|terminal|checkout))?$/iu;
const bodyStart = /^(?:qty\b|quantity\b|item(?:\s+description|\s+name)?\s*(?:$|\s+(?:qty|amount|price)\b)|(?:sub\s*-?\s*total|grand\s+total|amount\s+due|total(?:\s+amount|\s+paid)?)\b(?=\s*[:：]|\s+\d|$)|\d+(?:\.\d+)?\s+[\p{L}].+\d[.,]\d{2}\s*$)/iu;
const normalize = (text: string) => text.normalize("NFKC").trim().replace(/\s+/gu, " ");
const key = (text: string) => normalize(text).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

const plausibleName = (value: string) =>
  value.length >= 2 && value.length <= 120 && /\p{L}/u.test(value) &&
  !/^(?:unknown|n\/?a|official receipt|sales invoice|receipt|invoice|merchant copy|see above)$/iu.test(value) &&
  !/^(?:date|time|receipt (?:no|number)|invoice (?:no|number)|merchant (?:id|no)|terminal (?:id|no)|vat reg(?:istration)?)\b\s*[:：#]/iu.test(value) &&
  !/(?:[₱$€£]\s*\d|\d+[.,]\d{2}\s*$|\b(?:TIN|MID|TID)\s*:)/iu.test(value);

export function readReceiptMerchantEvidence(text: string) {
  const { body } = splitReceiptPromotionalFooter(text);
  const lines = body.split(/\r?\n/u).map(normalize).filter(Boolean);
  const boundary = lines.findIndex(line => bodyStart.test(line));
  const headerLength = Math.min(boundary === -1 ? lines.length : boundary, 24);
  const explicit = new Map<string, string>();
  const trade = new Map<string, string>();
  const issuers = new Map<string, string>();
  const nonSellers = new Set<string>();
  const ignored = new Set<number>();
  let hasRoles = false;

  for (const [index, line] of lines.entries()) {
    const labeledSeller = index < headerLength ? line.match(seller)?.[1] : undefined;
    if (labeledSeller && plausibleName(labeledSeller)) {
      (tradingName.test(line) ? trade : explicit).set(key(labeledSeller), labeledSeller);
      ignored.add(index);
      hasRoles = true;
      continue;
    }
    const match = line.match(role) ?? line.match(narrativeRole);
    if (!match?.groups && !roleWithoutValue.test(line)) continue;
    const label = match?.groups?.role ?? line.replace(/[:：]$/u, "");
    let name = match?.groups?.name?.trim() ?? "";
    ignored.add(index);
    hasRoles = true;
    if (!name && index + 1 < lines.length && plausibleName(lines[index + 1]) && !seller.test(lines[index + 1]) &&
        !role.test(lines[index + 1]) && !narrativeRole.test(lines[index + 1]) && !bodyStart.test(lines[index + 1])) {
      name = lines[index + 1];
      ignored.add(index + 1);
    }
    if (!plausibleName(name)) continue;
    if (issuer.test(label) && index < headerLength) issuers.set(key(name), name);
    nonSellers.add(key(name));
  }

  const header = lines.slice(0, headerLength).filter((line, index) =>
    plausibleName(line) && !ignored.has(index) && !nonSellers.has(key(line)) && !provider.test(line)
  );
  const candidates = trade.size ? trade : explicit;
  return {
    hasRoles,
    header,
    explicit: candidates.size === 1 ? [...candidates.values()][0] : null,
    ambiguous: candidates.size > 1,
    issuer: issuers.size === 1 ? [...issuers.values()][0] : null,
    isNonSeller: (value: string) => (nonSellers.has(key(value)) || provider.test(value)) && !candidates.has(key(value)),
  };
}

// Require the operator name and its printed registration in the header.
export function normalizedTollReceiptMerchant(name: string | null | undefined, source: string) {
  const tollName = /^[mh]anila [nh]orth toll[whvu]ays corp\.?$/iu;
  const header = source.split(/\r?\n/u).slice(0, 12);
  return tollName.test(name?.trim() ?? "") &&
    header.some(line => tollName.test(line.trim())) &&
    header.some(line => /^TIN\s*:\s*004-984-946-000\s*$/iu.test(line.trim()))
    ? "Manila North Tollways Corp." : null;
}

/** Resolve only disagreements for which the optical document identifies the role. */
export function reconcileReceiptMerchant<T extends {
  merchant_raw?: string | null;
  merchant_clean?: string | null;
}>(details: T, opticalText: string, localMerchant: string | null): T {
  const evidence = readReceiptMerchantEvidence(opticalText);
  const clean = normalizedTollReceiptMerchant(details.merchant_clean ?? details.merchant_raw, opticalText);
  if (!evidence.hasRoles && clean) return { ...details, merchant_clean: clean };
  if (!evidence.hasRoles) return details;
  const current = details.merchant_raw ?? details.merchant_clean;
  // A legal operator can identify the seller only when the receipt has no
  // competing brand. It must never beat the brand on the same receipt.
  const localMatchesHeader = localMerchant && (evidence.header.some(line => key(line) === key(localMerchant)) ||
    (evidence.issuer && key(evidence.issuer) === key(localMerchant)));
  let replacement = evidence.explicit ?? current;
  if (evidence.ambiguous) {
    replacement = null;
  } else if (!evidence.explicit && (!current || evidence.isNonSeller(current))) {
    replacement = localMatchesHeader ? localMerchant : null;
  }
  if (replacement === current) return details;
  return { ...details, merchant_raw: replacement, merchant_clean: replacement };
}
