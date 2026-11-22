import { decodeUnicodeTable } from "../../shared/unicode-table";
import { hasKoreanFinancialHeaders } from "@/lib/korean-financial-text";

const decodeWith = (bytes: Uint8Array, encoding: string, fatal = false) =>
  new TextDecoder(encoding, { fatal }).decode(bytes);

export const decodeStructuredDelimitedBytes = (bytes: Uint8Array) => {
  const unicode = decodeUnicodeTable(bytes);
  if (unicode !== null) return unicode;
  // Windows-949 and Windows-1252 are ambiguous without their financial headers.
  try {
    const korean = decodeWith(bytes, "euc-kr", true);
    if (hasKoreanFinancialHeaders(korean)) return korean;
  } catch { /* Try the Western legacy export. */ }
  return decodeWith(bytes, "windows-1252");
};
