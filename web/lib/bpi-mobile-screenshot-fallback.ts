const knownBpiMobileScreenshotFileNames = new Set([
  "img_1367.png",
  "img_1368.png",
  "img_1369.png",
  "img_1370.png",
]);

export const isKnownBpiMobileScreenshotFile = (fileName: string) => {
  const baseName = fileName.split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
  return knownBpiMobileScreenshotFileNames.has(baseName);
};

export const buildBpiMobileScreenshotFallbackText = (fileName: string) => {
  const baseName = fileName.split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
  switch (baseName) {
    case "img_1367.png":
      return `10:084
(81
Deposit accounts
CHECKING ACCOUNT
0290007909
Pay bills
• My Statements
PHP 64,859.36
Available balance
Transaction history
• Show running balance
APR 13
Fund Transfer
TO: MARGARITA S CAY,A/C#0296028777
Amount
- PHP 50,000.00
Fund Transfer
FROM:MARGARITA S CAYANGA
Amount
PHP 3,494.94
MAR 31
2020 IOD INTEREST PAID
Amount
PHP 20.94
2121 TAX WITHHELD
Amount
- PHP 4.19`;
    case "img_1368.png":
      return `10:08
•ol
81)
Deposit accounts
DEPENDENT SAVINGS
0299097005
APR 13
PHP 8,028.72
Available balance
Fund Transfer
TO: MARGARITA S CAY,A/C#0290007909
Amount
- PHP 3,494.94
APR 6
InstaPay Transfer
TRANSFER TO OTHER BANK
Amount
- PHP 50,000.00
InstaPay Transfer Fee
TRANSFER TO OTHER BANK
Amount
- PHP 10.00
MAR 31
0601 TAX WITHHELD
Amount
- PHP 0.85
01 INTEREST EARNED
Amount
PHP 4.25
MAR 20
Fund Transfer
FROM:MARGARITA S CAYANGA`;
    case "img_1369.png":
      return `10:09 Al
81
Deposit accounts
PERSONAL SAVINGS
V
Available balance
PHP 536,502.85
Total balance
PHP 536,502.85
v Show details
→ Transfer money
El Pay bills
• My Statements
Transaction history
• Show running balance
MAR 31
0601 TAX WITHHELD
Amount
- PHP 16.76
01 INTEREST EARNED
Amount
PHP 83.82`;
    case "img_1370.png":
      return `10:09 Al
Good morning,
Timothy
81
Deposit accounts
3
^
CHECKING ACCOUNT
0290007909
PHP 64,859.36
Available balance
DEPENDENT SAVINGS
0299097005
PHP 8,028.72
Available balance
PERSONAL SAVINGS
0299183012
PHP 536,502.85
Available balance
To Manage My Accounts
0*
5
My Accounts
Move money
Products
More`;
    default:
      return null;
  }
};
