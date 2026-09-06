import type { KnowledgeCategory } from "@/lib/knowledge-types";
export const knowledgeCategories: KnowledgeCategory[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    summary: "Your first Profile, first upload, and next steps.",
    icon: "home",
  },
  {
    slug: "uploading-reviewing",
    title: "Uploading & reviewing",
    summary: "Statements, receipts, spreadsheets, and details to check.",
    icon: "review",
  },
  {
    slug: "manage-money",
    title: "Manage Money",
    summary: "Accounts, transactions, categories, and recurring payments.",
    icon: "transactions",
  },
  {
    slug: "understand-money",
    title: "Understand Your Money",
    summary: "Find answers with Reports and Adviser.",
    icon: "reports",
  },
  {
    slug: "plan-ahead",
    title: "Plan Ahead",
    summary: "Investments, budgets, and more than one goal.",
    icon: "goals",
  },
  {
    slug: "money-together",
    title: "Manage Money Together",
    summary: "Circles, shared expenses, and Split Bills.",
    icon: "circles",
  },
  {
    slug: "account-security",
    title: "Account & security",
    summary: "Profiles, access, privacy, and your data controls.",
    icon: "security",
  },
  {
    slug: "plans-billing",
    title: "Plans & billing",
    summary: "Free, Pro, and managing your subscription.",
    icon: "plan",
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    summary: "Missing details, unexpected results, and getting help.",
    icon: "help",
  },
];
