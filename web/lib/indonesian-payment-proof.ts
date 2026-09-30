import type { ParsedImportRow } from "@/lib/import-parser";
import { detectCurrencyEvidence, normalizeGlobalCurrencyCode } from "@/lib/financial-identity-detection";
import { normalizeIndonesianText, parseIndonesianDate } from "@/lib/indonesian-financial-text";
import { readIndonesianMoney } from "@/lib/indonesian-money";

const labels: Record<string, string> = {
  status: "status", "status transaksi": "status", "status pembayaran": "status",
  tanggal: "date", "tanggal transaksi": "date", "waktu transaksi": "date", "tanggal pembayaran": "date",
  "nama merchant": "merchant", "nama toko": "merchant", "pembayaran ke": "merchant",
  "nama dompet": "account", "sumber dana": "account", "akun sumber": "account",
  "mata uang": "currency", "kode mata uang": "currency", "jenis transaksi": "type",
  nominal: "principal", "nominal transaksi": "principal", "jumlah transaksi": "principal",
  "total pembayaran": "total", "total bayar": "total", "total dibayar": "total", "total pengembalian dana": "total",
  "biaya admin": "fee", "biaya administrasi": "fee", diskon: "discount", potongan: "discount",
  "id transaksi": "reference", "nomor transaksi": "reference", "no transaksi": "reference", "nomor referensi": "reference",
  "saldo akhir": "balance", "saldo tersisa": "balance", "metode pembayaran": "method",
};
const moneyKeys = new Set(["principal", "total", "fee", "discount", "balance"]);
const proofHeading = /^(?:bukti pembayaran|bukti transaksi|detail transaksi|rincian transaksi|bukti pengembalian dana)$/i;
export const looksLikeIndonesianPaymentProof = (text: string) => text.split(/\r?\n/).some(line => proofHeading.test(line.trim())) &&
  /(?:status(?: transaksi| pembayaran)?|pembayaran berhasil|refund berhasil|pengembalian dana berhasil)/i.test(text);

/** One explicitly labeled completed payment/refund. [] means recognized but unsafe; null means another surface. */
export function parseIndonesianPaymentProof(source: string): ParsedImportRow[] | null {
  if (!looksLikeIndonesianPaymentProof(source)) return null;
  const originalLines = source.split(/\r?\n/), lines = originalLines.map(normalizeIndonesianText);
  if (lines.filter(line => proofHeading.test(line)).length !== 1) return [];
  const fields = new Map<string, string>();
  const evidence: Array<{ field: string; text: string; lineNumber: number }> = [];
  let invalid = false;
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index]!.match(/^([^:=]{2,35})\s*[:=]\s*(.*)$/);
    const standaloneKey = labels[lines[index]!.toLowerCase()];
    const key = match ? labels[match[1]!.trim().toLowerCase()] : standaloneKey;
    if (!key) {
      if (match && /(?:Rp\.?\s*\d|\bIDR\b)/i.test(match[2]!)) invalid = true;
      continue;
    }
    const value = match?.[2]?.trim() || lines[index + 1] || "";
    const normalize = (raw: string) => key === "currency" ? normalizeGlobalCurrencyCode(raw) ?? raw : moneyKeys.has(key) ? JSON.stringify(readIndonesianMoney(raw)) : raw;
    if (!value || (fields.has(key) && normalize(fields.get(key)!) !== normalize(value))) invalid = true;
    fields.set(key, value);
    evidence.push({field:key,text:originalLines[index]!,lineNumber:index+1});
    if (!match?.[2]?.trim()) {
      evidence.push({field:key,text:originalLines[index+1] ?? "",lineNumber:index+2});
      index++;
    }
  }
  const status = fields.get("status")?.toLowerCase() ?? "";
  // "Selesai" is only a history bucket in some wallets, not proof of payment success.
  const refund = /^(?:refund|pengembalian dana) (?:berhasil|selesai)$/.test(status);
  if (refund && fields.has("type") && !/^(?:refund|pengembalian dana)$/i.test(fields.get("type")!)) return [];
  const payment = /^(?:pembayaran berhasil|berhasil|sukses|lunas)$/.test(status) &&
    /^(?:pembayaran|pembelian)$/.test(fields.get("type")?.toLowerCase() ??
      (status === "pembayaran berhasil" || lines.some(line => /^bukti pembayaran$/i.test(line)) ? "pembayaran" : ""));
  const date = parseIndonesianDate(fields.get("date") ?? "");
  const merchant = fields.get("merchant"), reference = fields.get("reference");
  const money = (key: string) => fields.has(key) ? readIndonesianMoney(fields.get(key)!) : null;
  const total = money("total"), principal = money("principal"), fee = money("fee"), discount = money("discount");
  const currencyEvidence = detectCurrencyEvidence([...fields.entries()].filter(([key]) => moneyKeys.has(key) || key === "currency").map(([,value])=>value).join("\n"));
  const currencies = new Set([...moneyKeys].map(key => money(key)?.currency).filter(Boolean));
  const currency = normalizeGlobalCurrencyCode(fields.get("currency")) ?? currencyEvidence.currency ?? (currencies.size === 1 ? [...currencies][0] : null);
  const explicitCurrency = fields.get("currency");
  if (invalid || (!refund && !payment) || !date || !merchant || !/[\p{L}]/u.test(merchant) ||
    !reference || !/^[A-Za-z0-9._/-]{3,100}$/.test(reference) || !currency || currencyEvidence.ambiguous ||
    (explicitCurrency && !normalizeGlobalCurrencyCode(explicitCurrency)) || [...currencies].some(code => code !== currency) ||
    [...moneyKeys].some(key => fields.has(key) && (money(key)?.amount === null || money(key)!.amount! < 0)) ||
    !total || total.amount === null || total.amount <= 0 ||
    (principal && Math.abs(principal.amount! + (fee?.amount ?? 0) - (discount?.amount ?? 0) - total.amount) > 0.01) ||
    (refund && ((fee?.amount ?? 0) > 0 || (discount?.amount ?? 0) > 0))) return [];
  return [{
    date: date.toISOString().slice(0,10), amount: total.amount.toFixed(2), currency,
    type: refund ? "income" : "expense", merchantRaw: merchant, merchantClean: merchant, description: merchant,
    ...(fields.has("account") ? {accountName: fields.get("account")} : {}),
    confidence: 75, parserConfidence: 90, categoryConfidence: 0,
    rawPayload: {
      kind: "indonesian_payment_proof", source: "indonesian_payment_proof", documentLocale: "id",
      sourceText: source, fieldEvidence: evidence, reference, status, accountCurrency: currency,
      ...(fields.has("account") ? {accountName: fields.get("account")} : {}),
      principal: principal?.amount ?? null, fee: fee?.amount ?? null, discount: discount?.amount ?? null,
      reportedBalance: money("balance")?.amount ?? null, paymentMethod: fields.get("method") ?? null,
      parserEvidence: {source_text: source, reason:"One labeled completed payment or refund; paid total and components reconciled"},
      reviewRequired: true, reviewReasons:["Confirm the payment, account and category. Fees are already included in the paid total."],
    },
  }];
}
