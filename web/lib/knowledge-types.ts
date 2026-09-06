import { z } from "zod";

const localPath = z
  .string()
  .max(250)
  .regex(/^\/assets\/landing-screens\/[a-z0-9-]+\.webp$/);
export const contentSchema = z
  .object({
    title: z.string().trim().min(5).max(160),
    summary: z.string().trim().min(15).max(600),
    kind: z.enum(["help", "guide"]),
    category: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(80),
    market: z.enum(["all", "ph", "global"]).default("all"),
    sections: z
      .array(
        z.object({
          heading: z.string().min(2).max(150),
          body: z.string().min(5).max(12000),
        }),
      )
      .min(1)
      .max(30),
    questions: z
      .array(
        z.object({
          question: z.string().min(5).max(250),
          answer: z.string().min(5).max(3000),
        }),
      )
      .max(30)
      .default([]),
    sources: z
      .array(
        z.object({
          label: z.string().min(2).max(180),
          url: z.string().url().startsWith("https://").max(1500),
        }),
      )
      .max(20)
      .default([]),
    screenshot: localPath.optional(),
    screenshotAlt: z.string().max(300).optional(),
    reviewedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .refine(
    (value) => !value.screenshot || Boolean(value.screenshotAlt?.trim()),
    {
      message:
        "Describe the screenshot for readers using assistive technology.",
    },
  );
export type KnowledgeContent = z.infer<typeof contentSchema>;
export type KnowledgeEntry = {
  path: string;
  content: KnowledgeContent;
  order: number;
};
export type KnowledgeCategory = {
  slug: string;
  title: string;
  summary: string;
  icon: string;
};
export const contentPathSchema = z
  .string()
  .max(220)
  .regex(/^\/(?:guides\/[a-z0-9-]+|help\/[a-z0-9-]+\/[a-z0-9-]+)$/);
export const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  intervalDays: z.number().int().min(2).max(30),
  monthlyDraftLimit: z.number().int().min(1).max(12),
  backlogLimit: z.number().int().min(1).max(20),
  topics: z.array(z.string().trim().min(10).max(250)).min(1).max(30),
});
export const defaultAiSettings: z.infer<typeof aiSettingsSchema> = {
  enabled: false,
  intervalDays: 3,
  monthlyDraftLimit: 8,
  backlogLimit: 8,
  topics: [
    "Preparing a readable receipt photo for Clover",
    "Reviewing an imported statement before confirming transactions",
    "Keeping personal accounts private when using Circles",
  ],
};

export function searchKnowledge(entries: KnowledgeEntry[], query: string) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return entries
    .map((entry) => {
      const title = entry.content.title.toLocaleLowerCase();
      const text = [
        title,
        entry.content.summary,
        ...entry.content.sections.map((s) => s.body),
        ...entry.content.questions.map((q) => `${q.question} ${q.answer}`),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return {
        entry,
        score: terms.every((term) => text.includes(term))
          ? terms.reduce((sum, term) => sum + (title.includes(term) ? 5 : 1), 0)
          : -1,
      };
    })
    .filter((result) => result.score >= 0)
    .sort((a, b) => b.score - a.score || a.entry.order - b.entry.order)
    .map((result) => result.entry);
}
