export type HelpQuestion = {
  question: string;
  answer: string;
};

export type HelpLink = {
  label: string;
  href: string;
  description: string;
};

export type HelpArticle = {
  slug: string;
  title: string;
  summary: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
  steps: string[];
  questions: HelpQuestion[];
  links: HelpLink[];
};

export type HelpSection = {
  slug: string;
  eyebrow: string;
  title: string;
  summary: string;
  icon: "spark" | "inbox" | "play" | "wallet" | "pricing" | "shield" | "storage" | "wrench";
  accent: "teal" | "mint" | "gold" | "sky" | "coral" | "violet" | "lime" | "rose";
  keywords: string[];
  highlights: string[];
  searchPhrases: string[];
  articles: HelpArticle[];
  questions: HelpQuestion[];
  links: HelpLink[];
};

export type HelpSearchResult = {
  kind: "section" | "article";
  title: string;
  summary: string;
  href: string;
  sectionSlug: string;
  sectionTitle: string;
  articleSlug?: string;
};

const createArticle = (
  slug: string,
  title: string,
  summary: string,
  seoDescription: string,
  keywords: string[],
  steps: string[],
  questions: HelpQuestion[],
  links: HelpLink[]
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

export const helpSections: HelpSection[] = [
  {
    slug: "getting-started",
    eyebrow: "Start here",
    title: "Getting started",
    summary: "Create your Clover account, finish onboarding, and make your first import without getting lost.",
    icon: "spark",
    accent: "teal",
    keywords: ["start", "setup", "onboarding", "getting started", "first steps", "home page", "workspace", "imports"],
    searchPhrases: [
      "how to set up Clover for the first time",
      "how to start using Clover",
      "what to do after signing up",
      "what to upload first in Clover",
    ],
    highlights: [
      "Create your account and finish onboarding.",
      "Pick a workspace and start from Home.",
      "Upload a statement, receipt, screenshot, or manual entry.",
    ],
    articles: [
      createArticle(
        "how-to-set-up-clover-for-the-first-time",
        "How to set up Clover for the first time",
        "Follow the first-run setup flow, choose a workspace, and prepare your first import.",
        "Step-by-step guidance for setting up Clover for the first time, including onboarding, Home, and your first workspace.",
        ["setup", "first time setup", "onboarding", "workspace", "home"],
        [
          "Create your Clover account.",
          "Complete onboarding and choose your starter workspace.",
          "Open Home to confirm you are in the right place.",
          "Upload your first statement, receipt, screenshot, or manual entry.",
          "Check the parsed result before you add more files.",
        ],
        [
          {
            question: "How do I set up Clover for the first time?",
            answer:
              "Start with account creation, then finish onboarding so Clover can prepare a workspace and guide you into your first import.",
          },
          {
            question: "What should I do after signing up for Clover?",
            answer:
              "Pick the setup flow, choose a workspace, open Home, and upload one clear file so you can verify the import is working as expected.",
          },
        ],
        [
          {
            label: "Open onboarding",
            href: "/onboarding",
            description: "Continue the first-time setup flow.",
          },
        ]
      ),
      createArticle(
        "what-to-upload-first-to-clover",
        "What to import first in Clover",
        "Choose the right first file so Clover can build the cleanest starting point.",
        "Learn what to import first in Clover and how to choose a file that is easy to verify.",
        ["first upload", "first statement", "receipts", "statement upload", "screenshots", "manual entry"],
        [
          "Pick a statement, receipt, or screenshot that covers one account or time period.",
          "Use a file with clean, readable descriptions if possible.",
          "Add manual entries later when you want to fill gaps or adjust older months.",
        ],
        [
          {
            question: "What is the best first file to import?",
            answer:
              "Pick a statement, receipt, or screenshot that clearly covers one account and one time period. That makes the first review much easier.",
          },
          {
            question: "Can I upload more files later?",
            answer:
              "Yes. Start with one clean file, then add more statements, receipts, screenshots, or manual entries as you build confidence in the workflow.",
          },
        ],
        [
          {
            label: "Open imports",
            href: "/imports",
            description: "Upload your first file.",
          },
        ]
      ),
      createArticle(
        "what-to-do-after-signing-up",
        "What to do after signing up for Clover",
        "A quick checklist for the minutes right after you create an account.",
        "A beginner-friendly checklist for what to do immediately after signing up for Clover.",
        ["after signing up", "new account", "starter checklist"],
        [
          "Finish onboarding.",
          "Choose the workspace where your finances should live.",
          "Open Home and check the current account state.",
          "Upload a statement.",
          "Open Transactions to confirm Clover read it correctly.",
        ],
        [
          {
            question: "Do I need to configure everything before I start?",
            answer:
              "No. Clover works well when you start with the basics and come back later for the rest of the setup.",
          },
          {
            question: "Can I revisit onboarding later?",
            answer:
              "Yes. You can return to setup steps later if you want to keep moving without slowing yourself down.",
          },
        ],
        [
          {
            label: "Open help home",
            href: "/help",
            description: "Browse other starting guides.",
          },
        ]
      ),
      createArticle(
        "how-to-choose-your-first-workspace-in-clover",
        "How to choose your first workspace in Clover",
        "Pick the right workspace before you upload your first files.",
        "Learn how to choose your first workspace in Clover so your accounts and imports stay organized from the start.",
        ["choose workspace", "first workspace", "workspace setup"],
        [
          "Look for the finance set you want to keep together.",
          "Create or open that workspace before uploading files.",
          "Keep future imports in the same workspace for consistency.",
        ],
        [
          {
            question: "What is the best workspace to start with?",
            answer:
              "Start with the workspace that matches the financial picture you want to organize first, such as your personal accounts or one business set.",
          },
          {
            question: "Can I add more workspaces later?",
            answer:
              "Yes. You can begin with one workspace and add more later when you want to separate different parts of your finances.",
          },
        ],
        [
          {
            label: "Open accounts",
            href: "/accounts",
            description: "Check the workspace you are using.",
          },
        ]
      ),
    ],
    questions: [
      {
        question: "What is the fastest way to start using Clover?",
        answer:
          "Sign up, complete onboarding, and upload one statement first. That gives Clover enough data to build your first accounts, transactions, and review queue.",
      },
      {
        question: "What should I upload first?",
        answer:
          "Start with the statement or receipt that covers the account you want to understand first. Once that looks right, you can add more files and accounts.",
      },
      {
        question: "Do I need to set everything up at once?",
        answer:
          "No. Clover works best when you start small. You can add more accounts, imports, and settings later as you get comfortable.",
      },
      {
        question: "How do I set up Clover for the first time?",
        answer:
          "Create your account, choose or accept the starter workspace, and follow the onboarding prompts until you reach the first import step.",
      },
      {
        question: "What is the best first file to upload?",
        answer:
          "Pick a statement or receipt that clearly covers one account and one time period. That makes it easier to confirm the first import is correct.",
      },
      {
        question: "Can I come back to onboarding later?",
        answer:
          "Yes. If you want to move quickly, you can return to the setup flow later and keep building out the workspace at your own pace.",
      },
    ],
    links: [
      {
        label: "Open onboarding",
        href: "/onboarding",
        description: "Finish the first-time setup flow.",
      },
      {
        label: "Learn about imports",
        href: "/help/importing-reviewing",
        description: "See how Clover handles files and review.",
      },
    ],
  },
  {
    slug: "importing-reviewing",
    eyebrow: "Statements",
    title: "Importing and reviewing",
    summary: "Upload statements, receipts, screenshots, or manual entries, then review parsed data before confirming it.",
    icon: "inbox",
    accent: "lime",
    keywords: ["import", "uploads", "upload", "review", "parsing", "parser", "files", "statements", "receipts", "screenshots", "manual entry"],
    searchPhrases: [
      "how to import statements into Clover",
      "how to upload receipts to Clover",
      "how to review imported data in Clover",
      "what file types does Clover support",
    ],
    highlights: [
      "Upload statements, receipts, screenshots, or manual entries from the right workspace.",
      "Check parsed rows before they become confirmed data.",
      "Low-confidence results should go to review.",
    ],
    articles: [
      createArticle(
        "how-to-import-statements-receipts-and-screenshots-into-clover",
        "How to import statements, receipts, and screenshots into Clover",
        "Use the import flow to upload a file or add a transaction manually, then review the parsed rows.",
        "Step-by-step guide to importing statements, receipts, and screenshots into Clover and checking the parsed output.",
        ["import statement", "statement upload", "bank statement import", "receipt upload", "screenshot import", "manual entry"],
        [
          "Open Imports.",
          "Choose the workspace and upload your file.",
          "Wait for Clover to parse the file or add the transaction manually.",
          "Review the output before confirming anything.",
        ],
        [
          {
            question: "What happens after I upload a file?",
            answer:
              "Clover processes the file, extracts rows, and presents the results so you can check whether the data looks right before confirming it. Manual entries follow the same review mindset.",
          },
          {
            question: "Can I upload another file for the same account?",
            answer:
              "Yes. You can add more files as needed, especially when you are building a fuller history for one workspace or account.",
          },
        ],
        [
          {
            label: "Open imports",
            href: "/imports",
            description: "Upload and manage files.",
          },
        ]
      ),
      createArticle(
        "how-to-review-imported-transactions-in-clover",
        "How to review imported transactions in Clover",
        "Check parsed rows, fix mismatches, and confirm what Clover imported.",
        "Learn how to review imported data in Clover, correct parsing issues, and confirm results safely.",
        ["review imported transactions", "parsed rows", "confirm transactions"],
        [
          "Open the imported file or review queue.",
          "Compare the parsed text with the source file.",
          "Correct amounts, dates, merchants, or categories.",
          "Confirm only when the row looks right.",
        ],
        [
          {
            question: "Why did Clover flag my rows for review?",
            answer:
              "Clover flags rows when parsing confidence is low or when a row looks like it needs a human check before it should become confirmed data.",
          },
          {
            question: "How do I review a parsed statement in Clover?",
            answer:
              "Open the imported file or review queue, compare the parsed rows against the original text, and fix any dates, amounts, or merchant names that do not match.",
          },
        ],
        [
          {
            label: "Open review",
            href: "/review",
            description: "Resolve items that need attention.",
          },
        ]
      ),
      createArticle(
        "supported-import-file-types-and-passwords",
        "Supported import file types and passwords",
        "Know what Clover can handle and what to do when a file is password-protected.",
        "Find out which file uploads Clover supports and how to handle password-protected statements.",
        ["supported file types", "password protected file", "import troubleshooting", "png", "jpg", "jpeg", "webp", "heic", "heif", "pdf", "csv", "receipts", "screenshots"],
        [
          "Use PDF, CSV, or supported image files that match Clover’s import flow.",
          "If prompted, enter the document password.",
          "Re-run the import after unlocking the file.",
        ],
        [
          {
            question: "What file types does Clover support for imports?",
            answer:
              "Clover supports PDF, CSV, PNG, JPG, JPEG, WEBP, HEIC, and HEIF imports. The exact behavior still depends on the import flow you are using.",
          },
          {
            question: "What should I do if Clover asks for a file password?",
            answer:
              "Enter the correct statement password if the file uses one, then re-run the import so Clover can read the protected content.",
          },
        ],
        [
          {
            label: "Open imports",
            href: "/imports",
            description: "Try the file again from the upload flow.",
          },
        ]
      ),
      createArticle(
        "how-to-fix-an-import-in-clover",
        "How to fix an import in Clover",
        "Recover from a messy upload by checking the source file and re-running the import.",
        "Learn how to fix a bad import in Clover when the parsed rows do not match the original file.",
        ["bad import", "fix import", "re-import", "parsed rows"],
        [
          "Compare the parsed rows with the original statement.",
          "Check whether the file was incomplete or password protected.",
          "Re-upload the file once the problem is corrected.",
        ],
        [
          {
            question: "What should I do if the import looks wrong?",
            answer:
              "Check the source file first, then compare the parsed output row by row. If the issue came from an incomplete or protected file, re-run the import after fixing that input.",
          },
          {
            question: "Can I import the same file again?",
            answer:
              "Yes, you can re-import after correcting the file or unlocking it. Just make sure you are reviewing the result so you do not create duplicates.",
          },
        ],
        [
          {
            label: "Open review",
            href: "/review",
            description: "Check the imported rows carefully.",
          },
        ]
      ),
    ],
    questions: [
      {
        question: "What happens after I upload a statement?",
        answer:
          "Clover processes the file, extracts rows, and presents the results so you can check whether the data looks right before confirming it.",
      },
      {
        question: "What should I do if parsing looks off?",
        answer:
          "Open the imported file or the review flow, compare the original wording with the parsed rows, and correct anything that looks wrong.",
      },
      {
        question: "Can I upload another file for the same account?",
        answer:
          "Yes. You can add more files as needed, especially when you are building a fuller history for one workspace or account.",
      },
      {
        question: "What file types does Clover support for imports?",
        answer:
          "Clover supports PDF, CSV, PNG, JPG, JPEG, WEBP, HEIC, and HEIF imports. The exact behavior still depends on the import flow you are using.",
      },
      {
        question: "How do I review a parsed statement in Clover?",
        answer:
          "Open the imported file or review queue, compare the parsed rows against the original text, and fix any dates, amounts, or merchant names that do not match.",
      },
      {
        question: "Why did Clover flag my rows for review?",
        answer:
          "Clover flags rows when parsing confidence is low or when a row looks like it needs a human check before it should become confirmed data.",
      },
    ],
    links: [
      {
        label: "Open imports",
        href: "/imports",
        description: "Upload and manage files.",
      },
      {
        label: "Open review",
        href: "/review",
        description: "Check items that need attention.",
      },
    ],
  },
  {
    slug: "transactions-categories",
    eyebrow: "Daily use",
    title: "Transactions and categories",
    summary: "Edit transactions, clean up merchants, and keep categories consistent as your data grows.",
    icon: "play",
    accent: "mint",
    keywords: ["transactions", "categories", "merchant", "spend", "categorize", "edit", "split", "review", "manual entry", "merchant rules"],
    searchPhrases: [
      "how to change a transaction category in Clover",
      "how to edit a transaction",
      "how Clover learns categories",
      "how to keep merchant names consistent",
    ],
    highlights: [
      "Transactions are the main place to make manual corrections.",
      "Merchant names and categories should stay readable.",
      "Confirmed rows should not be changed silently.",
    ],
    articles: [
      createArticle(
        "how-to-change-a-transaction-category-in-clover",
        "How to change a transaction category in Clover",
        "Edit one row at a time and let Clover learn from the change.",
        "Learn how to change a transaction category in Clover and keep future categorization more consistent.",
        ["change category", "edit transaction", "transaction category"],
        [
          "Open Transactions.",
          "Select the row you want to edit.",
          "Update the category and save the change.",
          "Let the learned rule improve future rows.",
        ],
        [
          {
            question: "How does Clover choose categories?",
            answer:
              "Clover uses deterministic parsing and fallback rules first, then learns from confirmed edits so future rows can be categorized better.",
          },
          {
            question: "Can I keep confirmed categories from changing later?",
            answer:
              "Yes. Confirmed rows should remain stable, and Clover should avoid silently changing values that a user already accepted.",
          },
        ],
        [
          {
            label: "Open transactions",
            href: "/transactions",
            description: "Edit categories in the transaction list.",
          },
        ]
      ),
      createArticle(
        "how-to-edit-a-transaction-in-clover",
        "How to edit a transaction in Clover",
        "Update the transaction details that matter most: merchant, date, amount, category, or note.",
        "Step-by-step instructions for editing a transaction in Clover without losing traceability.",
        ["edit transaction", "merchant name", "transaction note"],
        [
          "Open the transaction record.",
          "Update the fields you need.",
          "Save the change and confirm the result.",
        ],
        [
          {
            question: "Where do I edit a transaction?",
            answer:
              "Open Transactions, pick the row, and update the fields you want to correct. That is the best place to fix categories or notes.",
          },
          {
            question: "What if a merchant name is too messy?",
            answer:
              "Use the simplified title where available, but keep the raw description intact so Clover can preserve traceability.",
          },
        ],
        [
          {
            label: "Open transactions",
            href: "/transactions",
            description: "Edit transaction details directly.",
          },
        ]
      ),
      createArticle(
        "how-to-split-or-normalize-spending-in-clover",
        "How to split or normalize spending in Clover",
        "Handle rows that contain more than one kind of purchase or a noisy merchant label.",
        "Learn how to split spending, normalize merchant labels, and keep raw descriptions intact in Clover.",
        ["split transaction", "normalize merchant", "merchant label"],
        [
          "Identify whether a row represents more than one real purchase.",
          "Keep the raw description for traceability.",
          "Use a clear simplified merchant name for reporting.",
        ],
        [
          {
            question: "Can I split one transaction into multiple categories?",
            answer:
              "If a row represents multiple kinds of spending, you can separate the logic in the transaction workflow and keep the raw entry intact for traceability.",
          },
          {
            question: "How do I keep merchant names consistent?",
            answer:
              "Use the raw description for auditability and the simplified merchant label for readability, especially when the original file has noisy bank text.",
          },
        ],
        [
          {
            label: "Open dashboard",
            href: "/transactions",
            description: "See activity in context.",
          },
        ]
      ),
      createArticle(
        "how-to-use-merchant-rules-in-clover",
        "How to use merchant rules in Clover",
        "Teach Clover how to recognize the same merchant more consistently over time.",
        "Learn how to use merchant rules in Clover to keep transaction names and categories consistent.",
        ["merchant rules", "merchant normalization", "category consistency"],
        [
          "Confirm the merchant label you want to keep.",
          "Save the change so Clover can reuse it later.",
          "Review later rows to make sure the rule is behaving the way you expect.",
        ],
        [
          {
            question: "What are merchant rules in Clover?",
            answer:
              "Merchant rules are learned patterns that help Clover keep transaction labels and categories more consistent when the same merchant appears again.",
          },
          {
            question: "Why keep raw descriptions separate from merchant names?",
            answer:
              "Keeping the raw description separate preserves traceability while still letting you show a cleaner merchant label in the app.",
          },
        ],
        [
          {
            label: "Open transactions",
            href: "/transactions",
            description: "Review merchant names and categories.",
          },
        ]
      ),
    ],
    questions: [
      {
        question: "Where do I edit a transaction?",
        answer:
          "Open Transactions, pick the row, and update the fields you want to correct. That is the best place to fix categories or notes.",
      },
      {
        question: "How does Clover choose categories?",
        answer:
          "Clover uses deterministic parsing and fallback rules first, then learns from confirmed edits so future rows can be categorized better.",
      },
      {
        question: "What if a merchant name is too messy?",
        answer:
          "Use the simplified title where available, but keep the raw description intact so Clover can preserve traceability.",
      },
      {
        question: "How do I change a transaction category in Clover?",
        answer:
          "Open the transaction, edit the category field, and save the change. Clover can learn from confirmed edits so similar rows are easier to classify later.",
      },
      {
        question: "Can I split one transaction into multiple categories?",
        answer:
          "If a row represents multiple kinds of spending, you can separate the logic in the transaction workflow and keep the raw entry intact for traceability.",
      },
      {
        question: "How do I keep merchant names consistent?",
        answer:
          "Use the raw description for auditability and the simplified merchant label for readability, especially when the original file has noisy bank text.",
      },
    ],
    links: [
      {
        label: "Open transactions",
        href: "/transactions",
        description: "Review and edit transaction rows.",
      },
      {
        label: "Open dashboard",
        href: "/dashboard",
        description: "See activity in context.",
      },
    ],
  },
  {
    slug: "accounts-workspaces",
    eyebrow: "Organization",
    title: "Accounts and workspaces",
    summary: "Understand how Clover groups accounts, balances, investments, and workspaces so the right data stays together.",
    icon: "wallet",
    accent: "sky",
    keywords: ["accounts", "workspace", "workspaces", "balance", "cash", "bank", "investment", "delete account", "home", "login"],
    searchPhrases: [
      "how workspaces work in Clover",
      "how to add an account in Clover",
      "why balance looks wrong in Clover",
      "how to switch workspaces",
      "how investments work in Clover",
    ],
    highlights: [
      "A workspace keeps one set of records together.",
      "Cash, bank, and investment accounts can sit side by side.",
      "Balances and investment views stay tied to the right workspace.",
      "Removing an account should be intentional and traceable.",
    ],
    articles: [
      createArticle(
        "how-workspaces-work-in-clover",
        "How workspaces work in Clover",
        "Keep each set of finances separated with its own workspace.",
        "Understand how workspaces work in Clover and how they keep accounts and transactions organized.",
        ["workspace", "workspaces", "organization"],
        [
          "Treat each workspace as one finance universe.",
          "Keep related accounts together.",
          "Use the workspace selector when you need to switch context.",
        ],
        [
          {
            question: "Why does Clover use workspaces?",
            answer:
              "Workspaces help keep one set of accounts, imports, and transactions together so each finance picture stays separate and easy to find.",
          },
          {
            question: "How do I switch workspaces in Clover?",
            answer:
              "Use the workspace selector or the account context you are already in so you do not accidentally mix data from different finances.",
          },
        ],
        [
          {
            label: "Open accounts",
            href: "/accounts",
            description: "View the accounts in your current workspace.",
          },
        ]
      ),
      createArticle(
        "how-to-add-an-account-in-clover",
        "How to add an account in Clover",
        "Bring a new bank, cash, or investment account into the right workspace.",
        "Learn how to add an account in Clover and keep the balance attached to the right workspace.",
        ["add account", "bank account", "cash account", "investment account"],
        [
          "Open Accounts.",
          "Add or import the account into the correct workspace.",
          "Check the initial balance and linked transactions.",
        ],
        [
          {
            question: "How do I add a new account to a workspace?",
            answer:
              "Add the account in the Accounts area or through the import flow, then keep it inside the workspace that matches the rest of that financial picture.",
          },
          {
            question: "What is the difference between cash and bank accounts?",
            answer:
              "Cash is for manual balances and quick tracking, while bank accounts usually come from imported statements or linked financial records.",
          },
        ],
        [
          {
            label: "Open accounts",
            href: "/accounts",
            description: "Add or review your account list.",
          },
        ]
      ),
      createArticle(
        "how-to-fix-account-balance-mismatches",
        "How to fix account balance mismatches",
        "Check the account detail, statement, and linked transactions when a balance is off.",
        "Find out how to fix account balance mismatches in Clover by checking the statement and related transactions.",
        ["balance mismatch", "wrong balance", "account total"],
        [
          "Open the account details.",
          "Compare the statement balance with the transactions.",
          "Look for timing differences or missing rows.",
        ],
        [
          {
            question: "What if my account balance looks off?",
            answer:
              "Check the linked statement, the account details, and the related transactions to see whether the mismatch came from import timing or a manual edit.",
          },
          {
            question: "Can I delete an account later?",
            answer:
              "Yes. You can remove an account when it is no longer needed, and Clover keeps the surrounding data flow consistent.",
          },
        ],
        [
          {
            label: "Open accounts",
            href: "/accounts",
            description: "Review the account balance details.",
          },
        ]
      ),
      createArticle(
        "how-to-track-investments-in-clover",
        "How to track investments in Clover",
        "Keep holdings and longer-term money visible alongside your everyday finances.",
        "Learn how investment tracking works in Clover and how it fits into your wider account picture.",
        ["investments", "portfolio", "holdings", "investment accounts"],
        [
          "Open Investments or Accounts.",
          "Add or review the investment account you want to track.",
          "Check holdings, current value, and how the portfolio fits into the rest of your finances.",
        ],
        [
          {
            question: "Where do I track investments in Clover?",
            answer:
              "Use the Investments page for the portfolio view and Accounts when you want to see how investment accounts fit into the rest of your balance picture.",
          },
          {
            question: "Why keep investments inside Clover?",
            answer:
              "Keeping investments alongside cash, cards, liabilities, and imported transactions helps you understand your finances as one connected system instead of splitting the story across separate tools.",
          },
        ],
        [
          {
            label: "Open investments",
            href: "/investments",
            description: "Review holdings and portfolio visibility.",
          },
        ]
      ),
      createArticle(
        "how-to-delete-an-account-in-clover",
        "How to delete an account in Clover",
        "Remove an account only after you know it will not affect the records you need.",
        "Learn how to delete an account in Clover and what to check before removing it from a workspace.",
        ["delete account", "remove account", "workspace account"],
        [
          "Confirm the account is no longer needed.",
          "Check whether any linked transactions still matter.",
          "Remove the account from the workspace once you are sure.",
        ],
        [
          {
            question: "Can I delete an account from Clover?",
            answer:
              "Yes, but you should only do that after checking whether any statements, transactions, or reports still depend on it.",
          },
          {
            question: "What should I check before removing an account?",
            answer:
              "Make sure you do not need the account for reporting, historical review, or balance comparisons before you delete it.",
          },
        ],
        [
          {
            label: "Open accounts",
            href: "/accounts",
            description: "Review the account before deleting it.",
          },
        ]
      ),
    ],
    questions: [
      {
        question: "Why does Clover use workspaces?",
        answer:
          "Workspaces help keep one set of accounts, imports, and transactions together so each finance picture stays separate and easy to find.",
      },
      {
        question: "What if my account balance looks off?",
        answer:
          "Check the linked statement, the account details, and the related transactions to see whether the mismatch came from import timing or a manual edit.",
      },
      {
        question: "Can I delete an account later?",
        answer:
          "Yes. You can remove an account when it is no longer needed, and Clover keeps the surrounding data flow consistent.",
      },
      {
        question: "How do I add a new account to a workspace?",
        answer:
          "Add the account in the Accounts area or through the import flow, then keep it inside the workspace that matches the rest of that financial picture.",
      },
      {
        question: "What is the difference between cash and bank accounts?",
        answer:
          "Cash is for manual balances and quick tracking, while bank accounts usually come from imported statements or linked financial records.",
      },
      {
        question: "How do I switch workspaces in Clover?",
        answer:
          "Use the workspace selector or the account context you are already in so you do not accidentally mix data from different finances.",
      },
      {
        question: "Where do I track investments in Clover?",
        answer:
          "Use the Investments page for the portfolio view and Accounts when you want to see how investment accounts fit into the rest of your balance picture.",
      },
      {
        question: "Why am I sent back to the landing page when I open a protected page?",
        answer:
          "That usually means Clover does not see an active session yet. Log in first, then open Accounts, Transactions, Reports, or other protected pages from the signed-in app.",
      },
    ],
    links: [
      {
        label: "Open accounts",
        href: "/accounts",
        description: "See the current workspace accounts.",
      },
      {
        label: "Open investments",
        href: "/investments",
        description: "Review the portfolio view and linked accounts.",
      },
      {
        label: "Open profile",
        href: "/profile",
        description: "Access account shortcuts and identity.",
      },
    ],
  },
  {
    slug: "split-bills",
    eyebrow: "Shared expenses",
    title: "Split bills",
    summary: "Track shared expenses, see balances, and settle up without manual math.",
    icon: "wallet",
    accent: "mint",
    keywords: ["split bills", "shared expenses", "settle up", "roommates", "travel", "people", "balances", "receipts", "split bill"],
    searchPhrases: [
      "how to split a bill in Clover",
      "how to add a shared expense",
      "how to settle balances in Clover",
      "how receipt-based split bills work",
    ],
    highlights: [
      "Create one shared bill for trips, homes, or recurring expenses.",
      "Add people and assign shares in a few clicks.",
      "Review balances before you settle up.",
    ],
    articles: [
      createArticle(
        "how-to-create-a-split-bill-in-clover",
        "How to create a split bill in Clover",
        "Start a new shared expense and keep the math in one place.",
        "Learn how to create a split bill in Clover for trips, homes, and recurring shared expenses.",
        ["create split bill", "shared expense", "split expense"],
        [
          "Open Split Bills.",
          "Create a new bill or import a receipt preview.",
          "Add the expense details and save it.",
        ],
        [
          {
            question: "What can I split in Clover?",
            answer:
              "You can split shared expenses like meals, rent, groceries, trips, or any cost you want to settle with other people.",
          },
          {
            question: "Can I start from a receipt?",
            answer:
              "Yes. You can create a split bill from a receipt preview or enter the expense manually if that is easier.",
          },
        ],
        [
          {
            label: "Open split bills",
            href: "/split-bill",
            description: "View your shared expenses.",
          },
        ]
      ),
      createArticle(
        "how-to-add-people-and-shares-to-a-split-bill",
        "How to add people and shares to a split bill",
        "Assign participants and decide how the total should be divided.",
        "Learn how to add people and shares to a split bill in Clover.",
        ["split bill shares", "add people", "who owes what"],
        [
          "Open the bill.",
          "Add the people involved.",
          "Choose how to divide the total.",
          "Save the shares and review the balance summary.",
        ],
        [
          {
            question: "How do I decide who pays what?",
            answer:
              "You can split the total evenly or assign custom shares so the bill matches the real arrangement.",
          },
          {
            question: "Can I change the people later?",
            answer:
              "Yes. You can update the people attached to a bill before settling it if the group changes.",
          },
        ],
        [
          {
            label: "Open split bills",
            href: "/split-bill",
            description: "Edit the bill and its shares.",
          },
        ]
      ),
      createArticle(
        "how-to-settle-a-split-bill-in-clover",
        "How to settle a split bill in Clover",
        "Mark balances as settled once everyone has paid their share.",
        "Learn how to settle a split bill in Clover and keep the remaining balance clear.",
        ["settle bill", "mark settled", "split bill balance"],
        [
          "Open the bill or person detail.",
          "Record the settlement or transfer.",
          "Confirm the remaining balance updates correctly.",
        ],
        [
          {
            question: "What happens after I settle a bill?",
            answer:
              "Clover updates the balance so it is clear what is still owed and what has already been settled.",
          },
          {
            question: "Can I keep using split bills over time?",
            answer:
              "Yes. You can keep building on the same shared expenses workflow for trips, homes, or ongoing groups.",
          },
        ],
        [
          {
            label: "Open split bills",
            href: "/split-bill",
            description: "Review the shared balance state.",
          },
        ]
      ),
    ],
    questions: [
      {
        question: "What can I split in Clover?",
        answer:
          "You can split shared expenses like meals, rent, groceries, trips, or any cost you want to settle with other people.",
      },
      {
        question: "Can I start from a receipt?",
        answer:
          "Yes. You can create a split bill from a receipt preview or enter the expense manually if that is easier.",
      },
      {
        question: "How do I decide who pays what?",
        answer:
          "You can split the total evenly or assign custom shares so the bill matches the real arrangement.",
      },
      {
        question: "Can I change the people later?",
        answer:
          "Yes. You can update the people attached to a bill before settling it if the group changes.",
      },
      {
        question: "What happens after I settle a bill?",
        answer:
          "Clover updates the balance so it is clear what is still owed and what has already been settled.",
      },
      {
        question: "Can I keep using split bills over time?",
        answer:
          "Yes. You can keep building on the same shared expenses workflow for trips, homes, or ongoing groups.",
      },
    ],
    links: [
      {
        label: "Open split bills",
        href: "/split-bill",
        description: "View and settle shared expenses.",
      },
      {
        label: "Import a receipt",
        href: "/imports",
        description: "Start from a receipt preview.",
      },
    ],
  },
  {
    slug: "reports-adviser-goals",
    eyebrow: "Analysis",
    title: "Insights, budgeting, and goals",
    summary: "Use reports, Adviser guidance, budgets, and goals to understand what your numbers mean and what to do next.",
    icon: "play",
    accent: "gold",
    keywords: ["reports", "adviser", "budgets", "budgeting", "goals", "dashboard", "analysis", "trend", "summary", "awareness", "visibility"],
    searchPhrases: [
      "how to read Clover reports",
      "how to use Adviser in Clover",
      "how budgeting works in Clover",
      "how to set a goal in Clover",
    ],
    highlights: [
      "Reports show structured summaries and trends.",
      "Adviser points out patterns and changes.",
      "Budgets and goals turn the data into action.",
    ],
    articles: [
      createArticle(
        "how-to-read-clover-reports",
        "How to read Clover reports",
        "Use reports to understand the money story behind the numbers.",
        "Learn how to read Clover reports and turn summaries into useful money decisions.",
        ["read reports", "cash flow", "summary"],
        [
          "Start with the overview numbers.",
          "Scan category mixes and changes over time.",
          "Drill into a detail view when something looks different.",
        ],
        [
          {
            question: "What is the best place to start for a summary?",
            answer:
              "The dashboard is the quickest overview, and Reports give you a deeper structured look once you want to analyze the numbers.",
          },
          {
            question: "How do I read Clover reports?",
            answer:
              "Start with the headline numbers, then move into the category or cash flow detail that explains where the money is coming from and where it is going.",
          },
        ],
        [
          {
            label: "Open reports",
            href: "/reports",
            description: "Review summaries and trends.",
          },
        ]
      ),
      createArticle(
        "what-adviser-means-in-clover",
        "What Adviser means in Clover",
        "Understand the guidance layer that points out important changes and patterns.",
        "Learn what Adviser means in Clover and how to use it to spot patterns faster.",
        ["adviser", "patterns", "spending trends"],
        [
          "Look for the pattern or change being called out.",
          "Compare that signal against your recent activity.",
          "Decide whether it needs action or just awareness.",
        ],
        [
          {
            question: "How do Adviser and Reports differ?",
            answer:
              "Reports are the formatted snapshots; Adviser is the guidance layer that highlights patterns or changes that deserve attention.",
          },
          {
            question: "What should I do when Adviser flags something important?",
            answer:
              "Open the related transactions or report view and confirm whether the change is real before you act on it.",
          },
        ],
        [
          {
            label: "Open Adviser",
            href: "/adviser",
            description: "See the patterns Clover noticed.",
          },
        ]
      ),
      createArticle(
        "how-to-use-budgets-in-clover",
        "How to use budgets in Clover",
        "Turn your imported history into practical guardrails you can actually follow.",
        "Learn how budgeting works in Clover and how to use budgets to guide spending decisions.",
        ["budgets", "budgeting", "spending caps", "limits"],
        [
          "Open Budgeting.",
          "Review the suggested or current budget setup.",
          "Track how spending is moving against each limit and adjust when the month changes.",
        ],
        [
          {
            question: "How does budgeting work in Clover?",
            answer:
              "Budgeting uses the financial history already inside Clover so your limits can reflect real activity instead of a blank template.",
          },
          {
            question: "Why use budgets if I already have reports?",
            answer:
              "Reports tell you what happened. Budgets give you a forward-looking guardrail so you can react sooner, not only after the month is over.",
          },
        ],
        [
          {
            label: "Open budgeting",
            href: "/budgeting",
            description: "Set or review your budgets.",
          },
        ]
      ),
      createArticle(
        "how-to-set-a-goal-in-clover",
        "How to set a goal in Clover",
        "Create a savings, debt, or milestone goal and keep it tied to the numbers that matter.",
        "Step-by-step guidance for setting a financial goal in Clover.",
        ["set a goal", "financial goal", "savings goal", "debt goal"],
        [
          "Open Goals.",
          "Pick the type of goal you want to track.",
          "Set a target and save the goal.",
          "Check progress over time.",
        ],
        [
          {
            question: "How do I set up a financial goal in Clover?",
            answer:
              "Open Goals, define the target you want to reach, and keep the goal tied to the numbers you actually want to measure.",
          },
        ],
        [
          {
            label: "Open goals",
            href: "/goals",
            description: "Create or edit your goals.",
          },
        ]
      ),
      createArticle(
        "how-to-track-goal-progress-in-clover",
        "How to track goal progress in Clover",
        "Use the goal view to see whether you are moving in the right direction.",
        "Learn how to track goal progress in Clover and connect your target to the latest numbers.",
        ["track goal progress", "goal progress", "goal tracking"],
        [
          "Open the goal you want to monitor.",
          "Check the current value against the target.",
          "Review recent activity to understand the trend.",
        ],
        [
          {
            question: "How do I see progress toward a goal?",
            answer:
              "Open the goal detail and compare the current value with the target, then review recent transactions or reports to understand the movement behind it.",
          },
          {
            question: "Can I use Adviser to support a goal?",
            answer:
              "Yes. Adviser can show the patterns that explain why a goal is moving faster or slower than expected.",
          },
        ],
        [
          {
            label: "Open goals",
            href: "/goals",
            description: "Check the goal you are tracking.",
          },
        ]
      ),
    ],
    questions: [
      {
        question: "What is the best place to start for a summary?",
        answer:
          "The dashboard is the quickest overview, and Reports give you a deeper structured look once you want to analyze the numbers.",
      },
      {
        question: "How do Adviser and Reports differ?",
        answer:
          "Reports are the formatted snapshots; Adviser is the guidance layer that highlights patterns or changes that deserve attention.",
      },
      {
        question: "How does budgeting work in Clover?",
        answer:
          "Budgeting uses the financial history already inside Clover so your limits can reflect real activity instead of a blank template.",
      },
      {
        question: "Where do I track goals in Clover?",
        answer:
          "Use the Goals page to follow progress without losing sight of the reports, budgets, and Adviser signals affecting that goal.",
      },
      {
        question: "How do I read Clover reports?",
        answer:
          "Start with the headline numbers, then move into the category or cash flow detail that explains where the money is coming from and where it is going.",
      },
      {
        question: "What does Adviser mean in Clover?",
        answer:
          "Adviser highlights changes, spikes, or patterns so you can act on the most important movement without scanning every transaction manually.",
      },
      {
        question: "How do I set up a financial goal in Clover?",
        answer:
          "Open Goals, define the target you want to reach, and keep the goal tied to the numbers you actually want to measure.",
      },
    ],
    links: [
      {
        label: "Open reports",
        href: "/reports",
        description: "Review summaries and trends.",
      },
      {
        label: "Open budgeting",
        href: "/budgeting",
        description: "Set budgets from your real spending history.",
      },
      {
        label: "Open Adviser",
        href: "/adviser",
        description: "Check the patterns Clover noticed.",
      },
    ],
  },
  {
    slug: "billing-plan",
    eyebrow: "Billing",
    title: "Billing and plan",
    summary: "Compare Free and Pro, understand limits, and manage Clover billing at PHP 99 monthly or PHP 999 annually.",
    icon: "pricing",
    accent: "violet",
    keywords: ["pricing", "plan", "billing", "free", "pro", "upgrade", "subscription", "refund", "limits", "investment tools"],
    searchPhrases: [
      "Free vs Pro Clover pricing",
      "how to upgrade Clover plan",
      "how to manage Clover billing",
      "what is included in Clover Pro plan",
    ],
    highlights: [
      "Free is useful for trying Clover and starting small.",
      "Pro gives you more room for accounts, uploads, analysis, and investing.",
      "Monthly is PHP 99 and annual is PHP 999.",
      "Billing lives in Settings once you are signed in.",
    ],
    articles: [
      createArticle(
        "free-vs-pro-clover-pricing",
        "Free vs Pro in Clover",
        "Compare the two plans and decide whether you need more room.",
        "Compare Free vs Pro in Clover and understand which plan fits your workflow.",
        ["free vs pro", "pricing", "plan comparison"],
        [
          "Review the Free limits.",
          "Compare them with the Pro limits.",
          "Choose the plan that matches your volume and reporting needs.",
        ],
        [
          {
            question: "What is the difference between Free and Pro in Clover?",
            answer:
              "Free is best for trying the product or managing a smaller setup, while Pro unlocks more room for accounts, uploads, deeper analysis, and investment tools.",
          },
          {
            question: "How much does Clover Pro cost?",
            answer:
              "Clover Pro is priced at PHP 99 monthly or PHP 999 annually.",
          },
          {
            question: "What is included in the Free plan?",
            answer:
              "Free is designed for lighter use while you explore Clover. It still lets you try the core workflow and see how the app works for your finances.",
          },
        ],
        [
          {
            label: "See pricing",
            href: "/pricing",
            description: "Review the current plan comparison.",
          },
        ]
      ),
      createArticle(
        "how-to-upgrade-your-clover-plan",
        "How to upgrade your Clover plan",
        "Move from Free to Pro when you need more account or upload headroom.",
        "Learn how to upgrade your Clover plan and manage the billing flow from your account.",
        ["upgrade plan", "billing", "subscription"],
        [
          "Open Pricing or Settings.",
          "Choose the Pro plan.",
          "Complete the billing flow.",
        ],
        [
          {
            question: "How do I upgrade my Clover plan?",
            answer:
              "Open Settings or Pricing, choose the plan you want, and follow the billing flow that matches your account.",
          },
          {
            question: "Where do I manage billing?",
            answer:
              "Open Settings after signing in. That is where Clover surfaces the plan and billing actions tied to your account.",
          },
        ],
        [
          {
            label: "Open settings",
            href: "/settings",
            description: "Manage billing and plan actions.",
          },
        ]
      ),
      createArticle(
        "what-to-do-when-you-hit-your-plan-limit",
        "What to do when you hit your Clover limit",
        "Know what happens when you reach a limit and how to move forward.",
        "Find out what to do when you hit a Clover plan limit and whether upgrading will help.",
        ["plan limit", "limit reached", "free plan limit"],
        [
          "Check which limit you reached.",
          "Confirm whether the limit affects uploads, accounts, or analysis.",
          "Upgrade if you need more room.",
        ],
        [
          {
            question: "What happens if I hit my free plan limit?",
            answer:
              "Clover should point you toward the next plan or keep you within the available limits until you decide to upgrade.",
          },
          {
            question: "What does Pro unlock?",
            answer:
              "Pro gives you more headroom for accounts, uploads, transactions, the deeper reports and goals features that benefit from a fuller data set, and investment tools for a more complete view of your finances.",
          },
        ],
        [
          {
            label: "See pricing",
            href: "/pricing",
            description: "Compare limits and upgrades.",
          },
        ]
      ),
      createArticle(
        "how-to-cancel-or-change-your-clover-plan",
        "How to cancel or change your Clover plan",
        "Switch plans when your needs change or step away from Pro if you no longer need it.",
        "Learn how to cancel or change your Clover plan from the billing and settings area.",
        ["cancel plan", "change plan", "billing change", "subscription management"],
        [
          "Open Settings or Pricing.",
          "Review the current plan and available changes.",
          "Choose the new plan or cancel flow that fits your account.",
        ],
        [
          {
            question: "How do I cancel or change my plan?",
            answer:
              "Use the billing area in Settings or Pricing, then choose the plan action that matches what you want to do.",
          },
          {
            question: "Will I lose my data if I change plans?",
            answer:
              "Plan changes should affect billing and limits, not your confirmed finance records. Your data should remain available unless you choose a deletion flow.",
          },
        ],
        [
          {
            label: "Open settings",
            href: "/settings",
            description: "Manage your current billing state.",
          },
        ]
      ),
    ],
    questions: [
      {
        question: "What is included in the Free plan?",
        answer:
          "Free is designed for lighter use while you explore Clover. It still lets you try the core workflow and see how the app works for your finances.",
      },
      {
        question: "What does Pro unlock?",
        answer:
          "Pro gives you more headroom for accounts, uploads, transactions, the deeper reports and goals features that benefit from a fuller data set, and investment tools for a more complete view of your finances.",
      },
      {
        question: "How much does Clover Pro cost?",
        answer:
          "Clover Pro is priced at PHP 99 monthly or PHP 999 annually.",
      },
      {
        question: "Where do I manage billing?",
        answer:
          "Open Settings after signing in. That is where Clover surfaces the plan and billing actions tied to your account.",
      },
      {
        question: "What is the difference between Free and Pro in Clover?",
        answer:
          "Free is best for trying the product or managing a smaller setup, while Pro unlocks more room for accounts, uploads, deeper analysis, and investment tools.",
      },
      {
        question: "How do I upgrade my Clover plan?",
        answer:
          "Open Settings or Pricing, choose the plan you want, and follow the billing flow that matches your account.",
      },
      {
        question: "What happens if I hit my free plan limit?",
        answer:
          "Clover should point you toward the next plan or keep you within the available limits until you decide to upgrade.",
      },
    ],
    links: [
      {
        label: "See pricing",
        href: "/pricing",
        description: "Review the current plan comparison.",
      },
      {
        label: "Open settings",
        href: "/settings",
        description: "Manage billing and plan actions.",
      },
    ],
  },
  {
    slug: "privacy-security-data",
    eyebrow: "Safety",
    title: "Privacy, security, and data",
    summary: "See how Clover protects sign-in sessions, preserves audit trails, and handles sensitive data.",
    icon: "shield",
    accent: "coral",
    keywords: ["trust", "security", "safety", "auth", "privacy", "review queue", "confirm", "delete", "wipe", "storage", "retention", "audit trail"],
    searchPhrases: [
      "how Clover protects my account",
      "where Clover stores my data",
      "raw statement file retention in Clover",
      "what browser storage Clover uses",
      "does Clover overwrite confirmed data",
    ],
    highlights: [
      "Clerk handles authentication and sessions.",
      "Low-confidence parsing stays in review instead of being auto-confirmed.",
      "Sensitive actions are tracked and confirmed intentionally.",
    ],
    articles: [
      createArticle(
        "how-clover-protects-your-account",
        "How Clover protects your account",
        "Learn the basics of authentication, session handling, and safe defaults.",
        "Understand how Clover protects your account, sessions, and finance data.",
        ["protect account", "authentication", "sessions"],
        [
          "Use Clerk sign-in to manage identity.",
          "Keep sensitive records server-side.",
          "Rely on review for uncertain parsing results.",
        ],
        [
          {
            question: "How does Clover protect my account?",
            answer:
              "Clover uses Clerk for identity and session management, keeps browser storage limited to low-risk convenience state, and treats the server as the source of truth for finance data.",
          },
          {
            question: "Is Clover safe to use with bank statements?",
            answer:
              "Clover is designed around server-side processing, auditability, and careful handling of sensitive records so statement data stays traceable.",
          },
        ],
        [
          {
            label: "Read privacy policy",
            href: "/privacy-policy",
            description: "Review the public privacy summary.",
          },
        ]
      ),
      createArticle(
        "where-clover-stores-your-data",
        "Where Clover stores your data",
        "See which data stays on the server and which data may be cached locally.",
        "Find out where Clover stores your data and how browser storage is limited.",
        ["stores data", "browser storage", "server-side"],
        [
          "Keep raw imports and finance records on the server.",
          "Use browser storage only for lightweight convenience state.",
          "Avoid saving sensitive content in local storage.",
        ],
        [
          {
            question: "Where does Clover store my data?",
            answer:
              "Clover stores source files and finance records on the server side, while the browser only keeps low-risk convenience state such as workspace selection.",
          },
          {
            question: "What browser storage does Clover use?",
            answer:
              "Only lightweight convenience state should live in the browser, not raw statements, account numbers, or long-lived transaction history.",
          },
        ],
        [
          {
            label: "Open settings",
            href: "/settings",
            description: "Review account and data controls.",
          },
        ]
      ),
      createArticle(
        "raw-upload-retention-and-deletion",
        "Raw upload retention and deletion",
        "Understand how long raw imports stay around and how to remove them.",
        "Learn about raw upload retention, manual deletion, and data wipe behavior in Clover.",
        ["raw upload retention", "delete uploads", "wipe data"],
        [
          "Keep raw uploads only as long as you need them.",
          "Delete files manually when they are no longer useful.",
          "Use wipe or account deletion flows for a full reset.",
        ],
        [
          {
            question: "How long does Clover keep raw uploads?",
            answer:
              "Raw uploads are meant to stay only for a short retention window, and Clover should still support manual deletion when you no longer need the file.",
          },
          {
            question: "How do I remove my data?",
            answer:
              "Use the settings and account actions in Clover to wipe app data, delete an account, or request the deletion flow that fits your case.",
          },
        ],
        [
          {
            label: "Open settings",
            href: "/settings",
            description: "Find the data and billing controls.",
          },
        ]
      ),
      createArticle(
        "how-to-delete-your-clover-account",
        "How to delete your Clover account",
        "Close your account when you no longer want Clover to keep your data.",
        "Learn how to delete your Clover account and what happens to your data after account closure.",
        ["delete account", "close account", "account deletion"],
        [
          "Open Settings and find the account controls.",
          "Start the account deletion flow.",
          "Confirm that you really want to remove the account and related data.",
        ],
        [
          {
            question: "What happens when I delete my Clover account?",
            answer:
              "Deleting the account should remove access to the workspace and trigger the applicable data deletion or retention workflow for your records.",
          },
          {
            question: "Can I recover a deleted account?",
            answer:
              "Account deletion should be treated as a serious action. If you are unsure, check the available account and data controls before you confirm it.",
          },
        ],
        [
          {
            label: "Open settings",
            href: "/settings",
            description: "Find account deletion controls.",
          },
        ]
      ),
    ],
    questions: [
      {
        question: "How does Clover protect my account?",
        answer:
          "Clover uses Clerk for identity and session management, keeps browser storage limited to low-risk convenience state, and treats the server as the source of truth for finance data.",
      },
      {
        question: "What happens when Clover is unsure about a parsed row?",
        answer:
          "Low-confidence results are pushed into review so they can be checked before they become confirmed financial records.",
      },
      {
        question: "Can Clover change confirmed data automatically?",
        answer:
          "No. Clover should avoid silently overwriting confirmed records. Confirmed data stays protected unless you explicitly change it.",
      },
      {
        question: "How long does Clover keep raw uploads?",
        answer:
          "Raw uploads are meant to stay only for a short retention window, and Clover should still support manual deletion when you no longer need the file.",
      },
      {
        question: "Where does Clover store my data?",
        answer:
          "Clover stores source files and finance records on the server side, while the browser only keeps low-risk convenience state such as workspace selection.",
      },
      {
        question: "Is Clover safe to use with bank statements?",
        answer:
          "Clover is designed around server-side processing, auditability, and careful handling of sensitive records so statement data stays traceable.",
      },
      {
        question: "What browser storage does Clover use?",
        answer:
          "Only lightweight convenience state should live in the browser, not raw statements, account numbers, or long-lived transaction history.",
      },
    ],
    links: [
      {
        label: "Read privacy policy",
        href: "/privacy-policy",
        description: "Review the public privacy summary.",
      },
      {
        label: "Open terms",
        href: "/terms-of-service",
        description: "See the current legal terms.",
      },
    ],
  },
  {
    slug: "troubleshooting",
    eyebrow: "Fixes",
    title: "Troubleshooting",
    summary: "Find fast answers for login issues, import problems, duplicates, and missing data.",
    icon: "wrench",
    accent: "rose",
    keywords: ["troubleshooting", "problem", "issue", "error", "sync", "missing", "duplicate", "password", "failed", "login", "accounts", "home"],
    searchPhrases: [
      "Clover file will not import",
      "why rows are missing after import",
      "duplicate transactions in Clover",
      "statement password problems",
      "Clover sends me back to the landing page",
    ],
    highlights: [
      "If a protected page bounces you back to the landing page, check your sign-in session first.",
      "Start by checking the original file and the parsed result.",
      "Password-protected files often need a separate password step.",
      "Duplicates and missing rows usually come from file overlap or import timing.",
    ],
    articles: [
      createArticle(
        "why-protected-pages-send-me-back-to-the-landing-page",
        "Why protected pages send me back to the landing page",
        "Check your session when Clover keeps redirecting you out of Accounts, Transactions, or similar pages.",
        "Learn why Clover may send signed-in users back to the landing page and how to confirm your session is active.",
        ["landing page redirect", "protected page", "accounts", "transactions", "session"],
        [
          "Confirm you are signed in with an active session.",
          "Open the page again from the app navigation.",
          "If needed, sign out and sign back in.",
        ],
        [
          {
            question: "Why am I sent back to the landing page?",
            answer:
              "That usually means Clover cannot see an active sign-in session yet. Log in first, then open the page again from the signed-in app.",
          },
          {
            question: "What pages should only be available after I log in?",
            answer:
              "Pages like Home, Accounts, Transactions, Reports, Goals, and Split Bills are intended for signed-in users only.",
          },
        ],
        [
          {
            label: "Log in",
            href: "/sign-in",
            description: "Refresh your session and try again.",
          },
        ]
      ),
      createArticle(
        "file-will-not-import-in-clover",
        "File will not import in Clover",
        "Fix common upload and parsing failures before retrying the file.",
        "Troubleshoot a Clover file that will not import with common checks for file type, size, and passwords.",
        ["file will not import", "import failed", "upload error"],
        [
          "Confirm the file type is supported.",
          "Check the file size and whether it is password protected.",
          "Re-upload from Imports if needed.",
        ],
        [
          {
            question: "My file will not import. What should I check?",
            answer:
              "Confirm the file type, file size, and whether the file is password protected. If the issue persists, re-upload the file from Imports and compare the result.",
          },
          {
            question: "What should I do if Clover asks for a file password?",
            answer:
              "Enter the correct statement password if the file uses one, then re-run the import so Clover can read the protected content.",
          },
        ],
        [
          {
            label: "Open imports",
            href: "/imports",
            description: "Try the file again from the upload flow.",
          },
        ]
      ),
      createArticle(
        "why-rows-are-missing-after-import-in-clover",
        "Why rows are missing after import in Clover",
        "Find the common reasons a statement comes in shorter than expected.",
        "Learn why rows may be missing after import in Clover and how to check filters, duplicates, and date ranges.",
        ["missing rows", "import missing data", "statement period"],
        [
          "Check the statement date range.",
          "Review filters and duplicate protection.",
          "Confirm the file includes the full account period.",
        ],
        [
          {
            question: "Why are rows missing after import?",
            answer:
              "Missing rows are often caused by filter settings, duplicate detection, or a statement that only covers part of the period you expected.",
          },
          {
            question: "Why are transactions missing after import?",
            answer:
              "Missing rows can come from a partial statement period, filter settings, duplicate protection, or a file that only covers part of the account activity.",
          },
        ],
        [
          {
            label: "Open review",
            href: "/review",
            description: "Inspect rows that need attention.",
          },
        ]
      ),
      createArticle(
        "duplicate-transactions-and-sync-issues",
        "Duplicate transactions and sync issues",
        "Resolve overlapping imports and keep your workspace in sync.",
        "Troubleshoot duplicate transactions and sync issues in Clover with a practical checklist.",
        ["duplicate transactions", "sync issue", "out of sync"],
        [
          "Check whether the file was uploaded twice.",
          "Refresh the page and confirm the correct workspace.",
          "Review the transaction detail before deleting anything.",
        ],
        [
          {
            question: "What if I see duplicate transactions?",
            answer:
              "Check whether the same source file was uploaded twice, then open the transaction details to confirm whether the duplicates should be removed or marked differently.",
          },
          {
            question: "How do I fix a sync problem in Clover?",
            answer:
              "Refresh the page, confirm the right workspace is selected, and check whether the source file or data was actually saved before you try again.",
          },
        ],
        [
          {
            label: "Open transactions",
            href: "/transactions",
            description: "Review the duplicate or overlapping rows.",
          },
        ]
      ),
      createArticle(
        "how-to-fix-duplicate-transactions-in-clover",
        "How to fix duplicate transactions in Clover",
        "Clean up repeated rows when the same activity appears more than once.",
        "Learn how to fix duplicate transactions in Clover and avoid repeated rows after import.",
        ["duplicate transactions", "duplicate rows", "double import"],
        [
          "Compare the duplicate rows and confirm which file introduced them.",
          "Remove or ignore the repeated record if it was imported twice.",
          "Re-import only after the duplicate source is resolved.",
        ],
        [
          {
            question: "Why do duplicate transactions appear?",
            answer:
              "Duplicates usually come from importing overlapping files or from re-running an import without clearing the earlier result.",
          },
          {
            question: "How do I stop duplicate rows from coming back?",
            answer:
              "Check the file date range and make sure you are not importing the same statement twice. If needed, review the previous import before uploading again.",
          },
        ],
        [
          {
            label: "Open review",
            href: "/review",
            description: "Compare the rows that were imported.",
          },
        ]
      ),
    ],
    questions: [
      {
        question: "Why am I sent back to the landing page?",
        answer:
          "That usually means Clover cannot see an active sign-in session yet. Log in first, then open the page again from the signed-in app.",
      },
      {
        question: "My file will not import. What should I check?",
        answer:
          "Confirm the file type, file size, and whether the file is password protected. If the issue persists, re-upload the file from Imports and compare the result.",
      },
      {
        question: "Why are rows missing after import?",
        answer:
          "Missing rows are often caused by filter settings, duplicate detection, or a statement that only covers part of the period you expected.",
      },
      {
        question: "What if I see duplicate transactions?",
        answer:
          "Check whether the same source file was uploaded twice, then open the transaction details to confirm whether the duplicates should be removed or marked differently.",
      },
      {
        question: "Why are transactions missing after import?",
        answer:
          "Missing rows can come from a partial statement period, filter settings, duplicate protection, or a file that only covers part of the account activity.",
      },
      {
        question: "What should I do if Clover asks for a file password?",
        answer:
          "Enter the correct statement password if the file uses one, then re-run the import so Clover can read the protected content.",
      },
      {
        question: "How do I fix a sync problem in Clover?",
        answer:
          "Refresh the page, confirm the right workspace is selected, and check whether the source file or data was actually saved before you try again.",
      },
    ],
    links: [
      {
        label: "Open imports",
        href: "/imports",
        description: "Check your uploaded files.",
      },
      {
        label: "Open review",
        href: "/review",
        description: "Resolve items that need attention.",
      },
    ],
  },
];

export const helpSectionMap = new Map(helpSections.map((section) => [section.slug, section] as const));

const dedupeBy = <T,>(items: T[], getKey: (item: T) => string) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const mergeHelpSections = (
  slug: string,
  eyebrow: string,
  title: string,
  summary: string,
  icon: HelpSection["icon"],
  accent: HelpSection["accent"],
  sectionSlugs: string[],
  searchPhrases: string[],
  highlights: string[]
): HelpSection => {
  const sections = sectionSlugs
    .map((sectionSlug) => helpSectionMap.get(sectionSlug))
    .filter((section): section is HelpSection => Boolean(section));

  return {
    slug,
    eyebrow,
    title,
    summary,
    icon,
    accent,
    keywords: dedupeBy(sections.flatMap((section) => section.keywords), (value) => value.toLowerCase()),
    searchPhrases: dedupeBy([...searchPhrases, ...sections.flatMap((section) => section.searchPhrases)], (value) => value.toLowerCase()),
    highlights: dedupeBy([...highlights, ...sections.flatMap((section) => section.highlights)], (value) => value.toLowerCase()),
    articles: dedupeBy(sections.flatMap((section) => section.articles), (article) => article.slug),
    questions: dedupeBy(sections.flatMap((section) => section.questions), (question) => question.question.toLowerCase()),
    links: dedupeBy(sections.flatMap((section) => section.links), (link) => `${link.href}:${link.label}`),
  };
};

export const publicHelpSections: HelpSection[] = [
  mergeHelpSections(
    "getting-started",
    "Start here",
    "Getting Started",
    "Set up your account, upload your first files, and learn the quickest way to get useful results from Clover.",
    "spark",
    "teal",
    ["getting-started", "troubleshooting"],
    ["how to start using Clover", "what to upload first", "why Clover looks different after sign in"],
    ["Set up your account and workspace.", "Upload your first file with confidence.", "Fix common first-run issues quickly."]
  ),
  mergeHelpSections(
    "billing-and-accounts",
    "Manage access",
    "Billing and Accounts",
    "Handle plans, payments, workspaces, and account access so Clover stays connected to the way you manage your finances.",
    "wallet",
    "sky",
    ["accounts-workspaces", "billing-plan"],
    ["how billing works in Clover", "how to manage my workspace", "how to update my plan"],
    ["Manage your plan and payment details.", "Organize the right accounts and workspaces.", "Keep access clear when your setup changes."]
  ),
  mergeHelpSections(
    "product-features",
    "Use Clover",
    "Product Features",
    "Learn how Clover helps with uploads, transactions, reports, budgets, split bills, and the everyday parts of tracking money.",
    "play",
    "mint",
    ["importing-reviewing", "transactions-categories", "split-bills", "reports-adviser-goals"],
    ["how to upload statements", "how to track transactions", "how split bills work", "how to read Clover reports"],
    ["Upload files and review the results.", "Keep transactions and categories clean.", "Use reports and split bills with less manual work."]
  ),
  mergeHelpSections(
    "security",
    "Stay protected",
    "Security",
    "Understand what happens to your files, how Clover protects your data, and who can access your account information.",
    "shield",
    "violet",
    ["privacy-security-data"],
    ["is my data safe in Clover", "what happens to uploaded files", "can others access my data"],
    ["Know where your uploaded files go.", "Understand how Clover protects account data.", "See what access stays private to you."]
  ),
];

export const publicHelpSectionMap = new Map(publicHelpSections.map((section) => [section.slug, section] as const));

export const resolveHelpSection = (slug: string) => publicHelpSectionMap.get(slug) ?? helpSectionMap.get(slug) ?? null;

export const getHelpArticleHref = (sectionSlug: string, articleSlug: string, returnTo?: string | null) => {
  const params = new URLSearchParams();

  if (returnTo) {
    params.set("returnTo", returnTo);
  }

  const query = params.toString();
  return query ? `/help/${sectionSlug}/${articleSlug}?${query}` : `/help/${sectionSlug}/${articleSlug}`;
};

export const getHelpSectionHref = (slug: string, returnTo?: string | null) => {
  const params = new URLSearchParams();

  if (returnTo) {
    params.set("returnTo", returnTo);
  }

  const query = params.toString();
  return query ? `/help/${slug}?${query}` : `/help/${slug}`;
};

export const getHelpHomeHref = (returnTo?: string | null) => {
  const params = new URLSearchParams();

  if (returnTo) {
    params.set("returnTo", returnTo);
  }

  const query = params.toString();
  return query ? `/help?${query}` : "/help";
};

export const getHelpSectionImageSrc = (sectionSlug: HelpSection["slug"]) => {
  switch (sectionSlug) {
    case "getting-started":
      return "/help-icons/getting-started.png";
    case "billing-and-accounts":
      return "/help-icons/accounts-and-workspaces.png";
    case "product-features":
      return "/help-icons/reports-insights-goals.png";
    case "security":
      return "/help-icons/privacy-security-data.png";
    case "importing-reviewing":
      return "/help-icons/importing-and-reviewing.png";
    case "transactions-categories":
      return "/help-icons/transactions-and-categories.png";
    case "accounts-workspaces":
      return "/help-icons/accounts-and-workspaces.png";
    case "split-bills":
      return "/help-icons/accounts-and-workspaces.png";
    case "reports-adviser-goals":
      return "/help-icons/reports-insights-goals.png";
    case "billing-plan":
      return "/help-icons/billing-and-plan.png";
    case "privacy-security-data":
      return "/help-icons/privacy-security-data.png";
    case "troubleshooting":
      return "/help-icons/troubleshooting.png";
  }
};

export const findHelpSectionArticle = (sectionSlug: string, articleSlug: string) =>
  resolveHelpSection(sectionSlug)?.articles.find((article) => article.slug === articleSlug) ?? null;

export const getPopularHelpSearchPhrases = (limit = 8) =>
  publicHelpSections.flatMap((section) => section.searchPhrases).slice(0, limit);

const normalizeHelpSearchQuery = (query: string) => query.trim().toLowerCase();

const scoreHelpMatch = (query: string, value: string) => {
  if (!value) {
    return 0;
  }

  const normalizedValue = value.toLowerCase();

  if (normalizedValue === query) {
    return 100;
  }

  if (normalizedValue.startsWith(query)) {
    return 90;
  }

  if (normalizedValue.includes(query)) {
    return 70;
  }

  return 0;
};

export const getHelpSearchResults = (query: string, limit = 6): HelpSearchResult[] => {
  const normalizedQuery = normalizeHelpSearchQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  const results: Array<HelpSearchResult & { score: number }> = [];

  for (const section of publicHelpSections) {
    const sectionScore = Math.max(
      scoreHelpMatch(normalizedQuery, section.title),
      scoreHelpMatch(normalizedQuery, section.summary),
      ...section.keywords.map((value) => scoreHelpMatch(normalizedQuery, value)),
      ...section.searchPhrases.map((value) => scoreHelpMatch(normalizedQuery, value)),
      ...section.highlights.map((value) => scoreHelpMatch(normalizedQuery, value)),
      ...section.questions.flatMap((question) => [
        scoreHelpMatch(normalizedQuery, question.question),
        scoreHelpMatch(normalizedQuery, question.answer),
      ]),
      ...section.links.flatMap((link) => [
        scoreHelpMatch(normalizedQuery, link.label),
        scoreHelpMatch(normalizedQuery, link.description),
      ])
    );

    if (sectionScore > 0) {
      results.push({
        kind: "section",
        title: section.title,
        summary: section.summary,
        href: getHelpSectionHref(section.slug),
        sectionSlug: section.slug,
        sectionTitle: section.title,
        score: sectionScore,
      });
    }

    for (const article of section.articles) {
      const articleScore = Math.max(
        scoreHelpMatch(normalizedQuery, article.title),
        scoreHelpMatch(normalizedQuery, article.summary),
        ...article.keywords.map((value) => scoreHelpMatch(normalizedQuery, value)),
        ...article.steps.map((value) => scoreHelpMatch(normalizedQuery, value)),
        ...article.questions.flatMap((question) => [
          scoreHelpMatch(normalizedQuery, question.question),
          scoreHelpMatch(normalizedQuery, question.answer),
        ]),
        ...article.links.flatMap((link) => [
          scoreHelpMatch(normalizedQuery, link.label),
          scoreHelpMatch(normalizedQuery, link.description),
        ])
      );

      if (articleScore > 0) {
        results.push({
          kind: "article",
          title: article.title,
          summary: article.summary,
          href: getHelpArticleHref(section.slug, article.slug),
          sectionSlug: section.slug,
          sectionTitle: section.title,
          articleSlug: article.slug,
          score: articleScore,
        });
      }
    }
  }

  return results
    .sort((left, right) => right.score - left.score || left.kind.localeCompare(right.kind) || left.title.localeCompare(right.title))
    .slice(0, limit)
    .map(({ score: _score, ...result }) => result);
};

export const isHelpSection = (slug: string): slug is HelpSection["slug"] => Boolean(resolveHelpSection(slug));

export const isHelpArticleSlug = (sectionSlug: string, articleSlug: string) =>
  resolveHelpSection(sectionSlug)?.articles.some((article) => article.slug === articleSlug) ?? false;
