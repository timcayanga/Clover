import { parseAdviserChart } from "../../shared/adviser-chart";
import { z } from "zod";
export const adviserHistoryInput = z.object({
  id: z.string().uuid(),
  revision: z.number().int().min(0),
  messages: z.array(z.object({role:z.enum(["user","assistant"]),content:z.string().min(1).max(16000),visualization:z.unknown().optional().transform(value=>value===undefined?undefined:parseAdviserChart(value)??undefined)}).strict()).min(2).max(100),
}).strict().refine(value => value.messages[0].role === "user" && value.messages.at(-1)?.role === "assistant", "Save completed conversations only.");
