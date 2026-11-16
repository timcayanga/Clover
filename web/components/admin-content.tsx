"use client";
import { useEffect, useState } from "react";
import { KnowledgeArticle } from "@/components/knowledge-article";
import { knowledgeCategories } from "@/lib/knowledge-categories";
import {
  contentSchema,
  defaultAiSettings,
  type KnowledgeContent,
  type KnowledgeEntry,
} from "@/lib/knowledge-types";
import styles from "./admin-content.module.css";
import articleStyles from "./knowledge.module.css";

type Item = KnowledgeEntry & {
  version: number;
  needsReview: boolean;
  archived: boolean;
  origin: string;
  published?: KnowledgeContent;
};
type Library = {
  items: Item[];
  settings: typeof defaultAiSettings;
  categoryOrder: string[];
  feedback: Array<{ path: string; helpful: boolean; count: number }>;
  runs: Array<{
    id: string;
    topic: string;
    status: string;
    details: string | null;
    tokens: number;
    createdAt: string;
  }>;
};
type Revision = {
  id: string;
  version: number;
  action: string;
  actor: string;
  createdAt: string;
  content: KnowledgeContent;
};
const newContent = (): KnowledgeContent => ({
  title: "",
  summary: "",
  kind: "help",
  category: "getting-started",
  market: "all",
  sections: [{ heading: "", body: "" }],
  questions: [],
  sources: [],
});
async function api(body?: unknown, history?: string) {
  const response = await fetch(
    `/api/admin/content${history ? `?history=${encodeURIComponent(history)}` : ""}`,
    {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed.");
  return result;
}

export function AdminContent() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [tab, setTab] = useState("library");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Item | null>(null);
  const [content, setContent] = useState<KnowledgeContent>(newContent);
  const [path, setPath] = useState("");
  const [order, setOrder] = useState(1000);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [verified, setVerified] = useState(false);
  const [history, setHistory] = useState<Revision[]>([]);
  const [settings, setSettings] = useState(defaultAiSettings);
  const [categoryOrder, setCategoryOrder] = useState(
    knowledgeCategories.map((c) => c.slug),
  );
  async function reload() {
    const data = (await api()) as Library;
    setLibrary(data);
    setSettings(data.settings);
    setCategoryOrder(data.categoryOrder);
    return data;
  }
  useEffect(() => {
    let active = true;
    api()
      .then((data: Library) => {
        if (active) {
          setLibrary(data);
          setSettings(data.settings);
          setCategoryOrder(data.categoryOrder);
        }
      })
      .catch((error) => {
        if (active) setNotice(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function choose(item: Item | null) {
    if (dirty && !window.confirm("Discard unsaved changes to this draft?"))
      return;
    setSelected(item);
    setContent(item?.content ?? newContent());
    setPath(item?.path ?? "");
    setOrder(item?.order ?? 1000);
    setDirty(false);
    setVerified(false);
    setPreview(false);
    setHistory([]);
  }
  function edit(patch: Partial<KnowledgeContent>) {
    setContent((current) => ({ ...current, ...patch }));
    setDirty(true);
    setVerified(false);
  }
  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await operation();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  function save(action: "save" | "publish" | "archive" | "restore") {
    void run(async () => {
      if (action === "save") contentSchema.parse(content);
      await api({
        action,
        path,
        version: selected?.version ?? 0,
        content,
        order,
        verified,
      });
      const data = await reload();
      const item = data.items.find((item) => item.path === path);
      setSelected(item ?? null);
      setDirty(false);
      setVerified(false);
      setNotice(
        action === "publish"
          ? "Approved version published."
          : action === "save"
            ? "Draft saved. The public article has not changed."
            : action === "archive"
              ? "Article archived. Its history is retained."
              : "Article restored.",
      );
    });
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 100000) {
      setNotice("Choose a text or Markdown file smaller than 100 KB.");
      return;
    }
    if (!/\.(md|txt)$/i.test(file.name)) {
      setNotice(
        "Use a .md or .txt file. Rich document import is not supported yet.",
      );
      return;
    }
    const text = await file.text();
    const groups = text.split(/^##\s+/m);
    const intro = groups.shift() ?? "";
    const title =
      intro.match(/^#\s+(.+)$/m)?.[1] ?? file.name.replace(/\.[^.]+$/, "");
    const summary = intro.replace(/^#.+$/m, "").trim().slice(0, 600);
    const sections = groups.length
      ? groups.map((group) => {
          const [heading, ...body] = group.split("\n");
          return { heading: heading.trim(), body: body.join("\n").trim() };
        })
      : [{ heading: "Instructions", body: text.replace(/^#.+$/m, "").trim() }];
    edit({ title, summary, sections });
    setNotice(
      "Imported as an unsaved draft. Review the text, links, and headings before saving. HTML is treated as text.",
    );
  }
  const visible =
    library?.items
      .filter(
        (item) =>
          (tab !== "review" || (item.needsReview && !item.archived)) &&
          `${item.content.title} ${item.content.category}`
            .toLowerCase()
            .includes(filter.toLowerCase()),
      )
      .sort((a, b) => a.order - b.order) ?? [];
  return (
    <div className={styles.root}>
      <fieldset className={styles.form} disabled={busy} aria-label="Content management">
      <p>
        Create and organize Help articles, FAQs, and Guides. AI drafts never
        publish automatically.
      </p>
      <div className={styles.toolbar}>
        {["library", "review", "organization", "ai", "feedback"].map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={tab === name}
            onClick={() => setTab(name)}
          >
            {
              (
                {
                  library: "Content library",
                  review: "Review queue",
                  organization: "Organization",
                  ai: "AI drafting",
                  feedback: "Article feedback",
                } as Record<string, string>
              )[name]
            }
          </button>
        ))}
      </div>
      {notice ? (
        <div className={styles.notice} role="status">
          {notice}
        </div>
      ) : null}
      {tab === "feedback" && library ? (
        <section className={styles.editor}>
          <h2>Article feedback</h2>
          <p>
            Reader votes help identify articles that need clarification. No
            customer financial records or search text are collected.
          </p>
          {library.feedback.length ? (
            library.feedback.map((row) => (
              <div
                className={styles.orderRow}
                key={`${row.path}-${row.helpful}`}
              >
                <span>
                  {library.items.find((item) => item.path === row.path)?.content
                    .title ?? row.path}
                </span>
                <strong>
                  {row.count} {row.helpful ? "helpful" : "not helpful"}
                </strong>
              </div>
            ))
          ) : (
            <p>No feedback yet.</p>
          )}
        </section>
      ) : null}
      {!library ? (
        <div className={styles.notice}>
          <p>
            {notice
              ? "Content editing requires the editorial database migration and a working connection. A failed save does not change published content."
              : "Loading content library…"}
          </p>
          {notice ? (
            <button
              onClick={() =>
                void run(async () => {
                  await reload();
                })
              }
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {(tab === "library" || tab === "review") && library ? (
        <>
          <div className={styles.toolbar}>
            <button className={styles.primary} onClick={() => choose(null)}>
              New article / FAQ
            </button>
            <span>{visible.length} items</span>
          </div>
          <div className={styles.layout}>
            <aside>
              <label>
                Find content
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Title or category"
                />
              </label>
              <div className={styles.library}>
                {visible.map((item) => (
                  <button
                    className={
                      selected?.path === item.path ? styles.selected : undefined
                    }
                    key={item.path}
                    onClick={() => choose(item)}
                  >
                    {item.content.title}
                    <small>
                      {item.archived
                        ? "Archived"
                        : item.needsReview
                          ? "Needs review"
                          : "Published"}{" "}
                      · {item.content.kind}
                      {item.origin === "ai" ? " · AI draft" : ""}
                    </small>
                  </button>
                ))}
              </div>
            </aside>
            <section className={styles.editor}>
              <h2>{selected ? "Edit content" : "New content"}</h2>
              <p className={styles.status}>
                Save first, preview, then approve the saved version. URLs are
                fixed after the first save to preserve existing links.
              </p>
              <label>
                Import a draft (.md or .txt)
                <input
                  type="file"
                  accept=".md,.txt,text/plain,text/markdown"
                  onChange={(e) => void importFile(e.target.files?.[0])}
                />
              </label>
              <div className={styles.fields}>
                <label>
                  Content type
                  <select
                    value={content.kind}
                    disabled={Boolean(selected)}
                    onChange={(e) =>
                      edit({ kind: e.target.value as KnowledgeContent["kind"] })
                    }
                  >
                    <option value="help">Help article / FAQ</option>
                    <option value="guide">Guide</option>
                  </select>
                </label>
                <label>
                  Category
                  <select
                    value={content.category}
                    onChange={(e) => edit({ category: e.target.value })}
                  >
                    {knowledgeCategories.map((category) => (
                      <option key={category.slug} value={category.slug}>
                        {category.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Public URL
                <input
                  value={path}
                  disabled={Boolean(selected)}
                  onChange={(e) => {
                    setPath(e.target.value);
                    setDirty(true);
                  }}
                  placeholder={
                    content.kind === "guide"
                      ? "/guides/your-guide-title"
                      : "/help/getting-started/your-question"
                  }
                />
              </label>
              <label>
                Title
                <input
                  value={content.title}
                  maxLength={160}
                  onChange={(e) => edit({ title: e.target.value })}
                />
              </label>
              <label>
                Direct answer / summary
                <textarea
                  value={content.summary}
                  maxLength={600}
                  onChange={(e) => edit({ summary: e.target.value })}
                />
                <small>
                  Also used as the search preview and page description.
                </small>
              </label>
              <div className={styles.fields}>
                <label>
                  Audience
                  <select
                    value={content.market}
                    onChange={(e) =>
                      edit({
                        market: e.target.value as KnowledgeContent["market"],
                      })
                    }
                  >
                    <option value="all">All regions</option>
                    <option value="ph">Philippines</option>
                    <option value="global">Global</option>
                  </select>
                </label>
                <label>
                  Display order
                  <input
                    type="number"
                    min={-20000}
                    max={100000}
                    value={order}
                    onChange={(e) => {
                      setOrder(Number(e.target.value));
                      setDirty(true);
                      setVerified(false);
                    }}
                  />
                  <small>
                    Lower numbers appear first. Applied when the draft is
                    approved.
                  </small>
                </label>
              </div>
              <h3>Article sections</h3>
              {content.sections.map((section, index) => (
                <div className={styles.block} key={index}>
                  <label>
                    Heading {index + 1}
                    <input
                      value={section.heading}
                      onChange={(e) =>
                        edit({
                          sections: content.sections.map((s, i) =>
                            i === index ? { ...s, heading: e.target.value } : s,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Body
                    <textarea
                      value={section.body}
                      onChange={(e) =>
                        edit({
                          sections: content.sections.map((s, i) =>
                            i === index ? { ...s, body: e.target.value } : s,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    disabled={content.sections.length === 1}
                    onClick={() =>
                      edit({
                        sections: content.sections.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    Remove section
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  edit({
                    sections: [...content.sections, { heading: "", body: "" }],
                  })
                }
              >
                Add section
              </button>
              <h3>Questions and answers</h3>
              {content.questions.map((question, index) => (
                <div className={styles.block} key={index}>
                  <label>
                    Question
                    <input
                      value={question.question}
                      onChange={(e) =>
                        edit({
                          questions: content.questions.map((q, i) =>
                            i === index
                              ? { ...q, question: e.target.value }
                              : q,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Answer
                    <textarea
                      value={question.answer}
                      onChange={(e) =>
                        edit({
                          questions: content.questions.map((q, i) =>
                            i === index ? { ...q, answer: e.target.value } : q,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    onClick={() =>
                      edit({
                        questions: content.questions.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    Remove question
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  edit({
                    questions: [
                      ...content.questions,
                      { question: "", answer: "" },
                    ],
                  })
                }
              >
                Add FAQ
              </button>
              <h3>Sources and screenshots</h3>
              {content.sources.map((source, index) => (
                <div className={styles.block} key={index}>
                  <label>
                    Source name
                    <input
                      value={source.label}
                      onChange={(e) =>
                        edit({
                          sources: content.sources.map((s, i) =>
                            i === index ? { ...s, label: e.target.value } : s,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Official HTTPS URL
                    <input
                      type="url"
                      value={source.url}
                      onChange={(e) =>
                        edit({
                          sources: content.sources.map((s, i) =>
                            i === index ? { ...s, url: e.target.value } : s,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    onClick={() =>
                      edit({
                        sources: content.sources.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove source
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  edit({
                    sources: [...content.sources, { label: "", url: "" }],
                  })
                }
              >
                Add source
              </button>
              <div className={styles.fields}>
                <label>
                  Sample Clover screen
                  <select
                    value={content.screenshot ?? ""}
                    onChange={(e) =>
                      edit({
                        screenshot: e.target.value || undefined,
                        screenshotAlt: e.target.value
                          ? "Actual Clover mobile interface with fictional sample data"
                          : undefined,
                      })
                    }
                  >
                    <option value="">No screenshot</option>
                    {[
                      "accounts",
                      "transactions",
                      "recurring",
                      "reports",
                      "adviser",
                      "investments",
                      "budget",
                      "goal",
                      "circles",
                      "split",
                    ].flatMap((screen) =>
                      ["ph", "global"].map((market) => (
                        <option
                          key={`${screen}-${market}`}
                          value={`/assets/landing-screens/${screen}-${market}.webp`}
                        >
                          {screen} · {market}
                        </option>
                      )),
                    )}
                  </select>
                </label>
                <label>
                  Source check date
                  <input
                    type="date"
                    value={content.reviewedAt ?? ""}
                    onChange={(e) =>
                      edit({ reviewedAt: e.target.value || undefined })
                    }
                  />
                </label>
              </div>
              {content.screenshot ? (
                <label>
                  Screenshot description
                  <input
                    value={content.screenshotAlt ?? ""}
                    onChange={(e) => edit({ screenshotAlt: e.target.value })}
                  />
                </label>
              ) : null}
              <div className={styles.toolbar}>
                <button
                  disabled={busy}
                  className={styles.primary}
                  onClick={() => save("save")}
                >
                  Save draft
                </button>
                <button onClick={() => setPreview(!preview)}>
                  {preview ? "Hide preview" : "Preview"}
                </button>
                {selected?.published ? (
                  <a href={path} target="_blank" rel="noopener noreferrer">
                    View published article ↗
                  </a>
                ) : null}
              </div>
              {preview ? (
                <>
                  <div className={styles.toolbar}>
                    <button
                      aria-pressed={!mobile}
                      onClick={() => setMobile(false)}
                    >
                      Desktop preview
                    </button>
                    <button
                      aria-pressed={mobile}
                      onClick={() => setMobile(true)}
                    >
                      Mobile width
                    </button>
                  </div>
                  <div
                    className={`${styles.preview} ${mobile ? styles.phonePreview : ""} ${articleStyles.site}`}
                  >
                    <KnowledgeArticle
                      entry={{ path, content, order }}
                      preview
                    />
                  </div>
                </>
              ) : null}
              <hr />
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={verified}
                  disabled={dirty || !selected}
                  onChange={(e) => setVerified(e.target.checked)}
                />
                I reviewed this saved draft, its sources, and its Clover
                instructions. It contains no private customer information.
              </label>
              <div className={styles.toolbar}>
                <button
                  disabled={busy || dirty || !selected || !verified}
                  className={styles.primary}
                  onClick={() => save("publish")}
                >
                  Approve & publish
                </button>
                {selected ? (
                  <>
                    <button
                      disabled={busy || dirty}
                      onClick={() =>
                        save(selected.archived ? "restore" : "archive")
                      }
                    >
                      {selected.archived
                        ? "Restore article"
                        : "Archive article"}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await api(undefined, path);
                          setHistory(result.revisions);
                        })
                      }
                    >
                      Revision history
                    </button>
                  </>
                ) : null}
              </div>
              {history.map((revision) => (
                <div className={styles.history} key={revision.id}>
                  <p>
                    Version {revision.version} · {revision.action} ·{" "}
                    {revision.createdAt.slice(0, 10)} · {revision.actor}
                  </p>
                  <button
                    onClick={() => {
                      edit(revision.content);
                      setNotice(
                        "Previous version loaded as an unsaved draft. Save and approve to publish it.",
                      );
                    }}
                  >
                    Use as draft
                  </button>
                </div>
              ))}
            </section>
          </div>
        </>
      ) : null}
      {tab === "organization" && library ? (
        <section className={styles.editor}>
          <h2>Help Center topic order</h2>
          <p>
            Move topics with the buttons, then save. Change an article’s Display
            order in the editor to arrange articles within its topic.
          </p>
          {categoryOrder.map((slug, index) => (
            <div className={styles.orderRow} key={slug}>
              <span>
                {knowledgeCategories.find((c) => c.slug === slug)?.title}
              </span>
              <button
                aria-label={`Move ${slug} up`}
                disabled={index === 0}
                onClick={() => {
                  const next = [...categoryOrder];
                  [next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ];
                  setCategoryOrder(next);
                }}
              >
                ↑
              </button>
              <button
                aria-label={`Move ${slug} down`}
                disabled={index === categoryOrder.length - 1}
                onClick={() => {
                  const next = [...categoryOrder];
                  [next[index + 1], next[index]] = [
                    next[index],
                    next[index + 1],
                  ];
                  setCategoryOrder(next);
                }}
              >
                ↓
              </button>
            </div>
          ))}
          <div className={styles.toolbar}>
            <button
              disabled={busy}
              className={styles.primary}
              onClick={() =>
                void run(async () => {
                  await api({ action: "categories", order: categoryOrder });
                  setNotice("Topic order saved.");
                })
              }
            >
              Save topic order
            </button>
          </div>
        </section>
      ) : null}
      {tab === "ai" && library ? (
        <section className={`${styles.editor} ${styles.settings}`}>
          <h2>AI drafting</h2>
          <p>
            Drafts use approved official sources and public Clover help—not
            customer records. Review every draft before publication. Scheduled
            checks run on production; manual checks use the same limits.
          </p>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) =>
                setSettings({ ...settings, enabled: e.target.checked })
              }
            />
            Enable recurring drafts
          </label>
          <div className={styles.fields}>
            <label>
              Days between attempts
              <input
                type="number"
                min={2}
                max={30}
                value={settings.intervalDays}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    intervalDays: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Monthly attempt limit
              <input
                type="number"
                min={1}
                max={12}
                value={settings.monthlyDraftLimit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    monthlyDraftLimit: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <label>
            Maximum review backlog
            <input
              type="number"
              min={1}
              max={20}
              value={settings.backlogLimit}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  backlogLimit: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Approved topics (one per line)
            <textarea
              value={settings.topics.join("\n")}
              onChange={(e) =>
                setSettings({ ...settings, topics: e.target.value.split("\n") })
              }
            />
          </label>
          <p className={styles.status}>
            Each attempt allows at most 2 web-search calls and 4,000 output
            tokens. Failed attempts count toward limits. Set an API-project
            spending limit as an additional cost safeguard. Requires
            OPENAI_API_KEY and CRON_SECRET on the server.
          </p>
          <div className={styles.toolbar}>
            <button
              disabled={busy}
              className={styles.primary}
              onClick={() =>
                void run(async () => {
                  await api({ action: "settings", settings });
                  setNotice("AI settings saved.");
                })
              }
            >
              Save AI settings
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await api({ action: "generate" });
                  await reload();
                  setNotice(result.skipped ?? result.message);
                })
              }
            >
              Check for next draft
            </button>
          </div>
          <h3>Recent attempts and review notes</h3>
          {library.runs.length ? (
            library.runs.map((run) => (
              <details key={run.id} className={styles.history}>
                <summary>
                  {run.topic} · {run.status}
                </summary>
                <p>
                  {run.createdAt.slice(0, 10)} · {run.tokens.toLocaleString()}{" "}
                  tokens
                </p>
                <p>{run.details}</p>
              </details>
            ))
          ) : (
            <p>No attempts yet.</p>
          )}
        </section>
      ) : null}
      </fieldset>
    </div>
  );
}
