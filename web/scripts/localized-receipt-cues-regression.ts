import assert from "node:assert/strict";
import { assessFinancialUploadScope } from "../lib/financial-upload-scope";
import { splitReceiptPromotionalFooter } from "../lib/receipt-promotional-footer";
import { hasLocalizedReceiptEvidence } from "../lib/localized-receipt-cues";
import { hasReceiptPhotoEvidence, shouldRecoverEmptyStatementImageAsReceipt } from "../lib/receipt-intake";

const receipts = [
  ["Filipino", "Tindahan ni Mila\nResibo ng Bayad\nHalagang binayaran ₱125"],
  ["Indonesian", "Kedai Kopi\nBukti Pembayaran\nJumlah Bayar Rp 35.000"],
  ["Malay", "Kedai Runcit\nResit Rasmi\nJumlah Dibayar RM 12.50"],
  ["Korean", "서울식당\n카드영수증\n결제금액 12,000원"],
  ["Japanese", "東京食堂\n領収書\n合計金額：￥１，２５０"],
  ["Traditional Chinese", "茶餐廳\n付款收據\n實付金額：HK$88"],
  ["Simplified Chinese", "茶馆\n支付成功\n实付金额：88元"],
  ["Thai", "ร้านกาแฟ\nใบเสร็จรับเงิน\nยอดสุทธิ 135 บาท"],
  ["Vietnamese", "Quán cà phê\nBiên lai thu tiền\nTổng cộng\n85.000 đ"],
];
for (const [language, text] of receipts) {
  assert.ok(hasLocalizedReceiptEvidence(text), language);
  assert.ok(hasReceiptPhotoEvidence(text), language);
  assert.ok(shouldRecoverEmptyStatementImageAsReceipt({
    image: true, mode: "statement", transactionHistory: false, hasStatementRows: false, hasSavedRows: false, opticalText: text,
  }), language);
  for (const fileName of ["photo.jpg", "document.pdf"]) {
    assert.equal(assessFinancialUploadScope({ text, fileName }).decision, "financial", language);
  }
}

const japanese = receipts[4][1];
const promotion = "ADVERTISEMENT: Save on your next purchase\nTotal USD 999.00";
assert.deepEqual(splitReceiptPromotionalFooter(japanese + "\n" + promotion), { body: japanese, footer: promotion });
assert.equal(splitReceiptPromotionalFooter(japanese + "\n" + promotion + "\n" + receipts[7][1]).footer, null,
  "Keep a later local-language receipt separate from the promotion.");

for (const text of [
  "メニュー\n珈琲 500円\n合計 500円",
  "購物車\n總計 120元\n待付款",
  "Bukti Pembayaran\nJumlah Bayar Rp 35.000\nStatus Pembayaran: Belum Bayar",
  "取引明細\n領収書\n合計 500円",
  "ใบเสร็จรับเงิน\nยอดสุทธิ",
  "Tổng cộng\n85.000 đ",
]) {
  assert.equal(hasLocalizedReceiptEvidence(text), false, text);
  assert.equal(hasReceiptPhotoEvidence(text), false, text);
}
console.log(`Localized receipt cues passed for ${receipts.length} language/script variants and six lookalikes`);
