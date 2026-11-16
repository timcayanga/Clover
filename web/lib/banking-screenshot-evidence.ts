import { hasLocalizedReceiptEvidence } from "./localized-receipt-cues";

const FINANCIAL_ACTION = /^(?:transaction|transfer|payment|refund|authorization|authorisation)\s+/iu;
const FAILED = /^(?:unsuccessful|failed|declined|rejected|gagal|실패|거절|交易失敗|交易失败|thất bại)$/iu;
const PENDING = /^(?:pending|processing|in progress|on hold|scheduled|authorized(?: only)?|authorised(?: only)?|preauthorized|preauthorised|authorization hold|authorisation hold|pending authorization|pending authorisation|tertunda|menunggu pembayaran|diproses|결제\s*대기|처리\s*중|待付款|處理中|处理中|รอดำเนินการ|đang xử lý)$/iu;
const REVERSED = /^(?:cancelled|canceled|reversed|reverted|void(?:ed)?|expired|dibatalkan|취소|ยกเลิก)$/iu;
const REFUND_NOTICE = /^(?:refund[ :：]+(?:failed|declined|cancelled|canceled|notice|notification|requested|initiated|issued|sent|approved|completed|successful|pending|processing|in progress|scheduled)|(?:pending|processing) refund)$/iu;
const REQUEST = /^(?:payment request(?: (?:sent|received|pending|unpaid|expired|cancelled|canceled))?|request for payment|money request|(?:pay|payment) requested|permintaan pembayaran|請款通知|付款请求|yêu cầu thanh toán)$/iu;
const POSTED_REFUND = /^(?:refund (?:credited|posted)|credited refund|refund credited to (?:your )?(?:bank )?account)$/iu;

export type BankingReviewStatus =
  | "failed_payment" | "pending_authorization" | "refund_notice" | "payment_request" | "reversed_payment";

export const bankingReviewMessage: Record<BankingReviewStatus, string> = {
  failed_payment: "Payment failed. Clover saved the screenshot without adding a transaction. Upload a completed payment if you try again.",
  pending_authorization: "Payment or authorization pending. Clover saved the screenshot without changing your balance. Upload the posted transaction once it clears.",
  refund_notice: "Refund notice saved. Clover will count the refund once you upload the credit shown in your account activity.",
  payment_request: "Payment request saved. Clover did not record a payment. Upload the completed transaction after the request is paid.",
  reversed_payment: "Payment reversed, cancelled, or expired. Clover saved the screenshot without adding a transaction.",
};

const POSTED_STATUS = /^(?:(?:transaction|transfer|payment|cash\s*in)\s+)?(?:successful|completed|posted|settled|approved|berhasil|berjaya|결제\s*완료|支付成功|交易成功|ชำระเงินสำเร็จ|thanh toán thành công)\s*[.!]?$/iu;
const STATUS_PREFIX = /^(?:(?:transaction|payment|transfer|refund)\s+)?status\s*[:：]\s*/i;
const HISTORY = /\b(?:transaction\s+history|past\s+transactions|recent\s+transactions|account\s+activity|wallet\s+activity|all transactions)\b|riwayat transaksi|mutasi rekening|sejarah transaksi|거래\s*내역|取引明細|交易明細|交易明细|รายการเดินบัญชี|lịch sử giao dịch/iu;
const DETAIL = /^(?:transaction|transfer|payment|refund|cash\s*in)\s+details\s*[:：]?$/i;
const MOVEMENT = /\b(?:expense|paid|purchase|payment|received|deposit|withdrawal|refund|transferred|sent|cash\s*(?:in|out))\b|입금|출금|入金|出金|轉帳|转账|chuyển tiền|เงินเข้า|เงินออก/iu;
const DATE = /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2}(?:,\s*|\s+)\d{4})\b|\d{4}\s*[년年]\s*\d{1,2}\s*[월月]\s*\d{1,2}/u;
const CURRENCY = "(?:[A-Z]{3}\\s+|(?:₱|[$€£¥₩฿₫]|Rp\\.?|RM)\\s*)";
const NUMBER = "(?:\\d[\\d,]*\\.\\d{2}|\\d{1,3}(?:[,.]\\d{3})+|\\d+)";
const ACTIVITY_AMOUNT = new RegExp(`(?:[+−-]\\s*${CURRENCY}?${NUMBER}|\\b(?:amount(?: sent| received| paid| credited| refunded)?|refund amount|credited amount|total (?:sent|received|paid))\\s*[:：]?\\s*${CURRENCY}?${NUMBER}|${CURRENCY}${NUMBER}|\\d[\\d,]*\\.\\d{2})$`, "iu");
const SUMMARY = /^(?:(?:available|current|wallet|account|remaining|total|outstanding|opening|closing)\s+balance|balance|total assets|credit limit|saldo(?: tersedia)?)(?=$|[\s:：])/iu;
const HOME = /^(?:home|dashboard|overview|available balance|wallet balance|account balance)$/i;
const HOME_ACTION = /^(?:send money|cash in|pay bills|buy load|scan(?: qr)?|top up|bank transfer|request money|my accounts|view all|rewards)$/i;
const PAYMENT_BANNER = /^(?:(?:transaction|transfer|payment|cash\s*in)\s+(?:successful|completed)|payment successful|支付成功|交易成功|ชำระเงินสำเร็จ|thanh toán thành công)[.!]?$/iu;
const BANNER = /^(?:congratulations|congrats|well done)[!., ]*(?:$|you(?:'ve| have)\b)/i;
const REFERENCE = /^(?:reference(?:\s+(?:number|no\.?|id))?|transaction\s+id)\s*[:：#]?\s*([\w-]*\d[\w-]{4,})\s*$/i;
const ISSUED_RECORD = /^(?:official receipt|purchase receipt|sales invoice|tax invoice|statement of account|account statement|bank statement)(?=$|[\s:：#])/i;

function activityAmount(line: string, previous: string) {
  return !SUMMARY.test(line) && !DATE.test(line.replace(/\s.*$/, "")) &&
    !(SUMMARY.test(previous) && /^(?:[A-Z]{3}|[₱$€£¥₩฿₫]|Rp\.?|RM)?\s*\d[\d,.]*$/iu.test(line)) &&
    ACTIVITY_AMOUNT.test(line);
}

export function readBankingStatusEvidence(line: string): "posted" | BankingReviewStatus | null {
  const status = line.normalize("NFKC").trim().replace(STATUS_PREFIX, "").replace(/[.!。]+$/, "");
  if (REFUND_NOTICE.test(status)) return "refund_notice";
  if (REQUEST.test(status)) return "payment_request";
  const actionStatus = status.replace(FINANCIAL_ACTION, "");
  if (FAILED.test(actionStatus)) return "failed_payment";
  if (REVERSED.test(actionStatus)) return "reversed_payment";
  if (PENDING.test(status) || PENDING.test(actionStatus) || /^(?:authorization|authorisation) approved$/i.test(status)) return "pending_authorization";
  return POSTED_STATUS.test(status) || POSTED_REFUND.test(status) ? "posted" : null;
}

export function readBankingActivityStatus(line: string): "posted" | "unsettled" | null {
  const status = readBankingStatusEvidence(line);
  return status && status !== "posted" ? "unsettled" : status;
}

export function inspectBankingScreenshot(text: string): {
  kind: "history" | "detail" | "unsettled_detail" | "screen_only" | "unknown";
  review?: { status: BankingReviewStatus; printedStatus: string };
} {
  const originalLines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const lines = originalLines.map(line => line.normalize("NFKC"));
  const dated = lines.filter(line => DATE.test(line)).length;
  const amounts = lines.filter((line, i) => activityAmount(line, lines[i - 1] ?? ""));
  const signed = amounts.filter(line => /(?:^|\s)[+−-]\s*(?:[A-Z]{3})?\s*[₱$€£¥₩฿₫]?\s*\d/u.test(line)).length;
  const directed = amounts.filter(line => MOVEMENT.test(line)).length;
  const statuses = lines.map(readBankingStatusEvidence);
  const posted = statuses.filter(status => status === "posted").length;
  const unsettled = statuses.some(status => status !== null && status !== "posted");
  const history = lines.some(line => HISTORY.test(line) || /^transactions\s*[:：]?$/i.test(line));
  const detail = lines.some(line => DETAIL.test(line));
  const home = lines.some(line => HOME.test(line)) && lines.filter(line => HOME_ACTION.test(line)).length >= 2;
  const banner = lines.some(line => BANNER.test(line)) || (lines.length <= 4 && lines.some(line => PAYMENT_BANNER.test(line)));

  if (history && dated > 0 && amounts.length >= 2 &&
      (signed >= 2 || directed >= 2 || (dated >= 2 && posted >= 2))) return { kind: "history" };
  const hasReference = lines.some((line, index) => REFERENCE.test(line) ||
    (/^(?:reference (?:number|no\.?)|transaction id)\s*[:：]?$/i.test(line) && /^[\w-]*\d[\w-]{4,}$/.test(lines[index + 1] ?? "")));
  const hasDetails = (detail || posted > 0 || unsettled) && hasReference &&
    dated > 0 && amounts.length > 0 && lines.some(line => MOVEMENT.test(line) || /^(?:merchant|recipient|payee)\s*[:：]/i.test(line));
  // The credit itself is required to establish a posted refund. A notice
  // marked issued, a promised date, or a refund reference does not do so.
  const explicitCredit = lines.some(line => POSTED_REFUND.test(line) || /^(?:amount credited|credited amount)\s*[:：]/i.test(line)) ||
    amounts.some(line => /^\+/.test(line)) && posted > 0;
  const refundPosted = explicitCredit && dated > 0 && amounts.length > 0 && hasReference &&
    !statuses.some(status => status === "failed_payment" || status === "pending_authorization" || status === "reversed_payment");
  if (refundPosted && (statuses.includes("refund_notice") || lines.some(line => POSTED_REFUND.test(line)))) return { kind: "detail" };

  // Requests and refund notices have a recognizable document purpose even
  // when the provider omitted a success banner or a transaction reference.
  const priority: BankingReviewStatus[] = ["failed_payment", "reversed_payment", "payment_request", "refund_notice", "pending_authorization"];
  const reportedStatus = priority.find(candidate => statuses.includes(candidate));
  const status = reportedStatus === "pending_authorization" && lines.some(line => /^refund details$/i.test(line))
    ? "refund_notice" : reportedStatus;
  const statusIndex = reportedStatus ? statuses.indexOf(reportedStatus) : -1;
  const explicitlyAboutPayment = statusIndex >= 0 &&
    FINANCIAL_ACTION.test(lines[statusIndex].replace(STATUS_PREFIX, ""));
  if (status && (hasDetails || detail || banner || explicitlyAboutPayment || status === "refund_notice" || status === "payment_request")) {
    return { kind: "unsettled_detail", review: { status, printedStatus: originalLines[statusIndex] } };
  }
  if (hasDetails) return { kind: "detail" };
  if ((home || banner) && !lines.some(line => ISSUED_RECORD.test(line)) && !hasLocalizedReceiptEvidence(text) &&
      !(dated > 0 && amounts.length > 0)) return { kind: "screen_only" };
  return { kind: "unknown" };
}


export function classifyBankingScreenshot(text: string) {
  return inspectBankingScreenshot(text).kind;
}
