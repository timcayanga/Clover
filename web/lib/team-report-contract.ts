import { z } from "zod";
export const teamReportSchema = z.object({
  agent: z.enum(["web-analyst", "analytics-reviewer"]),
  reportKey: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  title: z.string().trim().min(1).max(200),
  markdown: z.string().trim().min(1).max(100000),
});
export type TeamReport = z.infer<typeof teamReportSchema>;
