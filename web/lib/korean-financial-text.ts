// Normalize only a working copy. Source text/rows remain unchanged in import provenance.
export const normalizeKoreanFinancialText = (value: string) =>
  value.normalize("NFKC").replace(/\u2212/g, "-").replace(/\u00a0/g, " ");

export const hasHangul = (value: string) => /[가-힣ㄱ-ㅎㅏ-ㅣ]/u.test(value.normalize("NFKC"));

const headerAliases: Record<string, string> = {
  거래일: "date", 거래일자: "date", 거래일시: "date", 이용일: "date", 이용일자: "date", 승인일시: "date", 승인일: "date", 날짜: "date", 일자: "date",
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
  원거래통화: "original_currency", 현지통화: "original_currency", 해외이용통화: "original_currency",
  해외이용금액: "original_amount", 현지이용금액: "original_amount", 외화금액: "original_amount",
  청구통화: "currency", 결제통화: "currency", 정산통화: "currency", 원화청구금액: "amount", 원화결제금액: "amount",
  찾으신돈: "debit", 맡기신돈: "credit", 남은돈: "balance", 거래점: "branch",
};

export const koreanFinancialHeader = (value: string): string | null => {
  const normalized = normalizeKoreanFinancialText(value).replace(/\([^)]*\)|\[[^\]]*\]/g, "").replace(/[\s_:/-]/g, "");
  return headerAliases[normalized] ?? null;
};

const investmentHeaderAliases: Record<string, string> = {
  종목명: "asset", 투자상품명: "asset", 펀드명: "asset", 투자명: "asset",
  증권사: "provider", 운용사: "provider", 플랫폼: "provider", 금융기관: "provider",
  평가금액: "market_value", 평가액: "market_value", 현재평가액: "market_value",
  평가일: "valuation_date", 평가일자: "valuation_date", 기준일: "valuation_date", 조회일: "valuation_date",
  보유수량: "quantity", 보유주수: "quantity", 보유좌수: "quantity", 수량: "quantity",
  종목코드: "symbol", 월납입액: "monthly_contribution", 월적립액: "monthly_contribution",
};

export const koreanInvestmentHeader = (value: string): string | null => {
  const key = normalizeKoreanFinancialText(value).replace(/\([^)]*\)|\[[^\]]*\]/g, "").replace(/\s/g, "");
  return investmentHeaderAliases[key] ?? null;
};

/** A legacy byte sequence is only accepted as Korean when it contains a financial table. */
export const hasKoreanFinancialHeaders = (value: string) => {
  // Evidence must occur together on a header row, not in unrelated prose.
  return value.split(/\r?\n/).some(line => {
    const cells = line.split(/[,;|\t]/).map(cell => cell.trim().replace(/^"|"$/g, ""));
    const fields = new Set(cells.map(koreanFinancialHeader).filter(Boolean));
    const holdings = new Set(cells.map(koreanInvestmentHeader).filter(Boolean));
    return (fields.size >= 3 && (fields.has("date") || fields.has("snapshot_date")) &&
      ["amount", "debit", "credit", "balance"].some(key => fields.has(key))) ||
      ["asset", "market_value"].every(key => holdings.has(key));
  });
};

export const hasKoreanAmountMarker = (value: string) => /[₩￦원만억천백십조]|\bKRW\b/iu.test(value);

/** Accept a money cell, never free-form text containing several unrelated numbers. */
export const parseKoreanAmount = (value: string): number | null => {
  let text = normalizeKoreanFinancialText(value).trim();
  const parenthesized = /^\(.*\)$/.test(text);
  if (parenthesized) text = text.slice(1, -1).trim();
  // Accept a sign before or after the currency symbol, but never two signs.
  const signBefore = text.match(/^[+-]/)?.[0];
  if (signBefore) text = text.slice(1).trim();
  text = text.replace(/^(?:KRW|₩)\s*/i, "");
  const signAfter = text.match(/^[+-]/)?.[0];
  if (signAfter) text = text.slice(1).trim();
  if ((signBefore && signAfter) || (parenthesized && (signBefore || signAfter))) return null;
  const negative = parenthesized || signBefore === "-" || signAfter === "-";
  text = text.replace(/\s*(?:KRW|원)\s*$/i, "").trim();
  const numberToken = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
  const finish = (value: number) => Number.isFinite(value) && Number.isSafeInteger(Math.round(value * 100))
    ? (negative ? -value : value) : null;
  if (new RegExp(`^${numberToken}$`).test(text)) return finish(Number(text.replace(/,/g, "")));

  // Arabic-number abbreviations used by Korean apps: 2억 3천만, 1만 2천 500.
  // Each explicit unit must decrease. Do not concatenate unrelated numbers.
  const units: Record<string, number> = { 조: 1e12, 억: 1e8, 만: 1e4, 천: 1e3, 백: 1e2, 십: 1e1 };
  const term = new RegExp(`^(${numberToken})\\s*((?:천|백|십)?(?:조|억|만)|천|백|십)?`);
  let rest = text, previousScale = Infinity, total = 0, terms = 0;
  while (rest) {
    const match = rest.match(term);
    if (!match) return null;
    const unit = match[2] ?? "";
    const scale = unit.length === 2 ? units[unit[0]]! * units[unit[1]]! : (units[unit] ?? 1);
    if (scale >= previousScale) return null;
    const value = Number(match[1].replace(/,/g, "")) * scale;
    // A lower component must fit below the preceding unit (1만 20천 is invalid).
    if (terms > 0 && value >= previousScale) return null;
    total += value;
    rest = rest.slice(match[0].length).trim();
    if (!unit && rest) return null;
    previousScale = scale;
    terms += 1;
  }
  return terms ? finish(total) : null;
};

/** Korean calendar dates stay calendar dates; times must not shift them to UTC's previous day. */
export const parseKoreanDate = (value: string): Date | null => {
  const text = normalizeKoreanFinancialText(value).trim();
  const match = text.match(/^(\d{4})(?:\s*년\s*|[./-]\s*)(\d{1,2})(?:\s*월\s*|[./-]\s*)(\d{1,2})(?:\s*일|\.)?(?:\s*\([월화수목금토일](?:요일)?\))?(?:\s*(?:(?:오전|오후)\s*)?\d{1,2}:\d{2}(?::\d{2})?)?$/)
    ?? text.match(/^(\d{4})(\d{2})(\d{2})(?:\s+(?:(?:오전|오후)\s*)?\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (!match) return null;
  const time = text.match(/(?:(오전|오후)\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (time && (Number(time[3]) > 59 || Number(time[4] ?? 0) > 59 ||
    (time[1] ? Number(time[2]) < 1 || Number(time[2]) > 12 : Number(time[2]) > 23))) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d) ? date : null;
};

/** Explicit money units apply to money columns only, never identifiers or quantities. */
export function koreanMoneyUnitScale(value: string): number | null {
  const unit = normalizeKoreanFinancialText(value).trim().match(/^(?:단위\s*[:：]?\s*)?(원|천원|만원|백만원|천만원|억원)$/)?.[1]
    ?? normalizeKoreanFinancialText(value).match(/[([]\s*(?:단위\s*[:：]?\s*)?(원|천원|만원|백만원|천만원|억원)\s*[)\]]/)?.[1];
  return unit ? ({ 원: 1, 천원: 1e3, 만원: 1e4, 백만원: 1e6, 천만원: 1e7, 억원: 1e8 }[unit] ?? null) : null;
}
