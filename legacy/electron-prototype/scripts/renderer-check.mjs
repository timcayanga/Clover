import { readFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import * as XLSX from "xlsx";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const html = await readFile("index.html", "utf8");
const appJs = await readFile("app.js", "utf8");

const bootApp = async (loadedState = null) => {
  let savedState = null;

  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: new URL("../index.html", import.meta.url).href,
  });

  const { window } = dom;
  window.XLSX = XLSX;
  window.financeManager = {
    loadState: async () => loadedState,
    saveState: async (items) => {
      savedState = items.map((item) => ({ ...item, issue: item.issue ? { ...item.issue } : null }));
      return { ok: true };
    },
  };

  window.eval(appJs);

  for (let i = 0; i < 20; i += 1) {
    if (window.document.querySelector("#line-item-list .line-item")) break;
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  return { window, getSavedState: () => savedState };
};

const readPdfText = async (filePath, password = "") => {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const task = pdfjs.getDocument({ data, password: password || undefined, disableWorker: true });
  const pdf = await task.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str || "").join(" ");
    pages.push(text);
  }

  return pages.join("\n");
};

const readPdfTextOrFallback = async (filePath, fallbackText, password = "") => {
  if (fs.existsSync(filePath)) {
    return readPdfText(filePath, password);
  }
  return fallbackText;
};

const firstBoot = await bootApp();
const { window } = firstBoot;

window.document.querySelector('[data-screen="line-items"]').click();

if (!window.document.querySelector(".warning-chip")) {
  throw new Error("Renderer QA failed: expected a warning triangle for the seeded review item");
}

const importedCsv = `date,merchant,amount,category,notes\n2026-04-13,QA Income,12345.67,Income,renderer check`;
window.financeManager.importStatementText(importedCsv, "qa-statement.csv");

await new Promise((resolve) => window.setTimeout(resolve, 0));

const savedState = firstBoot.getSavedState();
if (!savedState || !savedState.some((item) => item.merchant === "QA Income")) {
  throw new Error("Renderer QA failed: the imported statement row was not saved");
}

const secondBoot = await bootApp(savedState);
const secondWindow = secondBoot.window;
const renderedNames = Array.from(
  secondWindow.document.querySelectorAll("#line-item-list .line-item .item-merchant")
).map((node) => node.value || node.textContent || "");

if (!renderedNames.includes("QA Income")) {
  throw new Error("Renderer QA failed: saved state did not restore on restart");
}

const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.aoa_to_sheet([
  ["date", "merchant", "amount", "category", "notes"],
  ["2026-04-14", "QA Grocery", "42.50", "Food & Dining", "sheet import"],
]);
XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
const xlsxBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

await firstBoot.window.financeManager.importSpreadsheetFile({
  name: "qa-statement.xlsx",
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  arrayBuffer: async () => xlsxBuffer,
});

await new Promise((resolve) => firstBoot.window.setTimeout(resolve, 0));

const xlsxSavedState = firstBoot.getSavedState();
if (!xlsxSavedState || !xlsxSavedState.some((item) => item.merchant === "QA Grocery")) {
  throw new Error("Renderer QA failed: spreadsheet import was not saved");
}

const airlineReceiptText = `
Issuing office: INTERNET WEB, MANILA, PHILIPPINES
Date: 22Feb2026
Passenger: Cayanga Margarita Ms (ADT)
ELECTRONIC TICKET RECEIPT
Operated by: PHILIPPINE AIRLINES
Fare: USD 360.00
Total Amount: USD 459.80
`;

window.financeManager.importStatementText(airlineReceiptText, "Electronic Ticket Receipt 02APR for MARGARITA CAYANGA.pdf");

await new Promise((resolve) => firstBoot.window.setTimeout(resolve, 0));

const airlineSavedState = firstBoot.getSavedState();
const airlineItem = airlineSavedState?.find((item) => item.merchant === "Philippine Airlines");

if (!airlineItem) {
  throw new Error("Renderer QA failed: airline receipt was not imported");
}

if (airlineItem.date !== "2026-02-22") {
  throw new Error(`Renderer QA failed: expected airline date 2026-02-22, got ${airlineItem.date}`);
}

if (airlineItem.type !== "expense") {
  throw new Error(`Renderer QA failed: expected airline type expense, got ${airlineItem.type}`);
}

if (airlineItem.category !== "Travel & Lifestyle") {
  throw new Error(`Renderer QA failed: expected airline category Travel & Lifestyle, got ${airlineItem.category}`);
}

if (Math.abs(Number(airlineItem.amount) - 27588) > 0.01) {
  throw new Error(`Renderer QA failed: expected airline amount PHP 27588, got ${airlineItem.amount}`);
}

if (String(airlineItem.notes || "") !== "Flight ticket receipt") {
  throw new Error(`Renderer QA failed: expected concise airline notes, got ${airlineItem.notes}`);
}

const categoryExamplesText = `
2026-04-01|Jetstar|12999.00|fare
2026-04-02|Single Origin|420.00|latte
2026-04-03|Airbnb|8000.00|stay
2026-04-04|LinkedIn|2400.00|annual membership fee
2026-04-05|OpenAI|1200.00|subscription renewal
2026-04-06|Brunos Barbers|350.00|haircut
2026-04-07|Flowerstore|1290.00|flowers
2026-04-08|Airalo|199.00|esim
2026-04-09|MITSUKOSHI BGC PARKING TAGUIG CITY|100.00|parking
2026-04-10|PUREGOLD ALPHALAND MAKATI|2345.00|grocery run
`;

window.financeManager.importStatementText(categoryExamplesText, "qa-category-examples.txt");

await new Promise((resolve) => firstBoot.window.setTimeout(resolve, 0));

const categoryExampleState = firstBoot.getSavedState();
const categoryExpectations = [
  ["Jetstar", "Travel & Lifestyle"],
  ["Single Origin", "Food & Dining"],
  ["Airbnb", "Housing"],
  ["LinkedIn", "Bills & Utilities"],
  ["OpenAI", "Bills & Utilities"],
  ["Brunos Barbers", "Other"],
  ["Flowerstore", "Shopping"],
  ["Airalo", "Bills & Utilities"],
  ["MITSUKOSHI BGC PARKING TAGUIG CITY", "Transport"],
  ["PUREGOLD ALPHALAND MAKATI", "Food & Dining"],
];

for (const [merchant, category] of categoryExpectations) {
  const item = categoryExampleState?.find((entry) => entry.merchant === merchant);
  if (!item) {
    throw new Error(`Renderer QA failed: expected category example merchant ${merchant} to be imported`);
  }
  if (item.category !== category) {
    throw new Error(`Renderer QA failed: expected ${merchant} to be ${category}, got ${item.category}`);
  }
}

const decemberApp = await bootApp(airlineSavedState);
const decemberWindow = decemberApp.window;
const decemberPdfText = await readPdfTextOrFallback(
  "/Users/TimCayanga1/Downloads/Electronic Ticket Receipt 28DEC for TIMOTHY GUNTHER CAYANGA.pdf",
  `
ELECTRONIC TICKET RECEIPT
Operated by: PHILIPPINE AIRLINES
Date: 28Dec2025
Passenger: Cayanga Timothy Gunther
Fare: PHP 13158.00
ELECTRONIC MISCELLANEOUS DOCUMENT RECEIPT (EMD)
Service 1 Seat Reservation 28Dec2025
Amount: PHP 250.00
ELECTRONIC MISCELLANEOUS DOCUMENT RECEIPT (EMD)
Service 2 Seat Reservation 28Dec2025
Amount: PHP 300.00
`
);

decemberWindow.financeManager.importStatementText(
  decemberPdfText,
  "Electronic Ticket Receipt 28DEC for TIMOTHY GUNTHER CAYANGA.pdf"
);

await new Promise((resolve) => decemberWindow.setTimeout(resolve, 0));

const decemberSavedState = decemberApp.getSavedState();
const decemberItems = decemberSavedState?.filter((item) => item.merchant === "Philippine Airlines" && item.category === "Travel & Lifestyle") || [];

if (decemberItems.length < 3) {
  throw new Error("Renderer QA failed: December PAL receipt did not produce the ticket plus both seat reservations");
}

const rcbcApp = await bootApp(decemberSavedState);
const rcbcWindow = rcbcApp.window;
const rcbcPdfText = await readPdfTextOrFallback(
  "/Users/TimCayanga1/Downloads/eStatement_VISA PLATINUM_MAR 22 2026_1014.pdf",
  `
VISA PLATINUM
AMOUNT DESCRIPTION POST DATE SALE DATE
123.45 03/22/26 03/22/26 GRAB RIDE
114.00 03/22/26 03/22/26 LAZADA ORDER
797.00 03/22/26 03/22/26 GLOBE BILL PAYMENT
50.00- 03/22/26 03/22/26 CASH PAYMENT TO WISE
`,
  "12261997"
);

rcbcWindow.financeManager.importStatementText(rcbcPdfText, "eStatement_VISA PLATINUM_MAR 22 2026_1014.pdf");

await new Promise((resolve) => rcbcWindow.setTimeout(resolve, 0));

const rcbcSavedState = rcbcApp.getSavedState();
const expectedMerchants = ["Grab", "Lazada", "Globe", "Cash Payment"];

for (const merchant of expectedMerchants) {
  const item = rcbcSavedState?.find((entry) => entry.merchant === merchant);
  if (!item) {
    throw new Error(`Renderer QA failed: expected RCBC merchant ${merchant} to be imported`);
  }
}

const grabItem = rcbcSavedState.find((entry) => entry.merchant === "Grab");
if (grabItem.category !== "Transport") {
  throw new Error(`Renderer QA failed: expected Grab to be Transport, got ${grabItem.category}`);
}

const rcbcLazadaItem = rcbcSavedState.find((entry) => entry.merchant === "Lazada");
if (rcbcLazadaItem.category !== "Shopping") {
  throw new Error(`Renderer QA failed: expected Lazada to be Shopping, got ${rcbcLazadaItem.category}`);
}

const globeItem = rcbcSavedState.find((entry) => entry.merchant === "Globe");
if (globeItem.category !== "Bills & Utilities") {
  throw new Error(`Renderer QA failed: expected Globe to be Bills & Utilities, got ${globeItem.category}`);
}

const cashPaymentItem = rcbcSavedState.find((entry) => entry.merchant === "Cash Payment");
if (cashPaymentItem.type !== "transfer") {
  throw new Error(`Renderer QA failed: expected Cash Payment to be transfer, got ${cashPaymentItem.type}`);
}

const lazadaApp = await bootApp(rcbcSavedState);
const lazadaWindow = lazadaApp.window;
const lazadaPdfText = await readPdfTextOrFallback(
  "/Users/TimCayanga1/Downloads/Gmail - Order Being Processed #1083032916846830.pdf",
  `
Tim Cayanga <timcayanga@gmail.com> Your order is being processed Lazada <no-reply@lazada.com>
Order details
Order ID: 1083032916846830
Order Date: 14 Apr 2026 10:40 PM
Seller: Lazada
Total (VAT included): ₱114.00
`
);

lazadaWindow.financeManager.importStatementText(
  lazadaPdfText,
  "Gmail - Order Being Processed #1083032916846830.pdf"
);

await new Promise((resolve) => lazadaWindow.setTimeout(resolve, 0));

const lazadaSavedState = lazadaApp.getSavedState();
const lazadaItem = lazadaSavedState?.find((entry) => entry.merchant === "Lazada");

if (!lazadaItem) {
  throw new Error("Renderer QA failed: Lazada order PDF was not imported");
}

if (lazadaItem.category !== "Shopping") {
  throw new Error(`Renderer QA failed: expected Lazada category Shopping, got ${lazadaItem.category}`);
}

if (Math.abs(Number(lazadaItem.amount) - 114) > 0.01) {
  throw new Error(`Renderer QA failed: expected Lazada amount PHP 114, got ${lazadaItem.amount}`);
}

const shopeeApp = await bootApp(lazadaSavedState);
const shopeeWindow = shopeeApp.window;
const shopeePdfText = await readPdfTextOrFallback(
  "/Users/TimCayanga1/Downloads/Gmail - Your payment has been confirmed.pdf",
  `
Tim Cayanga <timcayanga@gmail.com> Your payment has been confirmed Shopee <info@mail.shopee.ph>
Order details
Order ID: 251207PA6609HW
Order Date: 07 Dec 2025 08:34:20
Seller: yykingdom.ph
1. Ugreen Smart Tag Smart Locator
Total Payment: ₱515.00
`
);

shopeeWindow.financeManager.importStatementText(
  shopeePdfText,
  "Gmail - Your payment has been confirmed.pdf"
);

await new Promise((resolve) => shopeeWindow.setTimeout(resolve, 0));

const shopeeSavedState = shopeeApp.getSavedState();
const shopeeItem = shopeeSavedState?.find((entry) => entry.merchant === "Shopee");

if (!shopeeItem) {
  throw new Error("Renderer QA failed: Shopee order PDF was not imported");
}

if (shopeeItem.category !== "Shopping") {
  throw new Error(`Renderer QA failed: expected Shopee category Shopping, got ${shopeeItem.category}`);
}

if (Math.abs(Number(shopeeItem.amount) - 515) > 0.01) {
  throw new Error(`Renderer QA failed: expected Shopee amount PHP 515, got ${shopeeItem.amount}`);
}

const bpiApp = await bootApp(shopeeSavedState);
const bpiWindow = bpiApp.window;
const bpiStructuredPages = [
  {
    pageNumber: 3,
    text: `
PERIOD COVERED OCT 07, 2025 - JAN 07, 2026
DATE DESCRIPTION REF DETAILS DEBIT AMOUNT CREDIT AMOUNT BALANCE
Oct 09 Fund Transfer FROM: Egbert Chad L Cayanga 029 PHP 37,500.00 PHP 536,367.67
Oct 10 ATM Withdrawal PHP 5,000.00 PHP 531,367.67
Dec 31 Interest Earned 85.15 PHP 536,452.82
Dec 31 Tax Withheld 17.03 PHP 536,435.79
`,
    items: [
      { str: "PERIOD COVERED OCT 07, 2025 - JAN 07, 2026", x: 36, y: 655.2 },
      { str: "DATE", x: 36, y: 628.2 },
      { str: "DESCRIPTION", x: 97.2, y: 628.2 },
      { str: "REF", x: 199.8, y: 628.2 },
      { str: "DETAILS", x: 266.4, y: 628.2 },
      { str: "DEBIT AMOUNT", x: 375.9, y: 628.2 },
      { str: "CREDIT AMOUNT", x: 444.9, y: 628.2 },
      { str: "BALANCE", x: 522.0, y: 628.2 },
      { str: "Oct", x: 36.0, y: 581.4 },
      { str: "09", x: 49.0, y: 581.4 },
      { str: "Fund", x: 65.4, y: 581.4 },
      { str: "Transfer", x: 83.2, y: 581.4 },
      { str: "FROM: Egbert", x: 223.2, y: 581.4 },
      { str: "Chad L", x: 276.2, y: 581.4 },
      { str: "Cayanga", x: 303.6, y: 581.4 },
      { str: "37,500.00", x: 471.9, y: 581.4 },
      { str: "536,367.67", x: 540.0, y: 581.4 },
      { str: "Oct", x: 36.0, y: 577.2 },
      { str: "10", x: 50.0, y: 577.2 },
      { str: "ATM", x: 65.4, y: 577.2 },
      { str: "Withdrawal", x: 84.0, y: 577.2 },
      { str: "5,000.00", x: 471.9, y: 577.2 },
      { str: "531,367.67", x: 540.0, y: 577.2 },
      { str: "Dec", x: 36.0, y: 573.3 },
      { str: "31", x: 50.4, y: 573.3 },
      { str: "Interest", x: 65.4, y: 573.3 },
      { str: "Earned", x: 101.9, y: 573.3 },
      { str: "85.15", x: 485.4, y: 573.3 },
      { str: "536,452.82", x: 540.0, y: 573.3 },
      { str: "Dec", x: 36.0, y: 565.5 },
      { str: "31", x: 50.4, y: 565.5 },
      { str: "Tax", x: 65.4, y: 565.5 },
      { str: "Withheld", x: 81.0, y: 565.5 },
      { str: "17.03", x: 414.6, y: 565.5 },
      { str: "536,435.79", x: 540.0, y: 565.5 },
    ],
  },
];

bpiWindow.financeManager.importStatementText(
  bpiStructuredPages[0].text,
  "SA20260110 Q4 2025 Personal.pdf",
  bpiStructuredPages
);

await new Promise((resolve) => bpiWindow.setTimeout(resolve, 0));

const bpiSavedState = bpiApp.getSavedState();
const bpiSalaryLike = bpiSavedState?.find((entry) => entry.source === "BPI" && Number(entry.amount) === 37500);
const bpiAtmWithdrawal = bpiSavedState?.find((entry) => entry.source === "BPI" && Number(entry.amount) === 5000);
const bpiTaxItem = bpiSavedState?.find((entry) => entry.source === "BPI" && Number(entry.amount) === 17.03);

if (!bpiSalaryLike || bpiSalaryLike.type !== "income") {
  throw new Error("Renderer QA failed: expected BPI credit to import as income");
}

if (!bpiAtmWithdrawal || bpiAtmWithdrawal.type !== "expense") {
  throw new Error("Renderer QA failed: expected BPI ATM withdrawal to import as expense");
}

if (!bpiTaxItem || bpiTaxItem.type !== "expense") {
  throw new Error("Renderer QA failed: expected BPI debit to import as expense");
}

const unionbankApp = await bootApp(shopeeSavedState);
const unionbankWindow = unionbankApp.window;
const unionbankStructuredPages = [
  {
    pageNumber: 1,
    text: `
TRANSACTION HISTORY AS OF APRIL 15, 2026 Date Check No. Ref. No. Description Debit Credit Balance
02/27/26 S55852782 Not Applicable PHP 106,799.95 PHP 255,412.10
02/07/26 UB133811 BILLS PAYMENT PHP 12,895.23 PHP 148,612.15
02/05/26 UB496167 ONLINE FUND TRANSFER PHP 1,080.00 PHP 161,507.38
`,
    items: [
      { str: "TRANSACTION HISTORY AS OF APRIL 15, 2026", x: 34, y: 600 },
      { str: "Date", x: 34, y: 567 },
      { str: "Check No.", x: 134, y: 567 },
      { str: "Ref. No.", x: 189, y: 567 },
      { str: "Description", x: 290, y: 567 },
      { str: "Debit", x: 349, y: 567 },
      { str: "Credit", x: 399, y: 567 },
      { str: "Balance", x: 525, y: 567 },
      { str: "02/27/26", x: 34, y: 537 },
      { str: "S55852782", x: 134, y: 537 },
      { str: "Not Applicable", x: 189, y: 537 },
      { str: "PHP 106,799.95", x: 399, y: 537 },
      { str: "PHP 255,412.10", x: 492, y: 537 },
      { str: "02/07/26", x: 34, y: 507 },
      { str: "UB133811", x: 134, y: 507 },
      { str: "BILLS PAYMENT", x: 189, y: 507 },
      { str: "PHP 12,895.23", x: 349, y: 507 },
      { str: "PHP 148,612.15", x: 492, y: 507 },
      { str: "02/05/26", x: 34, y: 477 },
      { str: "UB496167", x: 134, y: 477 },
      { str: "ONLINE FUND TRANSFER", x: 189, y: 477 },
      { str: "PHP 1,080.00", x: 399, y: 477 },
      { str: "PHP 161,507.38", x: 492, y: 477 },
    ],
  },
];

unionbankWindow.financeManager.importStatementText(
  unionbankStructuredPages[0].text,
  "UnionBank SOA February 2026.pdf",
  unionbankStructuredPages
);

await new Promise((resolve) => unionbankWindow.setTimeout(resolve, 0));

const unionbankSavedState = unionbankApp.getSavedState();
const salaryCreditItem = unionbankSavedState?.find((entry) => entry.source === "UnionBank" && Number(entry.amount) === 106799.95);
const billsPaymentItem = unionbankSavedState?.find((entry) => entry.merchant === "BILLS PAYMENT");
const fundTransferItem = unionbankSavedState?.find((entry) => entry.merchant === "ONLINE FUND TRANSFER");

if (!salaryCreditItem || salaryCreditItem.type !== "income") {
  throw new Error("Renderer QA failed: expected UnionBank salary credit to import as income");
}

if (!billsPaymentItem || billsPaymentItem.type !== "transfer") {
  throw new Error("Renderer QA failed: expected UnionBank bills payment to import as a transfer");
}

if (!fundTransferItem || fundTransferItem.type !== "transfer") {
  throw new Error("Renderer QA failed: expected UnionBank fund transfer to import as a transfer");
}

const bdoApp = await bootApp(unionbankSavedState);
const bdoWindow = bdoApp.window;
const bdoStructuredPages = [
  {
    pageNumber: 1,
    text: `
BDO STATEMENT OF ACCOUNT
DATE PARTICULARS WITHDRAWAL DEPOSIT BALANCE
01/05/26 Income - Acme Corp PHP 106,799.95 255,412.10
01/07/26 ATM Withdrawal PHP 5,000.00 250,412.10
`,
    items: [
      { str: "BDO STATEMENT OF ACCOUNT", x: 34, y: 612 },
      { str: "DATE", x: 34, y: 578 },
      { str: "PARTICULARS", x: 122, y: 578 },
      { str: "WITHDRAWAL", x: 352, y: 578 },
      { str: "DEPOSIT", x: 448, y: 578 },
      { str: "BALANCE", x: 540, y: 578 },
      { str: "01/05/26", x: 34, y: 548 },
      { str: "Income - Acme Corp", x: 122, y: 548 },
      { str: "PHP 106,799.95", x: 448, y: 548 },
      { str: "255,412.10", x: 540, y: 548 },
      { str: "01/07/26", x: 34, y: 518 },
      { str: "ATM Withdrawal", x: 122, y: 518 },
      { str: "PHP 5,000.00", x: 352, y: 518 },
      { str: "250,412.10", x: 540, y: 518 },
    ],
  },
];

bdoWindow.financeManager.importStatementText(
  bdoStructuredPages[0].text,
  "BDO SOA January 2026.pdf",
  bdoStructuredPages
);

await new Promise((resolve) => bdoWindow.setTimeout(resolve, 0));

const bdoSavedState = bdoApp.getSavedState();
const bdoSalary = bdoSavedState?.find((entry) => entry.source === "BDO" && Number(entry.amount) === 106799.95);
const bdoWithdrawal = bdoSavedState?.find((entry) => entry.source === "BDO" && Number(entry.amount) === 5000);

if (!bdoSalary || bdoSalary.type !== "income") {
  throw new Error("Renderer QA failed: expected BDO credit to import as income");
}

if (!bdoWithdrawal || !["expense", "transfer"].includes(bdoWithdrawal.type)) {
  throw new Error("Renderer QA failed: expected BDO withdrawal to import as expense or transfer");
}

const filterSeedState = [
  ...(bdoSavedState || []),
  {
    id: "qa-cash-source",
    date: "2026-04-15",
    type: "expense",
    merchant: "QA Cash Source",
    amount: 1,
    category: "Transport",
    source: "Cash",
    notes: "source filter test",
  },
  {
    id: "qa-unionbank-source",
    date: "2026-04-15",
    type: "income",
    merchant: "QA UnionBank Source",
    amount: 2,
    category: "Income",
    source: "UnionBank",
    notes: "source filter test",
  },
];

console.log("Renderer QA passed: warnings render and statement imports save, restore, and spreadsheet import works.");
