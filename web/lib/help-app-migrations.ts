import type { HelpArticle } from "@/lib/help-center";

const template = { label: "Download the Clover migration CSV", href: "/templates/clover-migration.csv", description: "Replace every example row with your own history before uploading." };
const commonQuestions: HelpArticle["questions"] = [
  { question: "What moves into Clover?", answer: "Recognized transaction tables preserve dates, amounts, original currencies, account names, notes, categories and available labels. Category groups become a readable path such as Food / Lunch. Split components remain separate rows. Budgets, recurring schedules, attachments, goals, opening balances and the other app's settings do not automatically migrate with a transaction export." },
  { question: "What if Clover cannot recognize my export?", answer: "Export layouts vary by app version and language. Copy the transaction data into Clover's migration template, retaining its headings. Use YYYY-MM-DD dates and an explicit Income, Expense, Transfer In or Transfer Out type. Include each account's original Currency, such as PHP or IDR. Do not substitute a converted home-currency amount for the original amount. Remove all example rows before uploading." },
  { question: "Can I upload overlapping history?", answer: "Clover checks repeat imports against previously imported rows in the same Profile and account. Stable transaction IDs are preferred; without IDs, identical occurrences are compared. Renamed accounts, edited descriptions and different export layouts can prevent a match. Start with a short date range and inspect it before importing the rest. Matches do not overwrite confirmed transactions. Connected-bank matches use the existing bank overlap checks, which may require review when evidence is ambiguous." },
  { question: "How do I check the result?", answer: "Compare the transaction count and income, expense and transfer totals for the same accounts, currencies and dates in both apps. Pending, void and summary rows are skipped. Excluded entries stay excluded when the export supplies that flag. A transaction export may omit starting balances, so matching transaction totals does not guarantee matching account balances. Keep the original export until you have checked the result." },
];
const make = (slug: string, title: string, summary: string, steps: string[], source: { label: string; href: string }, extra: HelpArticle["questions"] = []): HelpArticle => ({
  slug, title, summary, seoTitle: `${title} | Clover Help`, seoDescription: summary,
  keywords: [title, "migration", "CSV", "Excel", "import history", "switch to Clover"],
  steps: [...steps, "In Clover, select the Profile that should receive the history. Open Add Transaction, select Upload and choose your transaction file.", "Check the new transactions and account assignments before uploading another date range."],
  questions: [...extra, ...commonQuestions],
  links: [template, { ...source, description: "Current instructions from the source app." }, { label: "Open Transactions", href: "/transactions", description: "Upload and check your history." }],
});

export const appMigrationHelpArticles: HelpArticle[] = [
  make("import-from-realbyte", "Import from Money Manager by Realbyte", "Move Realbyte transaction history using a spreadsheet with explicit accounts, categories and transaction types.", [
    "Save a separate backup in Realbyte, then export your transaction history as Excel. A SQLite backup is not a transaction spreadsheet and cannot be uploaded for this migration.",
    "Check for Date (or Period), Account (or Accounts), Category, Subcategory, Note, Amount and Income/Expense columns. Clover recognizes this column profile. If your export differs, use the Clover template.",
    "Realbyte's documented import-template dates use MM/DD/YYYY. Prefer YYYY-MM-DD when preparing a Clover template. Include Currency when accounts use different currencies; otherwise select the intended account currency before uploading.",
  ], { label: "Realbyte spreadsheet format", href: "https://help.realbyteapps.com/hc/en-us/articles/360043536233-How-to-import-bulk-data-by-Excel-file" }, [
    { question: "How are Realbyte transfers handled?", answer: "In the documented Transfer out format, Account is the sender and Category is the recipient. Clover keeps the outgoing transfer and creates a receiving leg when the file does not already contain it. For transfers between different currencies, use the Clover template with two explicit legs and each account's actual amount and currency." },
  ]),
  make("import-from-money-lover", "Import from Money Lover", "Export Money Lover history to CSV or Google Sheets, then bring the transaction table into Clover.", [
    "On iOS, open Account, Settings, Export CSV. On Android, open Account, Tools, Export CSV. Select the wallets, categories and date range you need.",
    "Save CSV with comma, semicolon or tab separators. If exporting to Google Sheets, download the sheet as CSV or Excel.",
    "The supported column profile includes Date, Wallet, Category, Amount and Note, with explicit Type and Currency where needed. If unsigned amounts do not include income/expense direction, add it in the Clover template rather than guessing.",
  ], { label: "Money Lover export instructions", href: "https://moneylover.zendesk.com/hc/en-us/articles/36369130766617-Export-to-Google-Sheet-CSV" }),
  make("import-from-wallet", "Import from Wallet by BudgetBakers", "Move Wallet records using CSV or Excel while keeping original account currencies.", [
    "Wallet export requires its Premium feature. On Android, open Others, Export; choose the accounts and dates, include account transfers if needed, and choose CSV or XLS.",
    "On the web, open Records, apply filters, select the records and choose Export to CSV or XLS. Wallet's iOS app currently directs users to the web app for export.",
    "Clover recognizes the Account, Category, Amount and Currency profile with Payment Type or Reference Currency Amount. Keep Type for income/expense direction. Reference-currency amounts are not substituted for original amounts. Use the Clover template if the layout differs.",
  ], { label: "Wallet export instructions", href: "https://support.budgetbakers.com/hc/en-us/articles/7151606064018-How-to-export-transactions-from-Wallet" }),
  make("import-from-bluecoins", "Import from Bluecoins", "Bring Bluecoins transaction rows, labels and split components into Clover using CSV.", [
    "Open a transaction list in Bluecoins and export Excel (.csv). Use a transaction-level export rather than a budget or balance-sheet summary.",
    "Clover recognizes the published standard/advanced CSV template column profile: Type, Date, Item or Payee, Amount, Parent Category, Category, Account Type, Account, Notes, Label, Status and Split. The advanced profile also contains Currency and Conversion Rate. If your report export differs, map it into Clover's template.",
    "Keep both signed legs of each transfer and every split component. Include original currencies. Clover keeps split components as separate transactions, retains labels as tags, and skips void entries.",
  ], { label: "Bluecoins export and CSV guide", href: "https://www.bluecoinsapp.com/guide/import-export/" }),
  {
    slug: "use-clover-migration-template", title: "Use the Clover migration template", summary: "Prepare a predictable transaction spreadsheet when an app export has a different layout.",
    seoTitle: "Use the Clover migration template | Clover Help", seoDescription: "Map transaction dates, accounts, currencies, categories and tags into Clover's downloadable migration CSV.",
    keywords: ["migration template", "CSV template", "spreadsheet migration", "import another app"],
    steps: ["Download the template below. Keep its header row and remove all four example transactions.", "Keep Migration Source set to spreadsheet. Fill Date in YYYY-MM-DD, Description, Amount, Currency, Account and Type. Use Income, Expense, Transfer In or Transfer Out. Record both transfer legs with each account's own amount and currency.", "Category and Subcategory preserve your category path. Separate Tags with semicolons. Excluded accepts true or false. Use a stable Transaction ID if the original export has one; do not invent new IDs each time you export.", "Save as CSV, TSV, XLSX, XLS or ODS and upload from Add Transaction in the correct Clover Profile. If Clover reports a row error, correct that row and retry. No transactions from an invalid recognized table are added."],
    questions: commonQuestions, links: [template, { label: "Open Transactions", href: "/transactions", description: "Upload your prepared history." }],
  },
];
