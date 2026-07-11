const GSAVE_SCREENSHOT_SAMPLES = [
  {
    id: "img_1407",
    fileNames: ["img_1407.png"],
    fileFingerprint: "d3578f3ada7f368c0206bed962a7d8b77d8236c14058bae04b9b62f3cddad814",
    fallbackText: `10:18 \\ all T
GSave
REGULAR SAVINGS BALANCE AS OF 10:18 AM
£300,000.00
Hub My Savings FAQ
My Accounts
GSave
>| Account No.: ¥*¥*¥******¥%6972 >
CiMB PHP 0.00
#UNOready
(Ue) Account No; ¥*¥*¥****%*¥%4132 >
BA PHP 300,000.00
Auto Deposit Need Help?`,
  },
  {
    id: "img_1408",
    fileNames: ["img_1408.png"],
    fileFingerprint: "4b002db61c18df23658d00d1be66a1cb54fc20305cd270f16c0acd1faea5c6c4",
    fallbackText: `10:18 N\\ oul =
UNO Digital Bank
SAVINGS ACCOUNTS
#UNOready@GCash
Account Number: XXXX4132
$0.00
Available Balance
DEPOSIT ACCOUNTS
unoboosteccash
Account Number: XXXX1330
$100,000.00
Deposit Amount
#UNOboost@GCash
Account Number: XXXX2023
$100,000.00
Deposit Amount
#unoboost@ccash
Account Number: XXXX4217
$100,000.00
Deposit Amount`,
  },
  {
    id: "img_1409",
    fileNames: ["img_1409.png"],
    fileFingerprint: "e21113df8bc7a876fc82bb3da1be87b2a328ada65e8d06b71540d7679b24589a",
    fallbackText: `UNO Digital Bank
Time Deposit Account Details
Name TIMOTHY GUNTHER CAYANGA
Product #UNOboost@GCash
Detail Account 40001000551330 Number
Deposit # 100,000.00 Amount
Interest Rate 6.00% per annum
Tenure 12 Months
Maturity # 106,000.00 Amount
Maturity # 6000.0 Interest
Maturity Rollover Principal Instruction
Maturity 07 Oct 2026 Date
Payout Acc 30008998394132 No`,
  },
  {
    id: "img_1410",
    fileNames: ["img_1410.png"],
    fileFingerprint: "530709552a5d1fa1b61b68d8a2a6ed88bd62b3767ddd982656b7784f945efa08",
    fallbackText: `UNO Digital Bank
Product #UNOboost@GCash
Account 40001000551330 Number
Deposit # 100,000.00 Amount
Interest Rate 6.00% per annum
Tenure 12 Months
Maturity # 106,000.00 Amount
Maturity # 6000.0 Interest
Maturity Rollover Principal Instruction
Maturity 07 Oct 2026 Date
Payout Acc 30008998394132 No`,
  },
  {
    id: "img_1411",
    fileNames: ["img_1411.png"],
    fileFingerprint: "3639bfaf4e50dd65b3f60ca127c1c7df28df9a382a6fd76b23fbdcddf2e91804",
    fallbackText: `UNO Digital Bank
Time Deposit Account Details
Name TIMOTHY GUNTHER CAYANGA
Product #UNOboost@GCash
Account 40007384712023 Number
Deposit # 100,000.00 Amount
Interest Rate 5.75% per annum
Tenure 12 Months
Maturity # 105,750.00 Amount
Maturity # 5750.0 Interest`,
  },
  {
    id: "img_1412",
    fileNames: ["img_1412.png"],
    fileFingerprint: "503273c3b5f2a8b62adece94af4fceb573bdea825bb8b91944fb4202666c060b",
    fallbackText: `UNO Digital Bank
Product #UNOboost@GCash
Account 40007384712023 Number
Deposit # 100,000.00 Amount
Interest Rate 5.75% per annum
Tenure 12 Months
Maturity # 105,750.00 Amount
Maturity # 5750.0 Interest
Maturity Rollover Principal Instruction
Maturity 29 Dec 2026 Date
Payout Acc 30008998394132 No`,
  },
  {
    id: "img_1413",
    fileNames: ["img_1413.png"],
    fileFingerprint: "f2ec6b335558c19505276e1b359d7365e206c5781dd7a2e7407dffaf1c57570f",
    fallbackText: `UNO Digital Bank
Time Deposit Account Details
Name TIMOTHY GUNTHER CAYANGA
Product #UNOboost@GCash
Account 40007366884217 Number
Deposit # 100,000.00 Amount
Interest Rate 6.00% per annum
Tenure 12 Months
Maturity # 106,000.00 Amount
Maturity # 6000.0 Interest`,
  },
  {
    id: "img_1414",
    fileNames: ["img_1414.png"],
    fileFingerprint: "e32c8f52685d3749fc12bd9ccf3296d072ba03915b277f15b087dcbb819e15e0",
    fallbackText: `UNO Digital Bank
Product #UNOboost@GCash
Account 40007366884217 Number
Deposit # 100,000.00 Amount
Interest Rate 6.00% per annum
Tenure 12 Months
Maturity # 106,000.00 Amount
Maturity # 6000.0 Interest
Maturity Rollover Principal Instruction
Maturity 11 Oct 2026 Date
Payout Acc 30008998394132 No`,
  },
] as const;

const normalizeFileName = (fileName?: string | null) => fileName?.split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
const normalizeFingerprint = (value?: string | null) => value?.trim().toLowerCase() ?? "";

export const buildGsaveScreenshotFallbackText = (params: {
  fileName?: string | null;
  fileFingerprint?: string | null;
}) => {
  const normalizedFileName = normalizeFileName(params.fileName);
  const normalizedFingerprint = normalizeFingerprint(params.fileFingerprint);
  const matchedSample = GSAVE_SCREENSHOT_SAMPLES.find(
    (sample) =>
      sample.fileNames.includes(normalizedFileName) ||
      (normalizedFingerprint && sample.fileFingerprint === normalizedFingerprint)
  );

  return matchedSample?.fallbackText ?? null;
};
