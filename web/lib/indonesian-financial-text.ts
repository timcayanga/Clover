/** Normalize working copies only; the original file and source cells stay in provenance. */
export const normalizeIndonesianText = (value: string) => value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\u2212/g, "-").trim();
const key = (value: string) => normalizeIndonesianText(value).toLowerCase()
  .replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/[._:/-]/g, " ").replace(/\s+/g, " ").trim();

const headers: Record<string, string> = {
  tanggal: "date", tgl: "date", "tanggal transaksi": "date", "tgl transaksi": "date", "tanggal waktu": "date", "waktu transaksi": "date",
  "tanggal pembukuan": "posted_date", "tanggal posting": "posted_date", "tanggal efektif": "posted_date",
  keterangan: "description", uraian: "description", deskripsi: "description", "rincian transaksi": "description", "berita transaksi": "description", catatan: "description",
  "nama merchant": "merchant", "nama toko": "merchant", "nama pedagang": "merchant",
  nominal: "amount", "nominal transaksi": "amount", "jumlah transaksi": "amount", "nilai transaksi": "amount", "jumlah pembayaran": "amount", "nilai tagihan": "amount", mutasi: "amount",
  debet: "debit", debit: "debit", penarikan: "debit", pengeluaran: "debit", "uang keluar": "debit", "mutasi debet": "debit", "mutasi debit": "debit",
  kredit: "credit", setoran: "credit", pemasukan: "credit", "uang masuk": "credit", "mutasi kredit": "credit",
  saldo: "balance", "saldo akhir": "balance", "saldo berjalan": "balance", "saldo rekening": "balance",
  "mata uang": "currency", "kode mata uang": "currency", "mata uang tagihan": "currency", "mata uang pembayaran": "currency",
  "jenis transaksi": "type", "tipe transaksi": "type", "debet kredit": "type", "debit kredit": "type", "db cr": "type", "d k": "type",
  "status transaksi": "status", "status pembayaran": "status", kategori: "category", "biaya admin": "fee", "biaya administrasi": "fee", "biaya transaksi": "fee",
  "nama rekening": "account_name", rekening: "account_name", "nama akun": "account_name", "nama dompet": "account_name",
  "nomor rekening": "account_number", "no rekening": "account_number", "no rek": "account_number", "nomor kartu": "account_number", "no kartu": "account_number",
  "nama bank": "institution", "jenis rekening": "account_type", "jenis akun": "account_type",
  "nomor referensi": "reference", "no referensi": "reference", referensi: "reference", "id transaksi": "reference", "nomor transaksi": "reference", "no transaksi": "reference", "no struk": "reference",
  "tanggal saldo": "snapshot_date", "tanggal laporan": "snapshot_date", "per tanggal": "snapshot_date",
  "nominal asli": "original_amount", "jumlah valuta asing": "original_amount", "mata uang asli": "original_currency", "mata uang asal": "original_currency",
};
const investmentHeaders: Record<string, string> = {
  "nama investasi": "asset", "nama produk": "asset", "nama reksa dana": "asset", "nama reksadana": "asset", "nama saham": "asset",
  sekuritas: "provider", "manajer investasi": "provider", "nama penyedia": "provider", platform: "provider",
  "nilai pasar": "market_value", "nilai investasi": "market_value", "nilai portofolio": "market_value",
  "tanggal valuasi": "valuation_date", "tanggal penilaian": "valuation_date", "tanggal nab": "valuation_date", "per tanggal": "valuation_date",
  "jumlah unit": "quantity", "unit penyertaan": "quantity", "jumlah saham": "quantity", "lembar saham": "quantity",
  "kode saham": "symbol", "kode produk": "symbol", "setoran bulanan": "monthly_contribution",
};
export const indonesianFinancialHeader = (value: string): string | null => headers[key(value)] ?? null;
export const indonesianInvestmentHeader = (value: string): string | null => investmentHeaders[key(value)] ?? null;
export const hasIndonesianFinancialHeaders = (values: string[]) => {
  const fields = values.map(value => indonesianFinancialHeader(value) ?? indonesianInvestmentHeader(value));
  // English debit/status/total by themselves must never switch another locale.
  return fields.filter(Boolean).length >= 2 && values.some(value => /\b(?:tanggal|tgl|keterangan|uraian|saldo|rekening|rupiah|nominal|mata uang|investasi|penyertaan|saham|reksa ?dana)\b/i.test(value));
};
export const hasRupiahMarker = (value: string) => /(?:\bRp\.?\s*(?=[+-]?\s*\d)|\bIDR\b|\brupiah\b)/i.test(value);
export const hasIndonesianFinancialText = (value: string) => {
  const labels = value.match(/\b(?:tanggal|tgl|keterangan|saldo|rekening|debet|kredit|struk|kwitansi|kuitansi|tunai|kembali(?:an)?|pembayaran|pembelian|jumlah|harga|ppn|diskon|sekuritas|investasi)\b/gi) ?? [];
  return new Set(labels.map(label => label.toLowerCase())).size >= 2 || (hasRupiahMarker(value) && labels.length > 0);
};

/** Local dots group thousands and commas mark decimals. Never strip arbitrary letters or concatenate numbers. */
export function parseIndonesianAmount(value: string, quantity = false): number | null {
  let text = normalizeIndonesianText(value);
  const parenthesized = /^\(.*\)$/.test(text);
  if (parenthesized) text = text.slice(1, -1).trim();
  const firstSign = text.match(/^[+-]/)?.[0];
  if (firstSign) text = text.slice(1).trim();
  text = text.replace(/^(?:Rp\.?|IDR|rupiah)\s*/i, "");
  const secondSign = text.match(/^[+-]/)?.[0];
  if (secondSign) text = text.slice(1).trim();
  if ((firstSign && secondSign) || (parenthesized && (firstSign || secondSign))) return null;
  text = text.replace(/\s*(?:IDR|rupiah)$/i, "").trim();
  const direction = text.match(/\s+(DB|DR|CR|D|K)$/i)?.[1];
  if (direction) text = text.slice(0, text.length - direction.length).trim();
  const sign = firstSign ?? secondSign;
  if (direction && ((/^(?:CR|K)$/i.test(direction) && (sign === "-" || parenthesized)) || (/^(?:DB|DR|D)$/i.test(direction) && sign === "+"))) return null;
  const negative = parenthesized || sign === "-" || Boolean(direction && /^(?:DB|DR|D)$/i.test(direction));
  // Indonesian receipts commonly print a zero fractional part as ,-.
  text = text.replace(/,-$/, ",00");
  const unit = text.match(/\s*(ribu|rb|juta|jt|miliar|triliun)$/i)?.[1]?.toLowerCase();
  if (unit) text = text.slice(0, -unit.length).trim();
  const scale = unit ? ({ribu: 1e3, rb: 1e3, juta: 1e6, jt: 1e6, miliar: 1e9, triliun: 1e12}[unit] ?? 1) : 1;
  if (quantity && (unit || hasRupiahMarker(value))) return null;
  const decimals = quantity ? "\\d{1,12}" : "\\d{1,2}";
  let numeric: string;
  if (new RegExp(`^(?:\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,${decimals})?$`).test(text)) {
    numeric = text.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(text) || /^\d+\.\d{1,2}$/.test(text)) {
    // Explicit international decimal notation is unambiguous. Bare 125,000 is not.
    numeric = text.replace(/,/g, "");
  } else return null;
  const parsed = Number(numeric) * scale;
  return Number.isFinite(parsed) && Number.isSafeInteger(Math.round(parsed * 100)) ? (negative ? -parsed : parsed) : null;
}

const months: Record<string, number> = {jan:1,januari:1,feb:2,februari:2,mar:3,maret:3,apr:4,april:4,mei:5,jun:6,juni:6,jul:7,juli:7,agu:8,ags:8,agustus:8,sep:9,sept:9,september:9,okt:10,oktober:10,nov:11,november:11,des:12,desember:12};
export const hasIndonesianMonth = (value: string) => /\b(?:januari|februari|maret|mei|juni|juli|agu|ags|agustus|okt|oktober|des|desember)\b/i.test(value);
/** Printed calendar dates are preserved, including WIB/WITA/WIT. No guessed year. */
export function parseIndonesianDate(value: string): Date | null {
  let text = normalizeIndonesianText(value).replace(/^(?:senin|selasa|rabu|kamis|jumat|sabtu|minggu),?\s+/i, "");
  const time = text.match(/\s+(?:pukul\s+)?(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s+(WIB|WITA|WIT))?$/i);
  if (time) {
    if (Number(time[1]) > 23 || Number(time[2]) > 59 || Number(time[3] ?? 0) > 59) return null;
    text = text.slice(0, -time[0].length).trim();
  }
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const local = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  const named = text.match(/^(\d{1,2})[\s-]+([A-Za-z]+)\.?[\s-]+(\d{4})$/);
  const y = Number(iso?.[1] ?? local?.[3] ?? named?.[3]);
  const m = iso ? Number(iso[2]) : local ? Number(local[2]) : months[named?.[2]?.toLowerCase() ?? ""];
  const d = Number(iso?.[3] ?? local?.[1] ?? named?.[1]);
  if (!y || !m || !d) return null;
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export function indonesianMoneyUnitScale(value: string): number | null {
  const unit = normalizeIndonesianText(value).match(/^(?:dalam\s+|satuan\s*:\s*)?(ribu|juta|miliar|triliun)?\s*(?:rupiah|Rp|IDR)$/i)
    ?? normalizeIndonesianText(value).match(/\(\s*(?:dalam\s+)?(ribu|juta|miliar|triliun)?\s*(?:rupiah|Rp|IDR)\s*\)/i);
  return unit ? ({ribu:1e3,juta:1e6,miliar:1e9,triliun:1e12}[unit[1]?.toLowerCase() ?? ""] ?? 1) : null;
}
