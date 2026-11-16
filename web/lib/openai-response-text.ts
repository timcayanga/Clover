const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

/** Display/parse the final answer, never a preamble. Keep the original output
 * items (including phase) intact when replaying a tool conversation upstream.
 */
export const extractFinalOpenAIText = (payload: unknown): string | null => {
  const response = record(payload);
  if (!response) return null;
  const output = Array.isArray(response.output) ? response.output : [];
  const messages = output.map(record).filter((item): item is Record<string, unknown> =>
    Boolean(item && Array.isArray(item.content)));
  if (messages.length) {
    const final = messages.filter(item => item.phase === "final_answer");
    const selected = final.length ? final : messages.filter(item => item.phase !== "commentary");
    const text = selected.map(item => (item.content as unknown[])
      .map(record)
      .filter(part => part?.type === "output_text" && typeof part.text === "string")
      .map(part => part!.text as string)
      .join("")).join("\n\n").trim();
    return text || null;
  }
  return typeof response.output_text === "string" && response.output_text.trim()
    ? response.output_text.trim()
    : null;
};

/** Responses emits output_item.added before a message's text deltas. Track both
 * identities because old/new providers and fixtures use either item or index.
 * Unphased legacy messages remain supported; explicit commentary stays hidden.
 */
export const createOpenAIFinalTextStream = () => {
  const phases = new Map<string, unknown>();
  return (event: unknown): string | null => {
    const data = record(event);
    if (!data) return null;
    const item = record(data.item);
    if (data.type === "response.output_item.added" || data.type === "response.output_item.done") {
      if (item) {
        if (typeof item.id === "string") phases.set(`id:${item.id}`, item.phase ?? null);
        if (typeof data.output_index === "number") phases.set(`index:${data.output_index}`, item.phase ?? null);
      }
      return null;
    }
    if (data.type !== "response.output_text.delta" || typeof data.delta !== "string") return null;
    const phase = (typeof data.item_id === "string" ? phases.get(`id:${data.item_id}`) : undefined)
      ?? (typeof data.output_index === "number" ? phases.get(`index:${data.output_index}`) : undefined);
    return phase === "commentary" ? null : data.delta;
  };
};
