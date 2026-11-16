export type LocalParserTokenEstimate = {
  estimatedTokens: number;
  characters: number;
  utf8Bytes: number;
  method: "utf8_bytes_div_4_v1";
};

/**
 * Local deterministic parsers do not consume model tokens. This estimate is a
 * stable workload measure for comparing their input volume with paid AI calls.
 */
export const estimateLocalParserTokens = (text: string): LocalParserTokenEstimate => {
  const utf8Bytes = new TextEncoder().encode(text).byteLength;
  return {
    estimatedTokens: utf8Bytes === 0 ? 0 : Math.ceil(utf8Bytes / 4),
    characters: text.length,
    utf8Bytes,
    method: "utf8_bytes_div_4_v1",
  };
};
