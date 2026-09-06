// Run only against the disposable local editorial database. The provider is mocked.
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { generateKnowledgeDraft } from "../lib/knowledge-ai";
import { defaultAiSettings } from "../lib/knowledge-types";
const url = new URL(process.env.DATABASE_URL ?? "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/clover_editorial_test");
async function main() {
  const originalFetch = global.fetch;
  let calls = 0;
  process.env.OPENAI_API_KEY = "local-fake-key-not-sent";
  global.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.openai.com/v1/responses");
    const request = JSON.parse(String(init?.body));
    assert.equal(request.store, false);
    assert.equal(request.max_output_tokens, 4000);
    assert.equal(request.max_tool_calls, 2);
    calls++;
    return Response.json({
      status: "completed",
      usage: { total_tokens: 100 },
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                content: {
                  title: "Local AI receipt preparation test",
                  summary:
                    "A fictional draft for testing approval boundaries without calling an AI provider.",
                  kind: "help",
                  category: "uploading-reviewing",
                  market: "all",
                  sections: [
                    {
                      heading: "Check your record",
                      body: "Fictional test instructions, not a published guide.",
                    },
                  ],
                  questions: [],
                  sources: [
                    { label: "Clover help", url: "https://clover.ph/help" },
                  ],
                },
                reviewNotes: "Local mocked provider. Verify before approval.",
              }),
            },
          ],
        },
      ],
    });
  };
  try {
    await prisma.knowledgeSettings.upsert({
      where: { id: "editorial" },
      create: { ai: { ...defaultAiSettings, enabled: false } },
      update: { ai: { ...defaultAiSettings, enabled: false } },
    });
    assert("skipped" in (await generateKnowledgeDraft()));
    assert.equal(calls, 0);
    await prisma.knowledgeSettings.update({
      where: { id: "editorial" },
      data: {
        ai: {
          ...defaultAiSettings,
          enabled: true,
          backlogLimit: 20,
          topics: ["Local receipt preparation test"],
        },
      },
    });
    const result = await generateKnowledgeDraft();
    assert("path" in result);
    assert.equal(calls, 1);
    const article = await prisma.knowledgeArticle.findUniqueOrThrow({
      where: { path: result.path },
    });
    assert.equal(article.published, null);
    assert.equal(article.needsReview, true);
    assert.equal(article.origin, "ai");
    assert("skipped" in (await generateKnowledgeDraft()));
    assert.equal(calls, 1);
    console.log(
      "AI draft regression passed: pause, bounded request, unpublished draft, provenance, and cadence lock. No provider calls made.",
    );
  } finally {
    global.fetch = originalFetch;
    await prisma.knowledgeSettings.update({
      where: { id: "editorial" },
      data: { ai: defaultAiSettings },
    });
    await prisma.$disconnect();
  }
}
void main();
