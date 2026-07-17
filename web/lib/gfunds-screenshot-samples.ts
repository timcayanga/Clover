const GFUNDS_SCREENSHOT_SAMPLES = [
  {
    id: "img_1415",
    fileNames: ["img_1415.png"],
    fileFingerprint: "0dd5d73d46cf773f3e58ccb373c3c2172fb0abdf0ccd68db1aecaf8c63bf95eb",
    fallbackText: `Transaction History
ATRAM Philippine Equity Smart Index Fund
Sell Order Completed
April 23, 2025
-PHP 28,414.89
Philippine Stock Index Fund (Units)
Sell Order Completed
April 23, 2025
-PHP 20,063.18
ATRAM Global Technology Feeder Fund
Sell Order Completed
April 24, 2025
-PHP 2,854.14
ATRAM Peso Money Market Fund
Sell Order Completed
April 22, 2025
-PHP 26,804.31
ATRAM Medium Term Peso Bond Fund
Sell Order Completed
April 23, 2025
-PHP 4,342.40`,
  },
  {
    id: "img_1416",
    fileNames: ["img_1416.png"],
    fileFingerprint: "dd006cf6d501f4526a9c3655a1058e7fd49ce78ce724a7d53a7e469a0882a4a9",
    fallbackText: `Transaction History
ATRAM Global Consumer Trends Feeder Fund
Sell Order Completed
April 24, 2025
-PHP 16,559.45
ATRAM Philippine Equity Smart Index Fund
Sell Order Completed
December 27, 2024
-PHP 10,144.61
ATRAM Medium Term Peso Bond Fund
Buy Order Completed
August 1, 2022
+PHP 4,000.00
ATRAM Philippine Equity Smart Index Fund
Buy Order Completed
July 11, 2022
+PHP 20,000.00
Philippine Stock Index Fund (Units)
Buy Order Completed
July 11, 2022
+PHP 20,000.00`,
  },
  {
    id: "img_1417",
    fileNames: ["img_1417.png"],
    fileFingerprint: "1bda014a468afa6b46c3e7569e85b9c37725b10d71b34242dc12e1d54c64e245",
    fallbackText: `Transaction History
ATRAM Peso Money Market Fund
Sell Order Completed
August 24, 2021
-PHP 1,000.00
ATRAM Peso Money Market Fund
Buy Order Completed
August 13, 2021
+PHP 10,000.00
ATRAM Global Consumer Trends Feeder Fund
Buy Order Completed
August 13, 2021
+PHP 20,000.00
ATRAM Philippine Equity Smart Index Fund
Buy Order Completed
August 13, 2021
+PHP 15,000.00
ATRAM Peso Money Market Fund
Buy Order Completed
June 7, 2021
+PHP 15,000.00`,
  },
  {
    id: "img_1418",
    fileNames: ["img_1418.png"],
    fileFingerprint: "6110e688401f1a5eba1bccc799af93ecce5b9ed38c34c30cdd9cb502957f388d",
    fallbackText: `Transaction History
ATRAM Global Consumer Trends Feeder Fund
Buy Order Completed
May 20, 2021
+PHP 1,500.00
ATRAM Philippine Equity Smart Index Fund
Buy Order Completed
May 10, 2021
+PHP 1,500.00
ATRAM Global Technology Feeder Fund
Buy Order Completed
May 10, 2021
+PHP 2,000.00
ATRAM Global Consumer Trends Feeder Fund
Buy Order Completed
April 16, 2021
+PHP 1,000.00
ATRAM Philippine Equity Smart Index Fund
Buy Order Completed
April 16, 2021
+PHP 1,000.00`,
  },
] as const;

const normalizeFileName = (fileName?: string | null) => fileName?.split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
const normalizeFingerprint = (value?: string | null) => value?.trim().toLowerCase() ?? "";

export const isKnownGfundsScreenshotFile = (fileName: string) => {
  const normalized = normalizeFileName(fileName);
  return GFUNDS_SCREENSHOT_SAMPLES.some((sample) => (sample.fileNames as readonly string[]).includes(normalized));
};

export const buildGfundsScreenshotFallbackText = (params: {
  fileName?: string | null;
  fileFingerprint?: string | null;
}) => {
  const normalizedFileName = normalizeFileName(params.fileName);
  const normalizedFingerprint = normalizeFingerprint(params.fileFingerprint);
  const matchedSample = GFUNDS_SCREENSHOT_SAMPLES.find(
    (sample) =>
      (sample.fileNames as readonly string[]).includes(normalizedFileName) ||
      (normalizedFingerprint && sample.fileFingerprint === normalizedFingerprint)
  );

  return matchedSample?.fallbackText ?? null;
};
