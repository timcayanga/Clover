// Normalize only a working copy. Source text/rows remain unchanged in import provenance.
export const normalizeKoreanFinancialText = (value: string) =>
  value.normalize("NFKC").replace(/\u2212/g, "-").replace(/\u00a0/g, " ");

export const hasHangul = (value: string) => /[가-힣ㄱ-ㅎㅏ-ㅣ]/u.test(value.normalize("NFKC"));

const headerAliases: Record<string, string> = {
  거래일: "date", 거래일자: "date", 거래일시: "date", 이용일: "date", 이용일자: "date", 승인일시: "date", 날짜: "date", 일자: "date",
  매입일: "posted_date", 처리일: "posted_date", 결제일: "posted_date",
  적요: "description", 내용: "description", 거래내용: "description", 거래내역: "description", 이용내역: "description", 메모: "description", 비고: "description",
  가맹점: "merchant", 가맹점명: "merchant", 상호: "merchant", 상호명: "merchant", 사용처: "merchant", 거래처: "merchant",
  금액: "amount", 거래금액: "amount", 이용금액: "amount", 결제금액: "amount", 청구금액: "amount",
  출금: "debit", 출금액: "debit", 출금금액: "debit", 찾으신금액: "debit", 지출: "debit",
  입금: "credit", 입금액: "credit", 입금금액: "credit", 맡기신금액: "credit", 수입: "credit",
  잔액: "balance", 거래후잔액: "balance", 거래후금액: "balance", 계좌잔액: "balance",
  통화: "currency", 통화코드: "currency", 화폐: "currency",
  구분: "type", 거래구분: "type", 입출금구분: "type", 수입지출: "type",
  상태: "status", 거래상태: "status", 승인상태: "status", 수수료: "fee",
  분류: "category", 카테고리: "category", 계좌: "account_name", 계좌명: "account_name", 상품명: "account_name",
  계좌번호: "account_number", 카드번호: "account_number", 은행: "institution", 은행명: "institution", 금융기관: "institution",
  계좌유형: "account_type", 계좌종류: "account_type", 거래번호: "reference", 승인번호: "reference", 참조번호: "reference",
  기준일: "snapshot_date", 조회일: "snapshot_date", 원거래금액: "original_amount", 현지금액: "original_amount",
  원거래통화: "original_currency", 현지통화: "original_currency",
};

export const koreanFinancialHeader = (value: string): string | null => {
  const normalized = normalizeKoreanFinancialText(value).replace(/\([^)]*\)|\[[^\]]*\]/g, "").replace(/[\s_:/-]/g, "");
  return headerAliases[normalized] ?? null;
};

/** A legacy byte sequence is only accepted as Korean when it contains a financial table. */
export const hasKoreanFinancialHeaders = (value: string) => {
  const fields = new Set(value.split(/[,;|\t\r\n]/).map((cell) => koreanFinancialHeader(cell.replace(/^"|"$/g, ""))).filter(Boolean));
  return fields.size >= 3 && (fields.has("date") || fields.has("snapshot_date")) &&
    ["amount", "debit", "credit", "balance"].some((key) => fields.has(key));
};

export const hasKoreanAmountMarker = (value: string) => /[₩￦원만억천]/u.test(value);

/** Accept a money cell, never free-form text containing several unrelated numbers. */
export const parseKoreanAmount = (value: string): number | null => {
  let text = normalizeKoreanFinancialText(value).trim();
  const negative = /^\(/.test(text) || /^-/.test(text);
  text = text.replace(/^\((.*)\)$/, "$1").replace(/^[+-]\s*/, "")
    .replace(/^(?:KRW|₩)\s*/i, "").replace(/\s*(?:KRW|원)\s*$/i, "").trim();
  if (/^-/.test(text)) { text = text.slice(1); return parseKoreanAmount(`-${text}`); }
  const numberToken = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
  if (new RegExp(`^${numberToken}$`).test(text)) {
    const parsed = Number(text.replace(/,/g, ""));
    return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
  }
  // Screenshots may abbreviate values as 1.2만원 or 2억 3천만원.
  // Unsupported compound forms fail closed instead of losing their multiplier.
  const simpleUnit = text.match(new RegExp(`^(${numberToken})\\s*(천|만|억)$`));
  if (!simpleUnit) return null;
  const scale = { 천: 1_000, 만: 10_000, 억: 100_000_000 }[simpleUnit[2]]!;
  const parsed = Number(simpleUnit[1].replace(/,/g, "")) * scale;
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
};

/** Korean calendar dates stay calendar dates; times must not shift them to UTC's previous day. */
export const parseKoreanDate = (value: string): Date | null => {
  const text = normalizeKoreanFinancialText(value).trim();
  const match = text.match(/^(\d{4})(?:\s*년\s*|[./-]\s*)(\d{1,2})(?:\s*월\s*|[./-]\s*)(\d{1,2})(?:\s*일|\.)?(?:\s*\([월화수목금토일]\))?(?:\s*(?:(?:오전|오후)\s*)?\d{1,2}:\d{2}(?::\d{2})?)?$/)
    ?? text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d) ? date : null;
};
