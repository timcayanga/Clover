// Intake cues route the source for extraction. They do not set transaction
// fields, establish currency, or authorize posting.
const receiptHeading = /^(?:resibo(?: ng bayad)?|(?:bukti pembayaran|struk(?: pembayaran)?|k[uw]itansi|kwitansi)|resit(?: rasmi| bayaran)?|영수증|(?:카드|현금)\s*영수증|領収書|領收書|收據|收据|付款收據|付款收据|ใบเสร็จ(?:รับเงิน)?|biên lai(?: thu tiền| thanh toán)?)(?=$|[\s:：#(\d])/iu;
const amount = /^(?:(?:Rp\.?|RM|HK\$|NT\$|[₱¥₩฿₫$]|[A-Z]{3})\s*)?\d[\d,. ]*(?:\s*(?:円|원|元|บาท|đ|₫|[A-Z]{3}))?$/iu;
const monetaryLabel = /^(?:kabuuang halaga|kabuuan|halagang binayaran|sukli|jumlah bayar(?:an)?|jumlah dibayar|total bayar|total dibayar|jumlah keseluruhan|jumlah diterima|wang baki|kembalian|거스름돈|결제\s*금액|합\s*계|받은\s*금액|お支払(?:い)?合計|合計(?:金額)?|お釣り|實收(?:金額)?|实收(?:金额)?|實付(?:金額)?|实付(?:金额)?|總計|总计|找零|ยอด(?:ที่ชำระ|ชำระแล้ว|รวม(?:สุทธิ)?|สุทธิ)|รวมทั้งสิ้น|เงินทอน|tổng(?: cộng| tiền)|đã thanh toán|tiền khách đưa|tiền thối lại)\s*[:：]?\s*/iu;
const paymentComplete = /^(?:bayad na|pembayaran (?:berhasil|berjaya)|sudah dibayar|telah dibayar|결제\s*(?:완료|승인)|支払(?:い)?済み|支付成功|付款成功|已付款|ชำระเงินสำเร็จ|ชำระแล้ว|thanh toán thành công|đã thanh toán)[.!。]?$/iu;
const unpaid = /^(?:(?:status pembayaran|付款狀態|付款状态|결제\s*상태|trạng thái thanh toán)\s*[:：]?\s*)?(?:belum (?:dibayar|bayar)|menunggu pembayaran|hindi pa bayad|未払い|未付款|待付款|미결제|결제\s*대기|ยังไม่ชำระ(?:เงิน)?|chưa thanh toán)[.!。]?$/iu;
const statement = /^(?:riwayat transaksi|mutasi rekening|penyata akaun|거래\s*내역|取引明細|交易明細|交易明细|帳戶月結單|账户对账单|รายการเดินบัญชี|sao kê(?: tài khoản)?)(?=$|[\s:：])/imu;

export function isLocalizedReceiptHeading(line: string) {
  return receiptHeading.test(line.normalize("NFKC").trim());
}

export function isLocalizedReceiptAmountLine(line: string) {
  const normalized = line.normalize("NFKC").trim();
  const label = monetaryLabel.exec(normalized);
  return Boolean(label && amount.test(normalized.slice(label[0].length)));
}

export function hasLocalizedUnpaidStatus(text: string) {
  return text.normalize("NFKC").split(/\r?\n/).some(line => unpaid.test(line.trim()));
}

export function hasLocalizedReceiptEvidence(text: string) {
  const lines = text.normalize("NFKC").split(/\r?\n/).map(line => line.trim());
  if (statement.test(lines.join("\n")) || lines.some(line => unpaid.test(line))) return false;
  const hasAmount = lines.some((line, index) => isLocalizedReceiptAmountLine(line) ||
    (monetaryLabel.exec(line)?.[0] === line && amount.test(lines[index + 1] ?? "")));
  return hasAmount && lines.some(line => isLocalizedReceiptHeading(line) || paymentComplete.test(line));
}
