import type { HelpArticle, HelpSection } from "@/lib/help-center";

const article = (
  slug: string,
  title: string,
  summary: string,
  seoDescription: string,
  keywords: string[],
  steps: string[],
  questions: HelpArticle["questions"],
  links: HelpArticle["links"]
): HelpArticle => ({
  slug,
  title,
  summary,
  seoTitle: `${title} | Clover Help`,
  seoDescription,
  keywords,
  steps,
  questions,
  links,
});

export const currentProductHelpSections: HelpSection[] = [
  {
    slug: "profiles-accounts",
    eyebrow: "Your finances",
    title: "Profiles and accounts",
    summary: "Keep different financial lives separate while managing the accounts that belong to each one.",
    icon: "wallet",
    accent: "sky",
    keywords: [
      "profile",
      "profiles",
      "active profile",
      "personal profile",
      "accounts",
      "balances",
      "switch profile",
      "profile limit",
    ],
    searchPhrases: [
      "what is a Profile in Clover",
      "how to switch Profiles",
      "which Profile receives an import",
      "how many Profiles can I create",
    ],
    highlights: [
      "Your Clover account can contain more than one Profile.",
      "Each Profile keeps its own accounts, imports, transactions, and plans.",
      "The active Profile receives new imports and manual entries.",
    ],
    articles: [
      article(
        "profiles-and-your-clover-account",
        "Profiles and your Clover account",
        "Understand the difference between the account you sign in with and the Profiles you use to organize money.",
        "Learn how Clover Profiles separate accounts, transactions, imports, reports, and plans under one sign-in.",
        ["Clover Profile", "account vs Profile", "separate finances", "personal Profile"],
        [
          "Sign in with one Clover account.",
          "Use a Profile for each financial picture you want to keep separate.",
          "Check the active Profile before adding or importing data.",
        ],
        [
          {
            question: "What is a Profile in Clover?",
            answer:
              "A Profile is a private financial space inside your Clover account. Its accounts, transactions, imports, budgets, goals, reports, and investments stay separate from your other Profiles.",
          },
          {
            question: "How is my Clover account different from a Profile?",
            answer:
              "Your account is the identity you use to sign in. Profiles sit inside that account and let you organize separate financial pictures without creating another login.",
          },
          {
            question: "Can other people see my Profiles?",
            answer:
              "No. Profiles are private to your account. Sharing happens separately through Circles, where you choose what to share and with whom.",
          },
        ],
        [
          {
            label: "Open Profiles",
            href: "/settings?section=profiles",
            description: "View and switch your Profiles.",
          },
        ]
      ),
      article(
        "switch-rename-or-remove-a-profile",
        "Switch, rename, or remove a Profile",
        "Choose the right Profile before you work, and keep your list easy to recognize.",
        "Learn how to switch, rename, and remove Clover Profiles without mixing financial records.",
        ["switch Profile", "rename Profile", "remove Profile", "active Profile"],
        [
          "Open the Profile selector.",
          "Choose the Profile you want to use or edit.",
          "Review its accounts before importing or removing anything.",
        ],
        [
          {
            question: "How do I switch Profiles?",
            answer:
              "Use the Profile selector, then choose the Profile you want. Clover updates the app so you see the accounts and activity that belong to that Profile.",
          },
          {
            question: "Which Profile receives a new import?",
            answer:
              "The Profile that is active when you start the import receives the file and its results. Check the Profile name before uploading.",
          },
          {
            question: "What should I check before removing a Profile?",
            answer:
              "Review its accounts, transactions, imports, plans, and shared commitments first. Removing a Profile can affect all of the financial history stored inside it.",
          },
        ],
        [
          {
            label: "Open Profiles",
            href: "/settings?section=profiles",
            description: "Manage the Profiles in your account.",
          },
        ]
      ),
      article(
        "profile-limits-on-free-and-pro",
        "Profile limits on Free and Pro",
        "Know how many separate financial Profiles are included with each plan.",
        "Compare the Clover Profile limits included with Free and Pro.",
        ["Profile limit", "Free Profiles", "Pro Profiles", "plan limits"],
        [],
        [
          {
            question: "How many Profiles can I create?",
            answer:
              "Free supports up to 3 Profiles, including your Personal Profile. Pro supports up to 10 Profiles.",
          },
          {
            question: "What happens to my Profiles if I change plans?",
            answer:
              "Clover should keep your existing data intact. If your Profile count is above the new plan limit, review the plan guidance before creating or changing Profiles.",
          },
        ],
        [
          {
            label: "See pricing",
            href: "/pricing",
            description: "Compare Free and Pro.",
          },
        ]
      ),
    ],
    questions: [],
    links: [
      {
        label: "Open Profiles",
        href: "/settings?section=profiles",
        description: "Choose the financial Profile you want to use.",
      },
      {
        label: "Open accounts",
        href: "/accounts",
        description: "Review the accounts in the active Profile.",
      },
    ],
  },
  {
    slug: "modern-imports",
    eyebrow: "Bring in history",
    title: "Files, spreadsheets, and imports",
    summary: "Bring months of financial history into Clover from statements, images, spreadsheets, and manual entries.",
    icon: "inbox",
    accent: "lime",
    keywords: [
      "Excel",
      "XLSX",
      "CSV",
      "TSV",
      "multi-sheet",
      "multi-account",
      "screenshot",
      "statement",
      "receipt",
      "background import",
      "unknown institution",
    ],
    searchPhrases: [
      "how to import an Excel workbook into Clover",
      "can Clover import several accounts from one file",
      "what happens when Clover does not recognize my bank",
      "can I leave the page while an import is processing",
    ],
    highlights: [
      "Clover can read common statement, image, and spreadsheet formats.",
      "One workbook may contain several sheets, accounts, balances, or holdings.",
      "You can review uncertain results instead of accepting them blindly.",
    ],
    articles: [
      article(
        "import-spreadsheets-and-multi-account-files",
        "Import spreadsheets and multi-account files",
        "Use one spreadsheet to bring in transactions, accounts, balances, or holdings when the file is structured clearly.",
        "Learn how Clover handles Excel, CSV, TSV, multi-sheet, and multi-account financial imports.",
        ["Excel import", "CSV import", "TSV import", "multi-sheet workbook", "multi-account file"],
        [
          "Choose the active Profile.",
          "Upload the spreadsheet from Imports.",
          "Review the accounts, sheets, and rows Clover found before confirming them.",
        ],
        [
          {
            question: "Can Clover import Excel workbooks?",
            answer:
              "Yes. Clover can process supported Excel workbooks as well as CSV and TSV files. Clear column headings, dates, descriptions, and amounts help produce better results.",
          },
          {
            question: "Can one file contain more than one account or sheet?",
            answer:
              "Yes. Clover can inspect multi-sheet or multi-account files and separate the useful records. Review the proposed accounts and rows before confirming them.",
          },
          {
            question: "Can I import account balances or investments from a spreadsheet?",
            answer:
              "Yes, when the workbook includes recognizable account, balance, holding, or transaction data. Clover will show what it found so you can correct anything before saving.",
          },
        ],
        [
          {
            label: "Open Imports",
            href: "/imports",
            description: "Upload a spreadsheet or other financial file.",
          },
        ]
      ),
      article(
        "imports-from-unknown-banks-wallets-and-brokers",
        "Imports from unknown banks, wallets, and brokers",
        "Clover can still attempt a careful import when a file does not match a dedicated institution format.",
        "Learn what happens when Clover imports a file from an unfamiliar bank, wallet, broker, or service.",
        ["unknown bank", "unsupported institution", "wallet import", "broker import", "generic import"],
        [
          "Upload the clearest copy of the original file.",
          "Wait for Clover to identify its structure.",
          "Review every uncertain row, account, or holding before confirming it.",
        ],
        [
          {
            question: "What if my bank or provider is not listed?",
            answer:
              "You can still try the file. Clover first looks for a known format, then uses a more general parser when needed. Uncertain results should be sent for review.",
          },
          {
            question: "Why did Clover recognize only part of my file?",
            answer:
              "A file may mix summaries, transactions, balances, or layouts that are difficult to separate. Review what Clover found, then add missing records manually or try a clearer export.",
          },
          {
            question: "Should I confirm an import that looks incomplete?",
            answer:
              "No. Compare it with the source first. Correct the proposed data, upload a better copy, or add the missing records manually before confirming.",
          },
        ],
        [
          {
            label: "Open review",
            href: "/review",
            description: "Check uncertain import results.",
          },
        ]
      ),
      article(
        "background-import-processing-and-recovery",
        "Background import processing and recovery",
        "Understand what Clover does while a larger file is being processed and how to continue after an interruption.",
        "Learn how background import processing, progress, and recovery work in Clover.",
        ["background import", "processing import", "import progress", "recover import"],
        [],
        [
          {
            question: "Can I leave the page while an import is processing?",
            answer:
              "Yes. Larger imports can continue in the background. Return to Imports to check the latest status and review the results when processing finishes.",
          },
          {
            question: "What should I do if an import appears stuck?",
            answer:
              "Refresh Imports and check its status before uploading the same file again. If it failed, retry the original file. If it completed, review the result to avoid duplicates.",
          },
          {
            question: "Will Clover save a partially completed import?",
            answer:
              "Clover keeps import status and raw source information separate from confirmed transactions. A failed or incomplete import should not silently become confirmed financial history.",
          },
        ],
        [
          {
            label: "Check Imports",
            href: "/imports",
            description: "See the latest processing status.",
          },
        ]
      ),
    ],
    questions: [],
    links: [
      {
        label: "Open Imports",
        href: "/imports",
        description: "Upload and review financial records.",
      },
    ],
  },
  {
    slug: "recurring-commitments",
    eyebrow: "Stay prepared",
    title: "Recurring activity and commitments",
    summary: "Keep regular bills, income, installments, and money owed visible before they surprise you.",
    icon: "play",
    accent: "coral",
    keywords: [
      "recurring",
      "commitments",
      "subscriptions",
      "bills",
      "income",
      "installments",
      "money owed",
      "confirm recurring",
      "dismiss recurring",
    ],
    searchPhrases: [
      "how Clover detects recurring transactions",
      "how to add an upcoming bill",
      "why a recurring payment is missing",
      "how to confirm or dismiss a recurring pattern",
    ],
    highlights: [
      "Clover can suggest recurring patterns from transaction history.",
      "You decide whether a suggested pattern is real.",
      "Planned commitments help you prepare for money moving in or out.",
    ],
    articles: [
      article(
        "how-recurring-detection-works",
        "How recurring detection works",
        "Review patterns Clover notices in repeated transactions, then confirm only the ones that are real.",
        "Learn how Clover detects recurring bills and income and how to confirm or dismiss suggestions.",
        ["recurring detection", "confirm recurring", "dismiss recurring", "repeated transaction"],
        [
          "Open Recurring.",
          "Review the amount, timing, and merchant Clover noticed.",
          "Confirm the pattern or dismiss it if it is not truly recurring.",
        ],
        [
          {
            question: "How does Clover find recurring activity?",
            answer:
              "Clover looks for repeated transaction patterns such as similar merchants, amounts, and timing. A suggestion is not treated as confirmed until you review it.",
          },
          {
            question: "What happens when I dismiss a recurring suggestion?",
            answer:
              "Clover removes that suggestion from your active recurring view. Dismissing it does not delete the original transactions.",
          },
          {
            question: "Why is a recurring payment missing?",
            answer:
              "The history may be too short or the amount and timing may vary too much. Add the commitment manually or import more history, then review the recurring suggestions again.",
          },
        ],
        [
          {
            label: "Open Recurring",
            href: "/recurring",
            description: "Review detected and planned activity.",
          },
        ]
      ),
      article(
        "plan-bills-income-installments-and-money-owed",
        "Plan bills, income, installments, and money owed",
        "Add upcoming commitments yourself when you already know what is coming.",
        "Learn how to plan bills, income, installments, and money owed in Clover.",
        ["planned bill", "planned income", "installment", "money owed", "commitment"],
        [
          "Open Recurring and add a commitment.",
          "Choose whether money is coming in or going out.",
          "Set the expected amount and timing, then keep it updated.",
        ],
        [
          {
            question: "What is the difference between detected and planned recurring activity?",
            answer:
              "Detected activity comes from patterns in your transactions. Planned activity is something you add because you already know a bill, payment, installment, income, or amount owed is coming.",
          },
          {
            question: "Can I edit the next date or expected amount?",
            answer:
              "Yes. Update the commitment when its timing, amount, or status changes so your upcoming view stays useful.",
          },
          {
            question: "Does marking a commitment complete create a transaction?",
            answer:
              "A commitment and a confirmed transaction serve different purposes. Check the resulting activity and add or match the real transaction when the money actually moves.",
          },
        ],
        [
          {
            label: "Open Recurring",
            href: "/recurring",
            description: "Add or update a commitment.",
          },
        ]
      ),
    ],
    questions: [],
    links: [
      {
        label: "Open Recurring",
        href: "/recurring",
        description: "See regular and upcoming money movement.",
      },
    ],
  },
  {
    slug: "gain-insights-current",
    eyebrow: "Understand",
    title: "Reports and Adviser",
    summary: "Move from organized records to clear explanations, useful follow-ups, and practical next steps.",
    icon: "spark",
    accent: "gold",
    keywords: [
      "Adviser",
      "reports",
      "guidance",
      "follow-up",
      "recommendation",
      "alert",
      "insight",
      "confirmed action",
    ],
    searchPhrases: [
      "what can I ask Clover Adviser",
      "what data does Adviser use",
      "how are Reports different from Adviser",
      "how to act on a Clover recommendation",
    ],
    highlights: [
      "Reports organize what happened.",
      "Adviser explains patterns and helps you decide what to do next.",
      "You stay in control of any action that changes your financial data.",
    ],
    articles: [
      article(
        "reports-and-adviser-explained",
        "Reports and Adviser explained",
        "Use Reports for structured views and Adviser when you want an explanation or a next step.",
        "Understand the difference between Clover Reports and Adviser guidance.",
        ["Reports vs Adviser", "financial guidance", "financial reports", "insights"],
        [],
        [
          {
            question: "How are Reports and Adviser different?",
            answer:
              "Reports organize your financial activity into trends, balances, categories, and comparisons. Adviser helps explain what those patterns may mean and what deserves attention.",
          },
          {
            question: "What can I ask Adviser?",
            answer:
              "Ask about spending changes, cash flow, recurring costs, goals, budgets, account balances, or patterns you want to understand. Better organized data usually leads to more useful answers.",
          },
          {
            question: "What data does Adviser use?",
            answer:
              "Adviser uses the financial data available in your active Profile, such as confirmed transactions, accounts, budgets, goals, and relevant trends.",
          },
        ],
        [
          {
            label: "Open Adviser",
            href: "/adviser",
            description: "Ask about your financial picture.",
          },
          {
            label: "Open Reports",
            href: "/reports",
            description: "Review structured trends and summaries.",
          },
        ]
      ),
      article(
        "adviser-recommendations-alerts-and-actions",
        "Adviser recommendations, alerts, and actions",
        "Review why Clover raised a suggestion, then choose whether it should change anything.",
        "Learn how to review Clover Adviser recommendations, alerts, follow-ups, and proposed actions.",
        ["Adviser action", "recommendation", "alert", "follow-up", "confirm action"],
        [
          "Open the related recommendation or alert.",
          "Review the records and explanation behind it.",
          "Confirm an action only when it matches what you want.",
        ],
        [
          {
            question: "Does Adviser change my financial data automatically?",
            answer:
              "No. Guidance can suggest a next step, but changes to confirmed financial data should remain under your control.",
          },
          {
            question: "What should I do with an Adviser alert?",
            answer:
              "Open the related transactions, account, report, budget, or goal. Confirm that the pattern is real, then decide whether to adjust your plan or simply keep watching it.",
          },
          {
            question: "Can I ask a follow-up question?",
            answer:
              "Yes. Follow-ups help you narrow the time period, account, category, or decision you want to understand.",
          },
        ],
        [
          {
            label: "Open Adviser",
            href: "/adviser",
            description: "Review current guidance and follow-ups.",
          },
        ]
      ),
    ],
    questions: [],
    links: [
      {
        label: "Open Adviser",
        href: "/adviser",
        description: "Understand patterns and next steps.",
      },
      {
        label: "Open Reports",
        href: "/reports",
        description: "Explore your financial trends.",
      },
    ],
  },
  {
    slug: "plan-ahead-current",
    eyebrow: "Plan ahead",
    title: "Budgets and goals",
    summary: "Turn what Clover knows about your money into realistic limits, milestones, and better habits.",
    icon: "play",
    accent: "violet",
    keywords: [
      "budget",
      "budget period",
      "pause budget",
      "copy budget",
      "projected spending",
      "goal roadmap",
      "goal progress",
      "multi-currency",
    ],
    searchPhrases: [
      "how to create a realistic budget in Clover",
      "how to pause or copy a budget",
      "how projected spending works",
      "how Clover goal roadmaps work",
    ],
    highlights: [
      "Build budgets from real spending instead of a blank template.",
      "Pause, resume, or copy a plan when life changes.",
      "Use goals and roadmaps to turn a target into manageable progress.",
    ],
    articles: [
      article(
        "create-and-manage-a-budget",
        "Create and manage a budget",
        "Set realistic limits, choose a period, and adjust the plan as your needs change.",
        "Learn how to create, pause, resume, copy, and review budgets in Clover.",
        ["create budget", "budget period", "pause budget", "resume budget", "copy budget"],
        [
          "Open Budgeting and choose what you want to plan.",
          "Set the period and amount using your recent activity as a guide.",
          "Review actual and projected spending, then adjust when needed.",
        ],
        [
          {
            question: "Can Clover suggest a budget from my spending?",
            answer:
              "Yes. Your organized history can help Clover suggest a more realistic starting point. Review the suggestion before using it.",
          },
          {
            question: "Can I pause, resume, or copy a budget?",
            answer:
              "Yes. Pause a budget when it is temporarily irrelevant, resume it later, or copy an existing plan when a new period needs a similar setup.",
          },
          {
            question: "What does projected spending mean?",
            answer:
              "Projected spending estimates where the budget may end based on current activity. Treat it as an early signal, not a guaranteed result.",
          },
        ],
        [
          {
            label: "Open Budgeting",
            href: "/budgeting",
            description: "Create or review a spending plan.",
          },
        ]
      ),
      article(
        "goals-roadmaps-and-progress",
        "Goals, roadmaps, and progress",
        "Break a money target into steps and keep the latest activity connected to it.",
        "Learn how Clover goals, roadmaps, progress, and recommendations work.",
        ["goal roadmap", "goal progress", "savings goal", "debt goal", "goal recommendation"],
        [
          "Create a goal with a target and timing.",
          "Review the roadmap or suggested pace.",
          "Update progress and adjust the plan when your finances change.",
        ],
        [
          {
            question: "What is a goal roadmap?",
            answer:
              "A roadmap turns a target into smaller checkpoints or a suggested pace, helping you see whether your current progress is on track.",
          },
          {
            question: "How does Clover measure goal progress?",
            answer:
              "Progress can use the value, activity, or account information connected to the goal. Review the goal details when the number does not match what you expect.",
          },
          {
            question: "Can goals and budgets use different currencies?",
            answer:
              "Clover can keep currency context with financial records. Check the currency on the goal, budget, and connected accounts before comparing amounts.",
          },
        ],
        [
          {
            label: "Open Goals",
            href: "/goals",
            description: "Create or review a financial goal.",
          },
        ]
      ),
    ],
    questions: [],
    links: [
      {
        label: "Open Budgeting",
        href: "/budgeting",
        description: "Plan spending with real history.",
      },
      {
        label: "Open Goals",
        href: "/goals",
        description: "Track milestones and progress.",
      },
    ],
  },
  {
    slug: "investments-current",
    eyebrow: "Long-term view",
    title: "Investments",
    summary: "Keep holdings, activity, returns, and currencies visible beside the rest of your financial picture.",
    icon: "pricing",
    accent: "mint",
    keywords: [
      "investments",
      "holdings",
      "portfolio",
      "principal",
      "gain",
      "return",
      "dividend",
      "purchase",
      "price",
      "currency",
    ],
    searchPhrases: [
      "how to add investments to Clover",
      "how Clover calculates investment gains",
      "how to record dividends and purchases",
      "how investment prices and currencies work",
    ],
    highlights: [
      "Add holdings manually or import supported investment records.",
      "Separate principal, current value, gains, and income.",
      "Keep prices and currencies current for a clearer net worth view.",
    ],
    articles: [
      article(
        "add-or-import-investment-holdings",
        "Add or import investment holdings",
        "Build a portfolio from manual holdings or supported broker and spreadsheet records.",
        "Learn how to add or import investment accounts and holdings into Clover.",
        ["add investment", "import holdings", "broker statement", "portfolio"],
        [
          "Open Investments.",
          "Add a holding manually or import a supported record.",
          "Review the quantity, cost, currency, and current value.",
        ],
        [
          {
            question: "Can I import investment records?",
            answer:
              "Yes. Clover can process supported broker files and structured spreadsheets. Review every proposed account, holding, purchase, and dividend before confirming.",
          },
          {
            question: "Can I add a holding manually?",
            answer:
              "Yes. Add the asset, quantity, principal or cost information, currency, and any price details you want Clover to track.",
          },
          {
            question: "Why is an investment missing from net worth?",
            answer:
              "Check that the holding belongs to the active Profile, has a usable current value, and uses the expected currency. Correct or add any missing details.",
          },
        ],
        [
          {
            label: "Open Investments",
            href: "/investments",
            description: "Review accounts and holdings.",
          },
        ]
      ),
      article(
        "investment-values-returns-and-activity",
        "Investment values, returns, and activity",
        "Understand the numbers behind a holding and keep purchases, dividends, and prices up to date.",
        "Learn how Clover presents investment principal, value, gains, returns, purchases, dividends, prices, and currencies.",
        ["investment value", "principal", "gain", "return", "purchase", "dividend", "price"],
        [],
        [
          {
            question: "What is the difference between principal, value, gain, and return?",
            answer:
              "Principal is what you put in, current value is what the holding is worth now, gain is the value change in money terms, and return expresses performance relative to the amount invested.",
          },
          {
            question: "How do I record purchases or dividends?",
            answer:
              "Add or import the investment activity, then review the date, amount, asset, and currency so it updates the correct holding.",
          },
          {
            question: "What if a price or currency looks wrong?",
            answer:
              "Open the holding and check its price source, latest price, and currency. Correct stale or mismatched information before relying on the portfolio total.",
          },
          {
            question: "Which investment tools require Pro?",
            answer:
              "Free includes basic investment tracking. Pro adds the fuller portfolio tools and higher limits shown on the Pricing page.",
          },
        ],
        [
          {
            label: "Open Investments",
            href: "/investments",
            description: "Review portfolio values and activity.",
          },
          {
            label: "See pricing",
            href: "/pricing",
            description: "Compare basic and full investment tools.",
          },
        ]
      ),
    ],
    questions: [],
    links: [
      {
        label: "Open Investments",
        href: "/investments",
        description: "See your portfolio and holdings.",
      },
    ],
  },
  {
    slug: "grow-together-current",
    eyebrow: "Share clearly",
    title: "Circles and Split Bills",
    summary: "Share only what a group needs, divide expenses clearly, and keep payments and settlements visible.",
    icon: "wallet",
    accent: "rose",
    keywords: [
      "Circle",
      "Circles",
      "Split Bills",
      "shared expense",
      "payment request",
      "settlement",
      "participant",
      "roles",
      "invitation",
      "archive Circle",
    ],
    searchPhrases: [
      "what is a Circle in Clover",
      "what can Circle members see",
      "Circle vs Split Bills",
      "how to request or record a payment",
    ],
    highlights: [
      "Profiles stay private; Circles are shared intentionally.",
      "Split by item, equally, or with custom shares.",
      "Payment requests and settlements keep the remaining balance clear.",
    ],
    articles: [
      article(
        "circles-roles-and-privacy",
        "Circles, roles, and privacy",
        "Create a shared space without exposing the rest of your personal Profile.",
        "Learn how Clover Circles, roles, invitations, and privacy boundaries work.",
        ["Circle", "Circle role", "Organizer", "Member", "Participant", "Circle privacy"],
        [
          "Create or join a Circle.",
          "Review your role and the information shared with the group.",
          "Keep personal Profile data outside the Circle unless you choose to share it.",
        ],
        [
          {
            question: "What is a Circle?",
            answer:
              "A Circle is a shared space for people managing money together. It can hold shared expenses, budgets, goals, commitments, and selected summaries without merging everyone’s private Profiles.",
          },
          {
            question: "What can other Circle members see?",
            answer:
              "They can see information shared inside that Circle according to their role. They cannot automatically browse the accounts, transactions, or plans in your private Profiles.",
          },
          {
            question: "What do Organizer, Member, and Participant mean?",
            answer:
              "Organizers manage the Circle and its access. Members can take part in the shared areas available to them. Participants can be included in shared expenses even when they do not need full Circle access.",
          },
          {
            question: "How do invitations work?",
            answer:
              "An Organizer sends an invitation. The invited person joins with the intended role, and the Circle remains separate from their private Profile.",
          },
        ],
        [
          {
            label: "Open Circles",
            href: "/circles",
            description: "Create or manage a shared space.",
          },
        ]
      ),
      article(
        "circles-versus-split-bills",
        "Circles versus Split Bills",
        "Choose a quick expense split or a longer-running shared space.",
        "Understand when to use a Clover Circle and when a Split Bill is enough.",
        ["Circle vs Split Bill", "shared money", "group expense"],
        [],
        [
          {
            question: "When should I use Split Bills?",
            answer:
              "Use Split Bills for a specific shared expense, receipt, trip, meal, or balance you want to settle clearly.",
          },
          {
            question: "When should I use a Circle?",
            answer:
              "Use a Circle when the same group needs an ongoing place for shared expenses, budgets, goals, commitments, or selected financial summaries.",
          },
          {
            question: "Can a Split Bill belong to a Circle?",
            answer:
              "Yes. A Circle can keep group expenses together while still showing who paid, who owes, and what has been settled.",
          },
          {
            question: "Can I leave or archive a Circle?",
            answer:
              "You can leave when your role and outstanding responsibilities allow it. Organizers can archive a Circle when the group no longer needs an active shared space.",
          },
        ],
        [
          {
            label: "Open Circles",
            href: "/circles",
            description: "Review your shared spaces.",
          },
          {
            label: "Open Split Bills",
            href: "/split-bill",
            description: "Create or settle a shared expense.",
          },
        ]
      ),
      article(
        "split-by-item-request-payment-and-settle",
        "Split by item, request payment, and settle",
        "Match each person to what they owe and keep the payment trail easy to understand.",
        "Learn how to split receipts by item, request payments, add participants, and record settlements in Clover.",
        ["split by item", "payment request", "settlement", "non-user participant", "transfer"],
        [
          "Create a Split Bill from a receipt or transaction.",
          "Split equally, assign items, or enter custom shares.",
          "Send or record payments, then confirm the remaining balance.",
        ],
        [
          {
            question: "Can I split a receipt by item?",
            answer:
              "Yes. Assign items to the people who shared them, handle shared items as needed, and review the total before saving.",
          },
          {
            question: "Can I include someone who does not use Clover?",
            answer:
              "Yes. Add them as a participant so their share and payments can still be tracked without giving them access to your private Profile.",
          },
          {
            question: "What is the difference between a payment request and a settlement?",
            answer:
              "A payment request tells someone what is due. A settlement records money that actually changed hands and reduces the outstanding balance.",
          },
          {
            question: "What if a payment was recorded incorrectly?",
            answer:
              "Open the shared expense, review its payment or transfer history, and correct the mistaken record so the remaining balances match reality.",
          },
        ],
        [
          {
            label: "Open Split Bills",
            href: "/split-bill",
            description: "Manage shared expenses and settlements.",
          },
        ]
      ),
    ],
    questions: [],
    links: [
      {
        label: "Open Circles",
        href: "/circles",
        description: "Manage ongoing shared money.",
      },
      {
        label: "Open Split Bills",
        href: "/split-bill",
        description: "Divide and settle expenses.",
      },
    ],
  },
  {
    slug: "security-controls-current",
    eyebrow: "Stay in control",
    title: "Access, sharing, and data controls",
    summary: "See who is signed in, what is shared, and how to remove files or financial data.",
    icon: "shield",
    accent: "teal",
    keywords: [
      "sessions",
      "signed-in devices",
      "sign out device",
      "sharing privacy",
      "delete file",
      "wipe data",
      "delete account",
      "Circle access",
    ],
    searchPhrases: [
      "how to see signed in devices in Clover",
      "how to sign out another device",
      "who can see my Clover data",
      "delete an upload vs delete my account",
    ],
    highlights: [
      "Review and close sessions you no longer recognize.",
      "Profiles stay private unless you share selected information through a Circle.",
      "Deleting a file, wiping financial data, and deleting an account are different actions.",
    ],
    articles: [
      article(
        "manage-signed-in-devices-and-sessions",
        "Manage signed-in devices and sessions",
        "Review where your account is signed in and close access you no longer recognize.",
        "Learn how to review Clover sessions and sign out another device.",
        ["sessions", "devices", "sign out device", "account access"],
        [
          "Open Settings and find security or session controls.",
          "Review the devices and recent sessions.",
          "Close any session you do not recognize or no longer use.",
        ],
        [
          {
            question: "How do I see where my account is signed in?",
            answer:
              "Open the session or security controls in Settings. Review the listed sessions and their recent activity.",
          },
          {
            question: "Can I sign out another device?",
            answer:
              "Yes. End the session you no longer want active. If you see access you do not recognize, also secure your sign-in credentials.",
          },
          {
            question: "Why did Clover ask me to sign in again?",
            answer:
              "A session may have expired, been closed, or failed a security check. Sign in again, then review your active sessions if the behavior was unexpected.",
          },
        ],
        [
          {
            label: "Open Settings",
            href: "/settings",
            description: "Review account and security controls.",
          },
        ]
      ),
      article(
        "who-can-see-shared-and-private-data",
        "Who can see shared and private data",
        "Understand the boundary between your private Profiles and information shared through Circles.",
        "Learn who can access Clover Profiles, Circles, shared expenses, and selected financial information.",
        ["private Profile", "Circle privacy", "shared data", "who can see my data"],
        [],
        [
          {
            question: "Can another Clover user see my Profile?",
            answer:
              "No. Another user does not gain access to your private Profile simply because you share a Circle or Split Bill.",
          },
          {
            question: "What can I share through a Circle?",
            answer:
              "A Circle can contain shared expenses, budgets, goals, commitments, and selected summaries. Only add information the group needs.",
          },
          {
            question: "Does joining a Circle merge our finances?",
            answer:
              "No. Each person keeps their own private Profiles. The Circle is a separate shared space with explicit access.",
          },
        ],
        [
          {
            label: "Open Circles",
            href: "/circles",
            description: "Review shared spaces and access.",
          },
        ]
      ),
      article(
        "delete-files-financial-data-or-your-account",
        "Delete files, financial data, or your account",
        "Choose the right removal option for the information you no longer want Clover to keep.",
        "Understand the difference between deleting an upload, wiping Clover financial data, and deleting your Clover account.",
        ["delete upload", "delete file", "wipe data", "delete account", "remove financial data"],
        [],
        [
          {
            question: "What is the difference between deleting a file and deleting its transactions?",
            answer:
              "The source file and the confirmed financial records created from it are separate. Review both before deleting so you remove exactly what you intend.",
          },
          {
            question: "What does wiping financial data do?",
            answer:
              "A wipe is broader than deleting one upload. It is intended to remove the applicable Clover financial records while leaving the sign-in account available.",
          },
          {
            question: "What happens when I delete my Clover account?",
            answer:
              "Account deletion closes your Clover access and starts the applicable deletion process for account-related data. Treat it as a final action and review any shared responsibilities first.",
          },
        ],
        [
          {
            label: "Open Settings",
            href: "/settings",
            description: "Find account and data controls.",
          },
        ]
      ),
    ],
    questions: [],
    links: [
      {
        label: "Open Settings",
        href: "/settings",
        description: "Manage sessions and data.",
      },
      {
        label: "Read the Privacy Policy",
        href: "/privacy-policy",
        description: "Review Clover’s public privacy terms.",
      },
    ],
  },
];
