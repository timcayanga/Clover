export type FeatureVisual = "transactions" | "accounts" | "recurring" | "reports" | "adviser" | "budget" | "goal" | "circles" | "split" | "source" | "control" | "pricing";
export type FeatureChapter = { id: string; title: string; accent: string; copy?: string; visual?: FeatureVisual; link?: { href: string; label: string } };
export type FeatureStory = { slug: string; title: string; products?: string; asset: string; chapters: FeatureChapter[] };

export const FEATURE_STORIES: FeatureStory[] = [
  { slug: "manage-money", title: "Manage Money", products: "Transactions · Accounts · Recurring", asset: "manage", chapters: [
    { id: "overview", title: "Bring your money", accent: "records together.", copy: "Receipts from errands. Statements from your bank. Screenshots from your wallet. Start with the records you already have, and let Clover help organize them.", visual: "transactions" },
    { id: "transactions", title: "Find the transaction.", accent: "Keep the context.", copy: "Search your financial history, review imported details, and correct merchants or categories. You decide what gets confirmed.", visual: "transactions" },
    { id: "accounts", title: "Every account.", accent: "A clearer picture.", copy: "See bank, cash, card, and wallet balances together, with currencies clearly identified. Understand what you hold without opening every app.", visual: "accounts" },
    { id: "recurring", title: "Know what keeps", accent: "coming back.", copy: "Keep recurring bills, subscriptions, income, and other commitments in view. Review what is expected next before it becomes a surprise.", visual: "recurring" },
    { id: "start", title: "Less money admin.", accent: "More room for your day." },
  ] },
  { slug: "understand-your-money", title: "Understand Your Money", products: "Adviser · Reports", asset: "understand", chapters: [
    { id: "overview", title: "Understand the story", accent: "behind your spending.", copy: "A total tells you how much. Clover helps you see what changed, what contributed to it, and what deserves a closer look.", visual: "reports" },
    { id: "reports", title: "See the pattern", accent: "behind the total.", copy: "Explore spending, income, cash flow, and balance trends across your accounts. Compare periods and connect the bigger picture to your records.", visual: "reports" },
    { id: "adviser", title: "Ask your next", accent: "money question.", copy: "Ask Adviser about your actual spending, commitments, savings, and goals. Start with a question in your own words—not a spreadsheet formula.", visual: "adviser" },
    { id: "next-step", title: "From an answer", accent: "to a clearer next step.", copy: "Use the explanation to decide what to review or adjust. Adviser suggests; you remain in control of the decision.", visual: "adviser", link: { href: "/features/plan-ahead", label: "Explore Investments, Budgeting and Goals →" } },
    { id: "start", title: "Know what changed.", accent: "Decide what comes next." },
  ] },
  { slug: "plan-ahead", title: "Plan Ahead", products: "Investments · Budgeting · Goals", asset: "plan", chapters: [
    { id: "overview", title: "Make room for", accent: "what matters next.", copy: "See your investments in context, build a budget around real life, and give your savings goals a practical next step. Bring today's decisions and longer-term plans into one financial picture." },
    { id: "investments", title: "See how your investments fit", accent: "into the bigger picture.", copy: "Track your holdings, estimated values, and returns alongside your accounts, budgets, and goals. Understand your portfolio in the context of your wider finances." },
    { id: "budgeting", title: "Build a budget", accent: "around real life.", copy: "Use your recorded spending as a starting point. Choose the amount, currency, scope, and cadence, then edit the budget as your needs change.", visual: "budget" },
    { id: "goals", title: "Give the goal", accent: "a practical next step.", copy: "Set a savings target and track your progress. Review what you can contribute alongside existing spending and commitments, and adjust the plan as life changes.", visual: "goal" },
    { id: "start", title: "Give your plans", accent: "a clearer path forward." },
  ] },
  { slug: "manage-money-together", title: "Manage Money Together", products: "Circles · Split Bills", asset: "together", chapters: [
    { id: "overview", title: "Share the expense.", accent: "Keep the clarity.", copy: "Groceries for dinner. Household costs. A weekend with friends. Keep the shared money organized without mixing up your personal finances.", visual: "split" },
    { id: "circles", title: "Give your group", accent: "one place to stay aligned.", copy: "Bring the right people into a Circle and organize the financial activity you choose to share. Keep the group context together.", visual: "circles" },
    { id: "split-bills", title: "Less awkward math.", accent: "Clearer shared costs.", copy: "Add an expense, choose who is included, and review each person's share. Track who paid and what is still owed.", visual: "split" },
    { id: "privacy", title: "Shared moments.", accent: "Personal boundaries.", copy: "Your group does not need your entire financial history. Keep personal finances private while sharing only what makes sense.", visual: "circles", link: { href: "/features/security", label: "Explore your data controls →" } },
    { id: "start", title: "Enjoy the shared moments.", accent: "Keep the money clear." },
  ] },
  { slug: "security", title: "Security", asset: "security", chapters: [
    { id: "overview", title: "Your financial data stays", accent: "under your control.", copy: "Your records deserve clear boundaries. Clover keeps review, traceability, and account controls part of the way you manage your money.", visual: "source" },
    { id: "uploaded-files", title: "Keep the record", accent: "behind the transaction.", copy: "Imported details stay connected to their source. Review the original evidence when something needs a closer look.", visual: "source" },
    { id: "review", title: "AI suggests.", accent: "You confirm.", copy: "Review extracted details and correct what needs attention. Your confirmed records should reflect your decisions—not an unexplained guess.", visual: "transactions" },
    { id: "private-account", title: "Your account.", accent: "Your choices.", copy: "Use your account controls to edit, export, or delete your data. Read how Clover handles your information before you bring in your records.", visual: "control", link: { href: "/privacy-policy", label: "Read the Privacy Policy →" } },
    { id: "start", title: "Your money. Your records.", accent: "Your control." },
  ] },
  { slug: "pro", title: "Pro", asset: "pro", chapters: [
    { id: "overview", title: "More perspective as", accent: "your finances grow.", copy: "Start free. Consider Pro when you want more guidance and tools alongside a more involved financial life.", visual: "accounts" },
    { id: "deeper-guidance", title: "Look beyond", accent: "the immediate question.", copy: "Explore advanced Adviser guidance to help connect spending, plans, and the wider financial picture. You choose which suggestions to act on.", visual: "adviser" },
    { id: "investment-context", title: "Keep the bigger", accent: "picture in view.", copy: "Bring investment tracking into the same financial picture, alongside the accounts, reports, budgets, and goals you already use.", visual: "reports" },
    { id: "compare", title: "Choose what works", accent: "for you.", copy: "Compare Free and Pro. Monthly and annual options are shown for your region, and you can keep using Clover for free.", visual: "pricing" },
    { id: "start", title: "More clarity,", accent: "when you’re ready for more." },
  ] },
];

export const FEATURE_STORY_MAP = new Map(FEATURE_STORIES.map((story) => [story.slug, story]));
