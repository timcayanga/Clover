import type { ReceiptPreviewItem, ReceiptPreviewResult } from "@/lib/split-bill";
import { detectCurrencyEvidence } from "@/lib/financial-identity-detection";
import { hasIndonesianFinancialText, normalizeIndonesianText, parseIndonesianAmount, parseIndonesianDate } from "@/lib/indonesian-financial-text";
import { looksLikeIndonesianPaymentProof } from "@/lib/indonesian-payment-proof";

const money = "[+-]?(?:(?:Rp\\.?|IDR)\\s*)?(?:\\d[\\d.,]*)(?:,-)?";
const summary = /^(?:sub\s*total|grand total|total(?: bayar| pembayaran| belanja)?|jumlah bayar|ppn|pajak|diskon|potongan|biaya layanan|service charge|tunai|kembali(?:an)?|pembulatan|metode pembayaran|no\.? struk|tanggal|terima kasih)\b/i;
type Column = "description" | "quantity" | "unitPrice" | "amount";
function columns(line: string): Column[] | null {
  // OCR may join printed header words; only known column labels are repaired.
  line = line.replace(/\bnama(?=barang|produk)|\bharga(?=satuan)/gi, "$& ");
  const labels = [...line.toLowerCase().matchAll(/nama barang|nama produk|harga satuan|barang|produk|kuantitas|qty|jumlah|harga|subtotal|total/g)].map(match => match[0]);
  if (!labels.length || line.toLowerCase().replace(/nama barang|nama produk|harga satuan|barang|produk|kuantitas|qty|jumlah|harga|subtotal|total/g, "").replace(/[\s|():/.-]|\brp\b/g, "")) return null;
  const result = labels.map(label => /barang|produk/.test(label) ? "description" : /qty|kuantitas/.test(label) ? "quantity" :
    /harga/.test(label) ? "unitPrice" : label === "jumlah" && labels.some(label => /^(?:total|subtotal)$/.test(label)) ? "quantity" : "amount") as Column[];
  return result[0] === "description" && result.includes("amount") && new Set(result).size === result.length &&
    (!result.includes("unitPrice") || result.includes("quantity")) ? result : null;
}

export function parseIndonesianReceiptText(source: string): ReceiptPreviewResult | null {
  const paymentProof = looksLikeIndonesianPaymentProof(source);
  if (!paymentProof && (!hasIndonesianFinancialText(source) || !/\b(?:struk|kuitansi|kwitansi|nota pembelian|nama toko|tunai|kembali(?:an)?|total bayar)\b/i.test(source))) return null;
  const lines = normalizeIndonesianText(source).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const labeled = (pattern: RegExp) => lines.flatMap((line, index) => {
    const match = line.match(pattern);
    return match ? [line.slice(match[0].length).trim() || lines[index + 1] || ""] : [];
  });
  const value = (pattern: RegExp) => {
    const raw = labeled(pattern), values = raw.map(text => parseIndonesianAmount(text));
    const unique = [...new Set(values)];
    return { value: unique.length === 1 ? unique[0]! : null, conflict: unique.length > 1 || (raw.length > 0 && values.includes(null)) };
  };
  const totalEvidence = value(/^(?:grand total|total(?: bayar| pembayaran| belanja)?|jumlah bayar)\s*(?:[:=]\s*|\s+|$)/i);
  const subtotalEvidence = value(/^sub\s*total\s*(?:[:=]\s*|\s+|$)/i);
  const taxEvidence = value(/^(?:ppn|pajak)(?:\s*\d+(?:,\d+)?\s*%)?\s*(?:[:=]\s*|\s+|$)/i);
  const serviceEvidence = value(/^(?:biaya layanan|service charge)(?:\s*\d+(?:,\d+)?\s*%)?\s*(?:[:=]\s*|\s+|$)/i);
  const discountEvidence = value(/^(?:diskon|potongan)(?:\s*\d+(?:,\d+)?\s*%)?\s*(?:[:=]\s*|\s+|$)/i);
  const roundingEvidence = value(/^pembulatan\s*(?:[:=]\s*|\s+|$)/i);
  const cashEvidence = value(/^(?:tunai|uang diterima)\s*(?:[:=]\s*|\s+|$)/i);
  const changeEvidence = value(/^kembali(?:an)?\s*(?:[:=]\s*|\s+|$)/i);
  const total = totalEvidence.value;
  const currencyEvidence = detectCurrencyEvidence(source);
  const currency = currencyEvidence.ambiguous ? "MIXED" : currencyEvidence.currency ?? "MIXED";
  const currencyWarning = currency === "MIXED" ? "Confirm the receipt currency from the original document." : null;
  const dates = labeled(/^(?:(?:tanggal|tgl)(?: transaksi| pembelian| pembayaran)?|waktu transaksi)\s*(?:[:=]\s*|\s+(?=\d|senin|selasa|rabu|kamis|jumat|sabtu|minggu)|$)/i)
    .map(text => parseIndonesianDate(text)?.toISOString().slice(0, 10) ?? null);
  const uniqueDates = [...new Set(dates)];
  const billDate = uniqueDates.length === 1 ? uniqueDates[0]! : null;
  const merchants = [...new Set(labeled(/^(?:nama toko|nama merchant|nama pedagang|toko)\s*(?:[:=]\s*|\s+|$)/i))];
  const merchantName = merchants.length === 1 && /[A-Za-z]/.test(merchants[0]!) && !summary.test(merchants[0]!) ? merchants[0]! : null;
  const ids = [...new Set(labeled(/^(?:no\.?|nomor)\s*(?:struk|nota|kuitansi|kwitansi)\s*(?:[:=]\s*|\s+|$)/i))];
  const documentNumber = ids.length === 1 && /^[A-Za-z0-9/-]{1,80}$/.test(ids[0]!) ? ids[0]! : null;
  const cancelled = /^\s*(?:status(?: transaksi| pembayaran)?\s*[:=]?\s*)?(?:batal|dibatalkan|gagal|tertunda|menunggu|belum dibayar|(?:struk|nota) (?:retur|pembatalan)|pengembalian dana|refund)(?:\s|$)/im.test(source);
  const items: ReceiptPreviewItem[] = [];
  const start = lines.findIndex(line => columns(line));
  let complete = start >= 0, pendingName = "";
  if (start >= 0) {
    const header = columns(lines[start]!)!;
    const numbers = header.slice(1).map(column => column === "quantity" ? "(\\d+(?:,\\d+)?)" : `(${money})`).join("\\s+");
    const row = new RegExp(`^(.+?)\\s+${numbers}$`), wrapped = new RegExp(`^${numbers}$`);
    for (const line of lines.slice(start + 1)) {
      if (summary.test(line)) break;
      if (/^[-=_*\s]+$/.test(line) || columns(line)) continue;
      const direct = line.match(row), continuation = !direct && pendingName ? line.match(wrapped) : null;
      if (!direct && !continuation) {
        if (/[A-Za-z]/.test(line) && !/\s\d[\d,.]*$/.test(line) && pendingName.length + line.length < 160) pendingName = `${pendingName} ${line}`.trim();
        else { complete = false; pendingName = ""; }
        continue;
      }
      const name = direct ? `${pendingName} ${direct[1]}`.trim() : pendingName;
      const cells = direct ? direct.slice(2) : continuation!.slice(1);
      const parsed = Object.fromEntries(header.slice(1).map((column, i) => [column, parseIndonesianAmount(cells[i]!, column === "quantity")]));
      pendingName = "";
      const amount = parsed.amount, quantity = parsed.quantity ?? null, unitPrice = parsed.unitPrice ?? null;
      if (!/[A-Za-z]/.test(name) || amount === null || amount <= 0 ||
        (header.includes("quantity") && (quantity === null || quantity <= 0)) ||
        (header.includes("unitPrice") && (unitPrice === null || quantity === null || Math.abs(unitPrice * quantity - amount) > 0.01))) { complete = false; continue; }
      items.push({description: name, quantity, unitPrice: unitPrice?.toFixed(2) ?? null, amount: amount.toFixed(2)});
    }
  }
  complete = complete && !pendingName && items.length > 0;
  const itemSum = items.reduce((sum, item) => sum + Number(item.amount), 0);
  const tax = taxEvidence.value ?? 0, service = serviceEvidence.value ?? 0, discount = discountEvidence.value ?? 0, rounding = roundingEvidence.value ?? 0;
  const base = subtotalEvidence.value ?? itemSum;
  const includedTax = /\b(?:termasuk|sudah termasuk|include)\s*(?:ppn|pajak)\b/i.test(source);
  const additions = (includedTax ? 0 : tax) + service + rounding - discount;
  const reconciles = complete && total !== null && total > 0 && Math.abs(itemSum - base) <= 0.01 && Math.abs(base + additions - total) <= 0.01;
  const cashReconciles = cashEvidence.value === null || changeEvidence.value === null ||
    (total !== null && cashEvidence.value >= total && Math.abs(cashEvidence.value - total - changeEvidence.value) <= 0.01);
  const conflict = [totalEvidence, subtotalEvidence, taxEvidence, serviceEvidence, discountEvidence, roundingEvidence, cashEvidence, changeEvidence].some(evidence => evidence.conflict) ||
    [tax, service, discount, cashEvidence.value, changeEvidence.value].some(value => value !== null && value < 0);
  const requiresReview = paymentProof || cancelled || conflict || !reconciles || !cashReconciles || currencyWarning !== null || !merchantName || !billDate || ids.length > 1;
  return {
    receiptText: source, receiptType: "generic_receipt", merchantName, billDate, documentNumber, invoiceNumber: null, bookingReference: null,
    currency, currencyMentions: currency === "MIXED" ? [] : [currency], currencyWarning,
    paymentMethod: /\bQRIS\b/i.test(source) ? "QRIS" : /\btunai\b/i.test(source) ? "Cash" : /\bkartu\b/i.test(source) ? "Card" : null,
    receiptPayerName: null,
    // Included tax is already in the printed item prices; never add it twice.
    subtotal: includedTax ? null : subtotalEvidence.value?.toFixed(2) ?? null,
    tax: taxEvidence.value?.toFixed(2) ?? null, serviceCharge: serviceEvidence.value?.toFixed(2) ?? null,
    discount: discountEvidence.value?.toFixed(2) ?? null, rounding: roundingEvidence.value?.toFixed(2) ?? null, tip: null,
    // Payment proofs use their own direction-aware parser, never an itemized purchase shortcut.
    total: !paymentProof && !cancelled && total !== null && total > 0 ? total.toFixed(2) : null,
    items, participants: [], splitAllocations: [], receiptAccountMatch: null,
    confidence: requiresReview ? 45 : 92, requiresReview,
  };
}
