export const PAYMENT_QR_PROVIDERS = [
  "GCash",
  "Maya",
  "QR Ph",
  "BPI",
  "BDO",
  "UnionBank",
  "Metrobank",
  "RCBC",
  "GoTyme",
  "GrabPay",
  "ShopeePay",
  "PayPal",
  "Other",
] as const;

export type PaymentQrProvider = (typeof PAYMENT_QR_PROVIDERS)[number];

export type PaymentQrDetection = {
  provider: PaymentQrProvider;
  confidence: "high" | "medium" | "low";
  reason: string;
};

const providerRules: Array<{
  provider: Exclude<PaymentQrProvider, "Other">;
  patterns: RegExp[];
}> = [
  { provider: "GCash", patterns: [/GCASH/i, /G-?XCHANGE/i, /GXCHPHM2/i, /MYNT/i] },
  { provider: "Maya", patterns: [/PAYMAYA/i, /\bMAYA\b/i, /PYMYPHM2/i, /MAYA\.PH/i] },
  { provider: "BPI", patterns: [/BANK OF THE PHILIPPINE ISLANDS/i, /BOPIPHMM/i, /\bBPI\b/i] },
  { provider: "BDO", patterns: [/BDO UNIBANK/i, /BNORPHMM/i, /\bBDO\b/i] },
  { provider: "UnionBank", patterns: [/UNIONBANK/i, /UNION BANK/i, /UBPHPHMM/i] },
  { provider: "Metrobank", patterns: [/METROPOLITAN BANK/i, /METROBANK/i, /MBTCPHMM/i] },
  { provider: "RCBC", patterns: [/RIZAL COMMERCIAL/i, /\bRCBC\b/i, /RCBCPHMM/i] },
  { provider: "GoTyme", patterns: [/GOTYME/i, /GO TYME/i] },
  { provider: "GrabPay", patterns: [/GRABPAY/i, /GRAB PAY/i] },
  { provider: "ShopeePay", patterns: [/SHOPEEPAY/i, /SHOPEE PAY/i] },
  { provider: "PayPal", patterns: [/PAYPAL/i, /PAYPAL\.ME/i] },
  { provider: "QR Ph", patterns: [/QRPH/i, /QR PH/i, /PH\.PPMI\.(?:P2M|P2P)/i] },
];

const filenameRules: Array<{ provider: PaymentQrProvider; pattern: RegExp }> = [
  { provider: "GCash", pattern: /g\s*cash/i },
  { provider: "Maya", pattern: /(?:pay\s*)?maya/i },
  { provider: "BPI", pattern: /\bbpi\b/i },
  { provider: "BDO", pattern: /\bbdo\b/i },
  { provider: "UnionBank", pattern: /union\s*bank|\bub\b/i },
  { provider: "Metrobank", pattern: /metro\s*bank/i },
  { provider: "RCBC", pattern: /\brcbc\b/i },
  { provider: "GoTyme", pattern: /go\s*tyme/i },
  { provider: "GrabPay", pattern: /grab\s*pay/i },
  { provider: "ShopeePay", pattern: /shopee\s*pay/i },
  { provider: "PayPal", pattern: /pay\s*pal/i },
];

export function detectPaymentQrProvider(payload: string | null | undefined, fileName = ""): PaymentQrDetection {
  const normalizedPayload = payload?.trim() ?? "";
  if (normalizedPayload) {
    for (const rule of providerRules) {
      if (rule.patterns.some((pattern) => pattern.test(normalizedPayload))) {
        return { provider: rule.provider, confidence: "high", reason: "Detected from the QR code" };
      }
    }

    if (/^000201/.test(normalizedPayload) || /6304[0-9A-F]{4}$/i.test(normalizedPayload)) {
      return { provider: "QR Ph", confidence: "medium", reason: "Detected as an interoperable payment QR" };
    }
  }

  const filenameMatch = filenameRules.find((rule) => rule.pattern.test(fileName));
  if (filenameMatch) {
    return { provider: filenameMatch.provider, confidence: "low", reason: "Suggested from the image name" };
  }

  return { provider: "Other", confidence: "low", reason: "Choose the payment app" };
}

export function getPaymentQrTheme(provider: string) {
  const normalized = provider.trim().toLowerCase();
  if (normalized.includes("gcash")) return { start: "#0879ee", end: "#055cc5", accent: "#d9ecff" };
  if (normalized.includes("maya")) return { start: "#171a1d", end: "#30373b", accent: "#b7ff31" };
  if (normalized.includes("bpi")) return { start: "#b6132c", end: "#ef5166", accent: "#ffe3e7" };
  if (normalized.includes("bdo")) return { start: "#0752a5", end: "#1679ca", accent: "#ffdc4d" };
  if (normalized.includes("union")) return { start: "#f56b20", end: "#ff9a42", accent: "#fff0df" };
  if (normalized.includes("metro")) return { start: "#174a91", end: "#3585c8", accent: "#dcebff" };
  if (normalized.includes("rcbc")) return { start: "#258fd0", end: "#54b9ed", accent: "#e2f6ff" };
  if (normalized.includes("gotyme")) return { start: "#242d81", end: "#5064d5", accent: "#ecf0ff" };
  if (normalized.includes("grab")) return { start: "#008e4f", end: "#16b86c", accent: "#dcffec" };
  if (normalized.includes("shopee")) return { start: "#e84b2b", end: "#ff7c46", accent: "#fff0e9" };
  if (normalized.includes("paypal")) return { start: "#173f8a", end: "#2878ca", accent: "#ddebff" };
  return { start: "#009fb6", end: "#55d0c8", accent: "#e4fffb" };
}
