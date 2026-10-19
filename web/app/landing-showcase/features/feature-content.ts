import type { FeatureChapter, FeatureStory } from "@/lib/feature-stories";

// Preview-only copy derived from the production story. Never mutate the public stories.
const focused: Record<string, Partial<FeatureChapter>> = {
  transactions: { title: "Transactions.", accent: "Every detail in context." },
  accounts: { title: "Accounts.", accent: "Your money, together." },
  recurring: { title: "Recurring.", accent: "Know what’s coming next." },
  reports: { title: "Reports.", accent: "See the bigger picture." },
  adviser: { title: "Ask Clover.", accent: "Make sense of your money." },
  investments: { title: "Investments.", accent: "See how it all adds up." },
  budgeting: { title: "Budgeting.", accent: "Make room for real life." },
  goals: { title: "Goals.", accent: "One step closer." },
  circles: { title: "Circles.", accent: "Keep your group in sync." },
  "split-bills": { title: "Split Bills.", accent: "Clear shares. Less chasing.", copy: "Assign each item to the people sharing it. See everyone’s total, then send a payment request with your QR through the chat app you use." },
  "uploaded-files": { title: "Source records.", accent: "Keep the context." },
  review: { title: "Review.", accent: "AI suggests. You confirm." },
  "private-account": { title: "Your controls.", accent: "Your choices." },
  "deeper-guidance": { title: "Ask Clover.", accent: "Go a little deeper." },
  "investment-context": { title: "Reports.", accent: "Connect the bigger picture." },
};

export function featurePreviewStory(story: FeatureStory): FeatureStory {
  return {
    ...story,
    chapters: story.chapters
      .filter(chapter => !(story.slug === "understand-your-money" && chapter.id === "next-step") && !(story.slug === "manage-money-together" && chapter.id === "privacy"))
      .map<FeatureChapter>(chapter => {
        if (chapter.id !== "overview") return { ...chapter, ...focused[chapter.id] };
        return {
          ...chapter,
          visual: story.slug === "manage-money" ? "accounts" : story.slug === "manage-money-together" ? "circles" : story.slug === "security" ? "control" : chapter.visual,
          copy: story.slug === "plan-ahead" ? "Bring investments, budgets and goals together. Make space for today’s needs and tomorrow’s plans." : chapter.copy,
        };
      }),
  };
}
