// Advisory suggestions for new imports only. Language never supplies currency,
// account ownership, or direction. Keep original descriptions in source evidence.
const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim();

const walletFunding = /\b(?:isi\s+saldo|top[ -]?up|pengisian\s+saldo)\b.*\b(?:gopay|go\s+pay|ovo|dana|shopee\s*pay|linkaja)\b/i;
const fee = /^(?:biaya\s+(?:adm(?:in(?:istrasi)?)?|transfer|layanan|transaksi|bulanan|tarik\s+tunai)|pajak\s+bunga|potongan\s+pajak|bunga\s+(?:pinjaman|kredit))\b/i;

const merchantHints: Array<[RegExp, string]> = [
  [/\b(?:go\s*food|shopee\s*food|grab\s*food|rumah\s+makan|warung\s+makan|kedai\s+kopi)\b/i, "Food & Dining"],
  [/\b(?:indomaret|alfamart|super\s*indo|hypermart|transmart)\b/i, "Groceries"],
  [/\b(?:go\s*ride|go\s*car|go\s*bluebird|transjakarta|jaklingko|mrt\s+jakarta|kai\s+commuter|pertamina\s+dex|pertamax|pertalite|spbu)\b/i, "Transport"],
  [/\b(?:ruangguru|universitas\s+indonesia|uang\s+sekolah|biaya\s+kuliah|pembayaran\s+spp)\b/i, "Education"],
  [/\b(?:apotek|rumah\s+sakit|bpjs\s+kesehatan|halodoc|siloam\s+hospitals)\b/i, "Health & Wellness"],
  [/\b(?:pln\s+(?:listrik|indonesia|electricity)|(?:pembayaran|tagihan|token)\s+pln|pdam|telkomsel|indihome|indosat\s+ooredoo|xl\s+axiata|token\s+listrik|tagihan\s+listrik|tagihan\s+air|paket\s+data|pulsa)\b/i, "Bills & Utilities"],
  [/\b(?:traveloka|garuda\s+indonesia|lion\s+air\s+indonesia|batik\s+air\s+indonesia)\b/i, "Travel & Lifestyle"],
  [/\b(?:tokopedia|bukalapak|blibli)\b/i, "Shopping"],
];

export const getIndonesianMerchantCategoryHint = (value: string): string | null => {
  const text = normalize(value);
  // Fee rows describe the fee, not the merchant or payment rail it relates to.
  if (fee.test(text)) return "Financial";
  // A wallet top-up is not evidence of the later purchase or account ownership.
  if (walletFunding.test(text)) return "Other";
  if (/\btarik\s+tunai\b/i.test(text)) return "Cash & ATM";
  return merchantHints.find(([pattern]) => pattern.test(text))?.[1] ?? null;
};

export const getIndonesianIncomeCategoryHint = (value: string, type: string): string | null =>
  type === "income" && /^(?:gaji|penerimaan\s+gaji|bunga\s+tabungan|bunga\s+deposito)\b/i.test(normalize(value))
    ? "Income" : null;

export const hasIndonesianNeutralPaymentContext = (value: string) =>
  /\b(?:qris|bi[ -]?fast|gopay|go\s+pay|shopee\s*pay|linkaja|xendit)\b|\b(?:isi\s+saldo|pengisian\s+saldo|setor\s+tunai|(?:ovo|dana)\s+(?:indonesia|wallet)|gaji|bunga\s+(?:tabungan|deposito)|pembayaran|pembelian)\b/i.test(normalize(value));

export const needsIndonesianPaymentCategoryReview = (value: string) => {
  const hint = getIndonesianMerchantCategoryHint(value);
  return (hint === "Other" || !hint) && hasIndonesianNeutralPaymentContext(value);
};

// Only restore service spelling. Do not collapse GoFood restaurants into GoPay,
// or ShopeeFood into Shopee, and do not discard branch/counterparty information.
export const normalizeIndonesianServiceLabel = (value: string): string | null => {
  if (!/\b(?:go\s*(?:food|ride|car|pay|mart|send)|shopee\s*(?:food|pay))\b/i.test(value)) return null;
  return normalize(value)
    .replace(/\bgo\s*food\b/gi, "GoFood")
    .replace(/\bgo\s*ride\b/gi, "GoRide")
    .replace(/\bgo\s*car\b/gi, "GoCar")
    .replace(/\bgo\s*pay\b/gi, "GoPay")
    .replace(/\bgo\s*mart\b/gi, "GoMart")
    .replace(/\bgo\s*send\b/gi, "GoSend")
    .replace(/\bshopee\s*food\b/gi, "ShopeeFood")
    .replace(/\bshopee\s*pay\b/gi, "ShopeePay");
};
