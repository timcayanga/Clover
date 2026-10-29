"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { askPageContext, askPagePrompts, type AskPage, type AskPageContext } from "../../shared/ask-clover-page";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
const AdviserChat = dynamic(() => import("@/components/adviser-chat").then(module => module.AdviserChat), {loading: () => <p role="status">Opening Ask Clover…</p>});
import { selectedWorkspaceEventName } from "@/lib/workspace-selection";
import { hasFullFeatureAccess } from "@/lib/beta-access";
import { getNavigationIconSrc } from "@/lib/navigation-icons";

type AskCloverContext = AskPage;
type PlanTier = "free" | "pro" | "premium" | "unknown";

type ContextualAskCloverProps = {
  context: AskCloverContext;
  planTier?: PlanTier;
  navigation?: ReactNode;
  captureLinks?: boolean;
};

const contextCopy = {
  accounts: { label: "Ask Clover about your accounts" },
  transactions: { label: "Ask Clover about your transactions" },
  recurring: { label: "Ask Clover about recurring payments" },
  budgeting: { label: "Plan a budget with Ask Clover" },
  goals: { label: "Plan a goal with Ask Clover" },
};

export function ContextualAskClover({ context, planTier = "unknown", navigation, captureLinks = false }: ContextualAskCloverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [resolvedPlanTier, setResolvedPlanTier] = useState<PlanTier>(planTier);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const pathname = usePathname();
  const [pageContext, setPageContext] = useState<AskPageContext>(() => askPageContext(`/${context}`));
  const legacy = context in contextCopy ? contextCopy[context as keyof typeof contextCopy] : undefined;
  const copy = { label: legacy?.label || "Open Ask Clover", title: pageContext.title, prompts: askPagePrompts(pageContext).map((prompt, i) => ({id: `${context}-${i}`, group: context, label: prompt, prompt})) };
  const openPanel = (prompt?: string) => {
    const hints = Object.fromEntries(new URLSearchParams(window.location.search));
    const scope = document.querySelector<HTMLElement>("[data-ask-page-context]");
    if (scope) { try { Object.assign(hints, JSON.parse(scope.dataset.askPageContext || "{}")); } catch { /* Unavailable hints do not block chat. */ } }
    setPageContext({...askPageContext(pathname || `/${context}`, hints), ...(prompt ? {prompt:prompt.slice(0,4000)} : {})});
    setIsOpen(true);
  };
  useEffect(() => {
    if (!captureLinks) return;
    const intercept = (event: MouseEvent) => {
      if (window.innerWidth > 1100 || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.closest(".contextual-ask-clover__panel")) return;
      const target = new URL(link.href,window.location.href);
      if (target.origin !== window.location.origin || target.pathname !== "/adviser") return;
      event.preventDefault(); event.stopPropagation(); openPanel(target.searchParams.get("prompt") || undefined);
    };
    document.addEventListener("click",intercept,true);
    return () => document.removeEventListener("click",intercept,true);
  }, [captureLinks, pathname, context]);
  useEffect(() => { setIsOpen(false); }, [pathname]);
  useEffect(() => { const close = () => setIsOpen(false); window.addEventListener(selectedWorkspaceEventName, close); return () => window.removeEventListener(selectedWorkspaceEventName, close); }, []);
  useEffect(() => {
    if (!isOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const background = Array.from(document.body.children).filter(el => el instanceof HTMLElement && !el.matches(".contextual-ask-clover__panel, .contextual-ask-clover__dismiss-layer, script, nextjs-portal")) as HTMLElement[];
    const previous = background.map(el => el.inert);
    background.forEach(el => { el.inert = true; });
    return () => { document.body.style.overflow = overflow; background.forEach((el,i) => { el.inert = previous[i]; }); };
  }, [isOpen]);

  useEffect(() => {
    if (planTier !== "unknown") {
      setResolvedPlanTier(planTier);
    }
  }, [planTier]);

  useEffect(() => {
    if (!isOpen || resolvedPlanTier !== "unknown") {
      return;
    }

    const controller = new AbortController();
    void fetch("/api/me", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load plan");
        }
        const payload = (await response.json()) as { user?: { planTier?: string } };
        setResolvedPlanTier(payload.user?.planTier === "premium" ? "premium" : payload.user?.planTier === "pro" ? "pro" : "free");
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResolvedPlanTier("free");
        }
      });

    return () => controller.abort();
  }, [isOpen, resolvedPlanTier]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Tab") {
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex="0"]');
        const visible = Array.from(focusable || []).filter(element => element.getClientRects().length > 0);
        const first = visible[0], last = visible[visible.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if (event.key === "Escape") {
        setIsOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    window.requestAnimationFrame(() => panelRef.current?.focus());
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  const closePanel = () => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <span hidden={captureLinks} className={navigation ? "contextual-ask-clover contextual-ask-clover--navigation" : "contextual-ask-clover"}>
      <button
        ref={triggerRef}
        type="button"
        className={navigation ? "shell-bottom-nav__item contextual-ask-clover__nav-trigger" : "contextual-ask-clover__trigger"}
        aria-label={copy.label}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => { if (isOpen) closePanel(); else openPanel(); }}
      >
        {navigation || <Image
          src={getNavigationIconSrc("adviser")}
          alt=""
          width={96}
          height={96}
          className="contextual-ask-clover__icon"
          aria-hidden="true"
        />}
        <span className="contextual-ask-clover__tooltip" role="tooltip">
          {copy.label}
        </span>
      </button>
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                type="button"
                className="contextual-ask-clover__dismiss-layer"
                aria-label="Close Ask Clover"
                tabIndex={-1}
                onClick={closePanel}
              />
              <section
                ref={panelRef}
                className="contextual-ask-clover__panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
              >
                <header className="contextual-ask-clover__panel-header">
                  <div className="contextual-ask-clover__panel-title">
                    <Image src={getNavigationIconSrc("adviser")} alt="" width={96} height={96} aria-hidden="true" />
                    <div>
                      <p className="eyebrow">Ask Clover</p>
                      <h2 id={titleId}>{copy.title}</h2>
                    </div>
                  </div>
                  <button type="button" className="contextual-ask-clover__close" aria-label="Close Ask Clover" onClick={closePanel}>
                    <span aria-hidden="true">×</span>
                  </button>
                </header>
                <div className="contextual-ask-clover__chat">
                  {resolvedPlanTier === "unknown" ? (
                    <p className="contextual-ask-clover__loading" role="status">
                      Getting Ask Clover ready...
                    </p>
                  ) : (
                    <AdviserChat
                      prompts={copy.prompts}
                      isPro={hasFullFeatureAccess(resolvedPlanTier)}
                      storageKey={`clover-adviser-chat-${context}-${pageContext.transactionId || pageContext.circleId || pageContext.accountId || "page"}-v2`}
                      surface={context}
                      pageContext={pageContext}
                      initialPrompt={pageContext.prompt}
                      pageLabel={copy.title}
                    />
                  )}
                </div>
              </section>
            </>,
            document.body
          )
        : null}
    </span>
  );
}
