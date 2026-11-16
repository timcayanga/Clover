import type { KnowledgeContent, KnowledgeEntry } from "@/lib/knowledge-types";

type BankGuide = Pick<KnowledgeContent, "title" | "summary" | "sections" | "questions" | "sources"> & { slug: string };

// These are practical institution guides, not a popularity ranking. Keep the
// account/channel limitations alongside the instructions when updating sources.
const banks: BankGuide[] = [
  {
    slug: "download-bdo-bank-statement",
    title: "How to download your BDO bank statement",
    summary: "Save an available eSOA from BDO Online on your phone or computer, then review the records in Clover.",
    sections: [
      { heading: "Choose your account in BDO Online", body: "Sign in through the official BDO Online app or website. Open Accounts, choose the account, and open Statements. Select the month and year you need. Availability depends on the account and statement periods shown by BDO." },
      { heading: "Save the statement", body: "In the app, use the share icon to save the file to your device. On the website, use the printer icon at the upper right to save or download the statement. Open the saved file and check that every page is included, not just the balance screen." },
    ],
    questions: [{ question: "What if Statements is unavailable for my account?", answer: "Ask BDO which statement service applies to that account and period. A recent-activity screen is not necessarily a complete monthly statement. Do not assume checking, savings, and credit-card accounts offer identical history." }],
    sources: [{ label: "BDO Online: viewing and downloading eSOA", url: "https://www.bdo.com.ph/personal/digital/bdo-online" }],
  },
  {
    slug: "get-unionbank-statement",
    title: "How to get your UnionBank statement",
    summary: "Find your UnionBank credit-card eSOA or request a deposit-account statement, keeping the two types of records separate.",
    sections: [
      { heading: "For a credit card, check your eSOA", body: "UnionBank sends credit-card statements as password-protected PDFs to the registered email address. Save the attachment and follow the bank’s password instructions. You can also view monthly statements through UnionBank Online. Check spam and your registered email details if a statement is missing." },
      { heading: "For a deposit account, request the right record", body: "UnionBank’s deposit-account FAQ directs customers to a branch or official phone/email support to request a statement. UnionBank Online also lets you view transactions. Confirm the available statement format, period, delivery method, and any fees with the bank; do not apply credit-card eSOA instructions to a savings account." },
    ],
    questions: [{ question: "Should a card repayment appear as another purchase?", answer: "Review the bank-account payment and the card-account repayment together in Clover. They may represent the same movement of money, not an additional purchase. Compare them with the original statements before confirming." }],
    sources: [
      { label: "UnionBank: credit-card eSOA FAQs", url: "https://www.unionbankph.com/e-soa-faqs" },
      { label: "UnionBank: deposit-account FAQs", url: "https://www.unionbankph.com/accounts/faq?report=1" },
    ],
  },
  {
    slug: "get-rcbc-bank-statement",
    title: "How to get your RCBC bank statement",
    summary: "Check statement eligibility for your RCBC account and distinguish a monthly statement from recent transaction history.",
    sections: [
      { heading: "Check which account you need", body: "RCBC’s Pulz FAQ says an enrolled checking account can have its Statement of Account viewed and downloaded through RCBC Online Banking, starting the calendar month after enrollment. Use the official RCBC channel to select that account and an available statement. Ask RCBC about savings-account statements rather than assuming the same eligibility." },
      { heading: "Do not confuse history with a statement", body: "The same FAQ describes current-day activity and up to 90 days of transaction history. That history is different from a monthly Statement of Account. For credit cards, RCBC Credit Cards Online has a Statement of Accounts tab; follow the card service’s instructions for the billing period you need." },
    ],
    questions: [{ question: "Why is there no statement immediately after enrollment?", answer: "RCBC’s published checking-account guidance starts statement availability in the next calendar month after online-banking enrollment. For older statements or another account type, ask RCBC which request process applies." }],
    sources: [
      { label: "RCBC Pulz FAQs: statements and transaction history", url: "https://www.rcbc.com/rcbc-pulz-faqs" },
      { label: "RCBC Credit Cards: statement assistance", url: "https://rcbccredit.com/contact-us" },
    ],
  },
  {
    slug: "download-security-bank-credit-card-statement",
    title: "How to download your Security Bank credit-card statement",
    summary: "Find your credit-card eStatement in the Security Bank app and prepare the saved file for review in Clover.",
    sections: [
      { heading: "Open the credit-card eStatement", body: "Log in to the official Security Bank app. Select your credit card from the dashboard, then choose View eStatement. Follow the available period and download options to save your statement. These instructions are specifically for credit cards, not a promise that deposit accounts use the same controls." },
      { heading: "Check the billing cycle", body: "Open the saved statement and verify the card, billing dates, currency, purchases, fees, and repayments. A billing period may span two calendar months. Keep the issuer’s amount due and due date as your reference; importing a statement into Clover does not pay the bill." },
    ],
    questions: [{ question: "What if I need a savings-account statement instead?", answer: "Use Security Bank’s official support to confirm the statement options for your deposit account. Do not use a credit-card statement as a substitute for savings-account records." }],
    sources: [{ label: "Security Bank: view or download a credit-card eSOA", url: "https://help.securitybank.com/how-can-i-view-andor-download-my-credit-card-electronic-statement-of-account-esoa-in-the-app?kb_language=en_US" }],
  },
  {
    slug: "download-chinabank-statement",
    title: "How to download your Chinabank statement",
    summary: "Use My CBC to find statements for eligible savings, current, or credit-card accounts and save the records you need.",
    sections: [
      { heading: "Find My Statements in My CBC", body: "Sign in to the official My CBC service, select the account, and open My Statements. Choose the statement date, then follow Chinabank’s current password instructions to open it. The bank lists this feature for savings accounts, current accounts, and credit cards." },
      { heading: "Save a complete copy", body: "Use the available save or download control in the statement viewer. Check the account name, dates, and all pages before uploading. If only recent transactions are visible, return to My Statements or ask Chinabank for the statement period you need." },
    ],
    questions: [{ question: "Is My CBC transaction history the same as an eSOA?", answer: "No. Chinabank describes transaction history and eSOA as separate features. Use a statement covering the period you want to organize; do not assume the activity list includes all months or the full billing cycle." }],
    sources: [{ label: "Chinabank: My CBC FAQs and My Statements", url: "https://www.chinabank.ph/mycbc-faqs" }],
  },
  {
    slug: "get-landbank-transaction-history",
    title: "How to get your LANDBANK transaction history",
    summary: "Review recent account activity through iAccess and request the appropriate statement when you need a longer or formal record.",
    sections: [
      { heading: "Check your enrolled account in iAccess", body: "Start from LANDBANK’s official banking channels and sign in to iAccess. Select the enrolled account and review its transaction history. The iAccess terms describe access to the last 90 days of history for eligible enrolled accounts; this is not a promise of an unlimited downloadable statement archive." },
      { heading: "Get the record for your required dates", body: "Check the dates visible in the service. If you need a formal statement, an older period, or cannot save a complete record, ask your LANDBANK branch or official support about the available request process, format, and charges. Do not label a partial history as a full monthly statement." },
    ],
    questions: [{ question: "Can I use a screenshot of recent transactions?", answer: "For review in Clover, use a clear screenshot with the account context, dates, descriptions, and amounts visible. Keep the original and avoid overlapping captures that repeat rows. A screenshot is not a bank-certified statement and may omit older activity." }],
    sources: [{ label: "LANDBANK iAccess: terms and transaction-history coverage", url: "https://lbpiaccess.com/login/infolink?i=6" }],
  },
  {
    slug: "download-cimb-philippines-statement",
    title: "How to download your CIMB Philippines bank statement",
    summary: "Generate a monthly eStatement in the CIMB Bank PH app and keep savings activity distinct from wallet transactions.",
    sections: [
      { heading: "Request an eStatement in CIMB Bank PH", body: "Open Accounts in the official CIMB Bank PH app. Choose View Details for your account, then Statement and Request for an eStatement. Continue, select the monthly period, and choose Generate. Use the download icon at the top right to save or share the file." },
      { heading: "Check the account and available month", body: "CIMB’s guidance says an account opened this month cannot generate its statement until the first day of the next month. Select the specific savings account you need. If you use GSave, keep its bank records separate from your GCash wallet history when reviewing transfers in Clover." },
    ],
    questions: [{ question: "Should I use CIMB Clicks instructions from another country?", answer: "Use the Philippines-specific CIMB Bank PH guidance linked here. CIMB services and menu names in other countries may differ. If your account has different options, check with CIMB Philippines support." }],
    sources: [{ label: "CIMB Bank PH: downloading a bank statement", url: "https://www.cimbbank.com.ph/en/help-and-support/faqs/savings-account/cimb-grow-account/can-i-download-a-bank-statement-for-my-account.html" }],
  },
  {
    slug: "request-gotyme-bank-statement",
    title: "How to request your GoTyme Bank statement",
    summary: "Request a statement through GoTyme’s official support channels, then organize the saved records in Clover.",
    sections: [
      { heading: "Request the statement through GoTyme", body: "GoTyme’s account terms provide a statement-request route through in-app chat, its customer-service hotline, or official support email. Use the contact details on the bank’s official page linked below. Specify the account and date range, and ask how the statement will be delivered and whether any fee applies." },
      { heading: "Check the delivered record", body: "When you receive the statement, check that it covers the requested account and dates. Save the original file on your device. Follow the bank’s instructions for a protected attachment; never send a banking password or one-time code to Clover." },
    ],
    questions: [{ question: "Is a bank certificate enough to import transactions?", answer: "A certificate may confirm an account or balance without listing individual transactions. Request a statement or transaction history with dates, descriptions, and amounts if you want to organize the activity in Clover." }],
    sources: [{ label: "GoTyme Bank: account terms and statement requests", url: "https://www.gotyme.com.ph/account-terms-and-conditions" }],
  },
];

export const philippineBankGuideSeeds: KnowledgeEntry[] = banks.map(({ slug, ...content }, index) => ({
  path: `/guides/${slug}`,
  order: 3 + index,
  content: {
    ...content,
    kind: "guide",
    category: "uploading-reviewing",
    market: "ph",
    reviewedAt: "2026-09-07",
    sections: [
      ...content.sections,
      { heading: "Upload and review in Clover", body: "Choose the correct Profile, then use Upload Files to select the saved record. Compare the extracted account, dates, amounts, transfers, and categories with the original before confirming. Keep the original for traceability. This is a file import, not a live connection to your bank." },
      { heading: "Keep your records private", body: "Download only your own records through the bank’s official service. Never share your bank login or one-time codes with Clover or support. For protected files, follow the bank’s instructions and Clover’s upload prompts. Menus and available periods can change; use the official sources below if your screen differs." },
    ],
  },
}));
