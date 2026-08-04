import assert from "node:assert/strict";
import { detectStatementMetadata, parseImportText } from "@/lib/import-parser";

const positionsText = `
My positions
Amazon $222.71
0.830208078 shares 31.33%
Alphabet Inc Class A - Google $323.61
0.839028895 shares 27.22%
Realty Income $38.81
0.60828597 shares 4.57%
Procter & Gamble $84.13
0.571279699 shares 12.30%
Schwab US Dividend Equity ETF $510.86
16.034535582 shares 0.17%
Vanguard S&P 500 ETF $449.99
0.679216867 shares 6.14%
Verizon $38.39
0.798 shares 3.78%
Exxon Mobil $244.55
1.600956696 shares 3.86%
`;

const tradesText = `
Trade history
30 March 2026 - Filled
Buy - Market by Dollars -$3.07
+ SCHD - 0.097192224 shares @ $30.56
2 March 2026 - Filled
Buy - Market by Dollars -$255.00
+ XOM - 1.600956696 shares @ $158.88
2 March 2026 - Filled
Buy - Market by Dollars -$170.00
+ AMZN - 0.830208078 shares @ $204.25
2 March 2026 - Filled
Buy - Market by Dollars -$40.78
+ O - 0.60828597 shares @ $66.86
`;

const dividendsText = `
Dividends
1 May 2026
Verizon $0.56
$0.71 per shares 0.791519435 shares
1 May 2026
Verizon -$0.14
Withholding tax 25% (PHL)
15 April 2026
Realty Income $0.16
$0.27 per shares 0.591497227 shares
15 April 2026
Realty Income -$0.04
Withholding tax 25% (PHL)
`;

const positionMetadata = detectStatementMetadata(positionsText, "renamed-gotrade-positions.png");
assert.equal(positionMetadata?.institution, "GoTrade");
assert.equal(positionMetadata?.accountType, "investment");
assert.equal(positionMetadata?.currency, "USD");

const positionRows = parseImportText(positionsText, "renamed-gotrade-positions.png", "image/png");
assert.equal(positionRows.length, 8, "Expected eight GoTrade holdings.");
assert.deepEqual(
  positionRows.map((row) => row.rawPayload?.investmentSymbol),
  ["AMZN", "GOOGL", "O", "PG", "SCHD", "VOO", "VZ", "XOM"]
);
assert.equal(positionRows.find((row) => row.accountName === "Amazon")?.rawPayload?.marketValue, 222.71);
assert.equal(positionRows.find((row) => row.accountName === "Exxon Mobil")?.rawPayload?.quantity, 1.600956696);
assert.equal(positionRows.find((row) => row.accountName === "Amazon")?.rawPayload?.gainLossPercent, 31.33);
assert.ok(
  Number(positionRows.find((row) => row.accountName === "Amazon")?.rawPayload?.totalCost) > 0,
  "Position gain evidence should retain an evidence-backed cost basis for return calculations."
);
assert.ok(positionRows.every((row) => row.rawPayload?.kind === "account_snapshot_marker"));

const flexibleTradeRows = parseImportText(
  `Trade history
30 March 2026 · Filled
Buy — Market by Dollars
-$3.07
+ SCHD · 0.097192224 shares at $30.56`,
  "gotrade-trade-layout-variant.png",
  "image/png"
);
assert.equal(flexibleTradeRows.length, 1, "GoTrade trade OCR punctuation and split amount lines should remain parseable.");
assert.equal(flexibleTradeRows[0]?.rawPayload?.investmentSymbol, "SCHD");

const tradeRows = parseImportText(tradesText, "renamed-gotrade-trades.png", "image/png");
assert.equal(tradeRows.length, 4, "Expected four visible GoTrade trades.");
assert.ok(tradeRows.every((row) => row.categoryName === "Investments"));
assert.ok(tradeRows.every((row) => row.type === "expense"));
assert.equal(tradeRows.find((row) => row.rawPayload?.investmentSymbol === "XOM")?.rawPayload?.executionPrice, 158.88);
assert.equal(tradeRows.find((row) => row.rawPayload?.investmentSymbol === "SCHD")?.amount, "3.07");

const dividendRows = parseImportText(dividendsText, "renamed-gotrade-dividends.png", "image/png");
assert.equal(dividendRows.length, 4, "Expected two dividends and two withholding-tax rows.");
assert.equal(dividendRows.filter((row) => row.rawPayload?.dividendType === "cash_dividend").length, 2);
assert.equal(dividendRows.filter((row) => row.rawPayload?.dividendType === "withholding_tax").length, 2);
assert.equal(dividendRows.find((row) => row.rawPayload?.dividendType === "cash_dividend")?.type, "income");
assert.equal(dividendRows.find((row) => row.rawPayload?.dividendType === "withholding_tax")?.type, "expense");
assert.ok(dividendRows.every((row) => row.currency === "USD"));

console.log("[PASS] GoTrade screenshots resolve positions, trades, dividends, and withholding tax with stable evidence.");
