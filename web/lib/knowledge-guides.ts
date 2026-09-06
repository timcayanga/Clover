import type { KnowledgeEntry } from "@/lib/knowledge-types";

export const guideSeeds: KnowledgeEntry[] = [
  {
    path: "/guides/download-bpi-bank-statement",
    order: 0,
    content: {
      kind: "guide",
      category: "uploading-reviewing",
      market: "ph",
      title: "How to download your BPI bank statement",
      summary:
        "Find your statement in the BPI app, save the file, then bring it into Clover to organize and review the transactions.",
      reviewedAt: "2026-09-06",
      sections: [
        {
          heading: "Find your statement in BPI",
          body: "Sign in to the official BPI app. Open Other Services, then My Statements. Choose the relevant deposit account, investment account, or credit card and select the statement period. Confirm your selection and use Download to save the file. These labels follow BPI’s published eStatement instructions; available periods and menus may differ by account or app version.",
        },
        {
          heading: "Check the file before importing",
          body: "Open the downloaded file on your own device and check the account and covered dates. Keep the original. Never share a banking password or one-time code with Clover or support. If the file is protected, follow the institution’s instructions and Clover’s upload prompts.",
        },
        {
          heading: "Organize it in Clover",
          body: "Select the right Profile, upload the statement, and compare the extracted records with the original. Review account assignments, dates, amounts, and categories before confirming. A downloaded statement is a snapshot of a period, not a live bank connection.",
        },
      ],
      questions: [
        {
          question: "What if no statement is available?",
          answer:
            "Use BPI’s official support to check eligibility and available periods for your account. Do not assume every account has the same statement history.",
        },
      ],
      sources: [
        {
          label: "BPI: eStatement instructions",
          url: "https://www.bpi.com.ph/about-bpi/sustainability/sustainable-with-you/products-and-services/e-statement",
        },
      ],
    },
  },
  {
    path: "/guides/export-gcash-transaction-history",
    order: 1,
    content: {
      kind: "guide",
      category: "uploading-reviewing",
      market: "ph",
      title: "How to export your GCash transaction history",
      summary:
        "Request your own transaction history through GCash, download the emailed PDF, and use it to review your wallet activity in Clover.",
      reviewedAt: "2026-09-06",
      sections: [
        {
          heading: "Request the history in GCash",
          body: "Open Transactions in the official GCash app. Scroll to Request transaction history, verify the email address, choose the dates you need, and submit the request. GCash’s published instructions allow requests covering up to four years. You can request only your own history.",
        },
        {
          heading: "Download the emailed PDF",
          body: "Find the transaction-history email and save the attachment. Follow GCash’s password instructions to open it. If the email is missing, check spam, available inbox space, and the email address in your GCash account. Consult the official guide below if the PDF will not open.",
        },
        {
          heading: "Bring wallet activity into Clover",
          body: "Upload the file to the correct Profile. Review the wallet account, dates, merchants, fees, and transfers before confirming. When a transaction also appears on a bank statement, check whether it is a transfer between your own accounts rather than a second expense.",
        },
      ],
      questions: [
        {
          question: "Can I delete a transaction from GCash history?",
          answer:
            "GCash says transactions cannot be deleted from its history. Editing your records in Clover does not change GCash’s records.",
        },
      ],
      sources: [
        {
          label: "GCash: Request transaction history",
          url: "https://help.gcash.com/hc/en-us/articles/360034155433-How-to-request-transaction-history",
        },
      ],
    },
  },
  {
    path: "/guides/download-metrobank-statement",
    order: 2,
    content: {
      kind: "guide",
      category: "uploading-reviewing",
      market: "ph",
      title: "How to download a Metrobank statement",
      summary:
        "Use Metrobank’s official statement service to obtain a PDF of your deposit-account records, then review the imported details in Clover.",
      reviewedAt: "2026-09-06",
      sections: [
        {
          heading: "Use Metrobank’s official statement service",
          body: "Metrobank’s Statements of Account help page directs customers to statements.metrobank.com.ph for PDF statements using their Metrobank Online credentials. Start from Metrobank’s official website or the source below and check the domain before signing in. Follow the available account and statement-period choices in the service.",
        },
        {
          heading: "Check the account and period",
          body: "Save the statement and check its account details and date coverage. This guide concerns deposit-account statements; credit-card and business banking channels may differ. If your statement is unavailable, ask Metrobank which service applies to your account.",
        },
        {
          heading: "Upload and review in Clover",
          body: "Choose the appropriate Profile and upload the saved file. Compare the extracted dates, amounts, account, and balances with the original. Review uncertain details before confirming. Keep the PDF so you can trace a transaction back to its source.",
        },
      ],
      questions: [
        {
          question: "Does Clover download the statement from my bank?",
          answer:
            "This workflow starts with a file you download yourself. Uploading it does not give Clover your Metrobank Online login or create an ongoing bank connection.",
        },
      ],
      sources: [
        {
          label: "Metrobank: Statements of Account",
          url: "https://www.metrobank.com.ph/help/accounts-and-banking-services/statements-of-account?faq=where_can_i_view_my_statements_of_account_soas",
        },
      ],
    },
  },
  {
    path: "/guides/track-expenses-multiple-bank-accounts",
    order: 3,
    content: {
      kind: "guide",
      category: "manage-money",
      market: "all",
      title: "How to track expenses across multiple bank accounts",
      summary:
        "Keep each account recognizable while bringing its transactions into one financial picture. Start with matching date ranges and review transfers carefully.",
      sections: [
        {
          heading: "Gather records for the same period",
          body: "Choose a month and collect statements or exports for the accounts and wallets you want to include. Make a small checklist with the account, currency, and dates covered. Missing weeks can make spending look lower than it really was.",
        },
        {
          heading: "Keep accounts separate within one Profile",
          body: "Use one Clover Profile for the financial picture you want to understand together. Upload the records and check that each belongs to the right account. Use clear account names so a wallet balance is not confused with a bank balance.",
        },
        {
          heading: "Review transfers and overlapping files",
          body: "Money moving between your own accounts is not automatically new income or a purchase. Review both sides of transfers and any overlapping statement periods. Do not confirm two records simply because their descriptions differ.",
        },
        {
          heading: "Read the combined view",
          body: "Use Transactions to search activity and Reports to understand changes. Check the date and currency filters before comparing totals. Return to the original records when something does not reconcile.",
        },
      ],
      questions: [
        {
          question: "Should I create one Profile per bank?",
          answer:
            "Not if you want those banks in one financial picture. Accounts distinguish banks and wallets within a Profile. Separate Profiles are useful when you want genuinely separate sets of finances.",
        },
      ],
      sources: [],
      screenshot: "/assets/landing-screens/accounts-ph.webp",
      screenshotAlt:
        "Actual Clover Accounts screen showing fictional sample accounts",
    },
  },
  {
    path: "/guides/organize-credit-card-transactions",
    order: 4,
    content: {
      kind: "guide",
      category: "manage-money",
      market: "all",
      title: "How to organize credit-card transactions",
      summary:
        "Separate purchases, fees, refunds, and repayments so your card statement is easier to understand and compare with your other accounts.",
      sections: [
        {
          heading: "Start with the statement period",
          body: "A card billing cycle may not match a calendar month. Keep the statement dates and currency visible while reviewing purchases. Preserve raw descriptions so a shortened merchant name can still be checked against the statement.",
        },
        {
          heading: "Review different transaction types",
          body: "Check purchases, interest, fees, refunds, and payments separately. A payment from your bank account to your card should not be mistaken for a second purchase. Check installment entries against the statement rather than assuming the full purchase repeats each month.",
        },
        {
          heading: "Confirm details in Clover",
          body: "Upload the statement to the right Profile and check the card account assignment. Review extracted amounts, dates, categories, and possible duplicates. Use Recurring to organize commitments you need to follow, and refer to your issuer for the authoritative amount due and due date.",
        },
      ],
      questions: [
        {
          question: "Does organizing a card statement pay the bill?",
          answer:
            "No. Recording or categorizing activity in Clover does not make a payment to the card issuer.",
        },
      ],
      sources: [],
      screenshot: "/assets/landing-screens/transactions-ph.webp",
      screenshotAlt:
        "Actual Clover Transactions screen using fictional sample records",
    },
  },
  {
    path: "/guides/budgeting-multiple-bank-accounts",
    order: 5,
    content: {
      kind: "guide",
      category: "plan-ahead",
      market: "all",
      title: "How to organize a budget with multiple bank accounts",
      summary:
        "Build your budget around a complete set of records, rather than treating each bank balance as a separate spending allowance.",
      sections: [
        {
          heading: "Define which money belongs in this budget",
          body: "List the accounts included in your personal financial picture. Keep money that belongs to a different purpose or person clearly separated. Check that the history you use covers the same dates across accounts.",
        },
        {
          heading: "Clean the history before setting targets",
          body: "Review transfers, refunds, recurring payments, and missing records. Account balances and spending totals answer different questions. A transfer into another account does not by itself show that your spending has increased.",
        },
        {
          heading: "Create a plan you can revisit",
          body: "Use Clover’s Budgeting page to create a budget based on the records you have reviewed. Keep separate savings purposes in Goals. Revisit the plan when commitments change; a budget or goal in Clover does not move money or guarantee affordability.",
        },
      ],
      questions: [],
      sources: [],
      screenshot: "/assets/landing-screens/budget-ph.webp",
      screenshotAlt:
        "Actual Clover Budgeting interface showing a fictional sample budget",
    },
  },
];
