import {
  helpSections,
  publicHelpSections,
  simplifyHelpText,
} from "@/lib/help-center";
import { currentProductHelpSections } from "@/lib/help-center-current";
import type { KnowledgeContent, KnowledgeEntry } from "@/lib/knowledge-types";
export { knowledgeCategories } from "@/lib/knowledge-categories";
import { guideSeeds } from "@/lib/knowledge-guides";

const categoryBySource: Record<string, string> = {
  "getting-started": "getting-started",
  "importing-reviewing": "uploading-reviewing",
  "modern-imports": "uploading-reviewing",
  "transactions-categories": "manage-money",
  "profiles-accounts": "account-security",
  "accounts-workspaces": "account-security",
  "recurring-commitments": "manage-money",
  "gain-insights-current": "understand-money",
  "reports-adviser-goals": "understand-money",
  "plan-ahead-current": "plan-ahead",
  "investments-current": "plan-ahead",
  "grow-together-current": "money-together",
  "split-bills": "money-together",
  "security-controls-current": "account-security",
  "privacy-security-data": "account-security",
  "billing-plan": "plans-billing",
  troubleshooting: "troubleshooting",
};
const clean = (text: string) =>
  simplifyHelpText(text)
    .replace(/finance setups/gi, "Profiles")
    .replace(/finance setup/gi, "Profile")
    .replace(/\bworkspace(s)?\b/gi, (_match, plural) =>
      plural ? "Profiles" : "Profile",
    );
const sourceSections = [...helpSections, ...currentProductHelpSections];
const allSections = [...sourceSections, ...publicHelpSections];
const entries = new Map<string, KnowledgeEntry>();
// Every legacy URL remains resolvable; canonical article cards use the original source URL.
export const legacyKnowledgePaths = new Map<string, string>();
for (const section of allSections) {
  for (const article of section.articles) {
    const owner =
      sourceSections.find((s) =>
        s.articles.some((a) => a.slug === article.slug),
      ) ?? section;
    const path = `/help/${owner.slug}/${article.slug}`;
    legacyKnowledgePaths.set(`/help/${section.slug}/${article.slug}`, path);
    if (entries.has(path)) continue;
    let category = categoryBySource[owner.slug] ?? "getting-started";
    if (/budget|goal|investment/i.test(article.title)) category = "plan-ahead";
    if (/add an account|account balance|delete an account/i.test(article.title))
      category = "manage-money";
    const screen = /add an account|account balance/i.test(article.title)
      ? "accounts"
      : /read Clover reports/i.test(article.title)
        ? "reports"
        : /Adviser recommendations/i.test(article.title)
          ? "adviser"
          : /create and manage a budget/i.test(article.title)
            ? "budget"
            : /add or import investment/i.test(article.title)
              ? "investments"
              : /circles, roles/i.test(article.title)
                ? "circles"
                : /create a split bill/i.test(article.title)
                  ? "split"
                  : /how recurring detection/i.test(article.title)
                    ? "recurring"
                    : undefined;
    const content: KnowledgeContent = {
      title: clean(article.title),
      summary: clean(article.summary),
      kind: "help",
      category,
      market: "all",
      sections: article.steps.length
        ? article.steps.map((body, index) => ({
            heading: `Step ${index + 1}`,
            body: clean(body),
          }))
        : article.questions.map((q) => ({
            heading: clean(q.question),
            body: clean(q.answer),
          })),
      questions: article.steps.length
        ? article.questions.map((q) => ({
            question: clean(q.question),
            answer: clean(q.answer),
          }))
        : [],
      sources: [],
      ...(screen
        ? {
            screenshot: `/assets/landing-screens/${screen}-ph.webp`,
            screenshotAlt: `Actual Clover ${screen} mobile screen with fictional sample data`,
          }
        : {}),
    };
    if (category === "plans-billing") {
      content.questions = content.questions.map((question) =>
        /how much.*cost/i.test(question.question)
          ? {
              ...question,
              answer:
                "See the Pricing page for the comparison shown for your region. Review the amount, currency, and billing interval shown at checkout before subscribing; the checkout terms govern the subscription.",
            }
          : question,
      );
      content.sections = content.sections.map((section) => ({
        ...section,
        body: section.body
          .replace(/Review the Free limits\./, "Review what Free includes.")
          .replace(
            /Compare them with the Pro limits\./,
            "Compare Free with Pro. Where a table labels limits as planned, those limits are not yet enabled.",
          ),
      }));
    }
    entries.set(path, { path, content, order: entries.size + 20 });
  }
}
// Focused, current answers appear first. Screen captures are real UI with fictional data.
const additions: Array<{ slug: string; content: KnowledgeContent }> = [
  {
    slug: "your-first-upload",
    content: {
      kind: "help",
      category: "getting-started",
      market: "all",
      title: "How do I upload my first financial records?",
      summary:
        "Start with one clear statement or receipt. Check the active Profile, upload the file, and review what Clover found before adding more history.",
      sections: [
        {
          heading: "Choose the right Profile",
          body: "Check which Profile is active before adding records. Profiles keep separate financial pictures; switching Profiles does not move existing transactions.",
        },
        {
          heading: "Choose a file",
          body: "On mobile, open the + menu. Use Photo Library for an existing photo or Upload Files for a statement or spreadsheet saved on your device. Start with one account and a period you can easily verify.",
        },
        {
          heading: "Review the result",
          body: "Check dates, accounts, amounts, and categories against the original. Correct details that need attention and confirm only the records you recognize. Keep the original file for reference.",
        },
      ],
      questions: [
        {
          question: "Do I have to enter every transaction myself?",
          answer:
            "No. Clover can extract records from your files. Review the results rather than rebuilding every row. You can still add missing transactions manually.",
        },
        {
          question:
            "Should I upload the same statement again if it is taking time?",
          answer:
            "Check the import status first. Repeated uploads make review harder. If processing fails, keep the error reference and contact support without sending account passwords or one-time codes.",
        },
      ],
      sources: [],
    },
  },
  {
    slug: "goals-as-cards",
    content: {
      kind: "help",
      category: "plan-ahead",
      market: "all",
      title: "Can I create more than one savings goal?",
      summary:
        "Yes. Goals uses a card directory so you can keep several goals separate, including goals with the same purpose.",
      sections: [
        {
          heading: "Create a separate goal",
          body: "Open Goals and choose the create action. Set the purpose, amount, currency, and target details for that goal. Create another card for a different goal instead of replacing the existing one.",
        },
        {
          heading: "Understand progress",
          body: "Each goal belongs to the active Profile. Progress reflects the relevant financial activity; creating a goal does not reserve or transfer money into a bank account.",
        },
      ],
      questions: [
        {
          question: "Does a new goal replace my previous goal?",
          answer:
            "No. New goals are separate. An older account goal may also appear as a separate card so its history remains available.",
        },
      ],
      sources: [],
    },
  },
  {
    slug: "mobile-navigation",
    content: {
      kind: "help",
      category: "manage-money",
      market: "all",
      title: "Where are the menu and add buttons on mobile?",
      summary:
        "Use the bottom navigation for the main pages, the top-right menu for other areas, and the + action to add records.",
      sections: [
        {
          heading: "Move between pages",
          body: "The bottom navigation gives you Home, Transactions, Adviser, and Account. Use the top-right menu to reach other Clover pages. A Back button appears at the top left when the current page has a parent.",
        },
        {
          heading: "Use page actions",
          body: "Adviser appears without a surrounding button container where available. Page-specific add and currency controls appear near the menu. The available actions depend on the page.",
        },
      ],
      questions: [],
      sources: [],
      screenshot: "/assets/landing-screens/transactions-ph.webp",
      screenshotAlt:
        "Actual Clover Transactions mobile interface with sample financial data and bottom navigation",
    },
  },
];
for (const item of additions) {
  const path = `/help/${item.content.category}/${item.slug}`;
  entries.set(path, {
    path,
    content: item.content,
    order: entries.size - 10000,
  });
}
export const knowledgeSeeds: KnowledgeEntry[] = [
  ...entries.values(),
  ...guideSeeds,
];
export function categoryForLegacy(slug: string) {
  return categoryBySource[slug];
}
