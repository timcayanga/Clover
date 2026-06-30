"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AdviserTrackedLink } from "@/components/adviser-tracked-link";

export type AdviserSectionCard = {
  id: string;
  title: string;
  summary: string;
  evidence: string;
  ctaLabel: string;
  href: string;
  tone: "positive" | "warning" | "neutral";
  group: string;
  emoji: string;
};

type AdviserSectionCarouselProps = {
  title: string;
  cards: AdviserSectionCard[];
  ariaLabel: string;
};

const emptyCopyByTitle: Record<string, { title: string; body: string }> = {
  "What Clover noticed": {
    title: "Nothing urgent stands out yet",
    body: "Clover will surface clearer patterns here once there is enough account or transaction activity to trust.",
  },
  "What you should do": {
    title: "No immediate action needed",
    body: "When something needs a review, Clover will point you to the exact place to check it.",
  },
  "How you can improve": {
    title: "No strong habit signal yet",
    body: "As more history builds up, Clover will turn repeated patterns into simple coaching ideas.",
  },
};

export function AdviserSectionCarousel({ title, cards, ariaLabel }: AdviserSectionCarouselProps) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const slideCount = cards.length;

  const scrollToIndex = (index: number) => {
    const rail = railRef.current;
    if (!rail || slideCount === 0) {
      return;
    }

    const clampedIndex = Math.max(0, Math.min(index, slideCount - 1));
    const slideWidth = rail.clientWidth || 1;
    rail.scrollTo({ left: slideWidth * clampedIndex, behavior: "smooth" });
    setActiveIndex(clampedIndex);
  };

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) {
      return;
    }

    let frame = 0;

    const update = () => {
      const width = rail.clientWidth || 1;
      const index = Math.max(0, Math.min(slideCount - 1, Math.round(rail.scrollLeft / width)));
      setActiveIndex(index);
    };

    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };

    update();
    rail.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      rail.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
      window.cancelAnimationFrame(frame);
    };
  }, [slideCount]);

  const dots = useMemo(() => cards.map((card) => card.id), [cards]);

  return (
    <section className="adviser-section glass">
      <p className="eyebrow">{title}</p>

      {cards.length === 0 ? (
        <div className="adviser-section-empty">
          <strong>{emptyCopyByTitle[title]?.title ?? "Nothing to show yet"}</strong>
          <p>{emptyCopyByTitle[title]?.body ?? "Clover will fill this in when there is enough reliable data."}</p>
        </div>
      ) : null}

      {cards.length > 0 ? (
        <>
          <div className="adviser-card-grid adviser-card-grid--desktop" aria-label={ariaLabel}>
            {cards.map((card) => (
              <AdviserTrackedLink
                key={card.id}
                href={card.href}
                kind="card"
                group={card.group}
                itemId={card.id}
                label={card.title}
                className="adviser-card adviser-card--link glass"
              >
                <div className="adviser-card__title-row">
                  <span className="adviser-card__emoji" aria-hidden="true">
                    {card.emoji}
                  </span>
                  <strong>{card.title}</strong>
                </div>
                <p>{card.summary}</p>
                <small>{card.evidence}</small>
                <span className="button button-primary button-small adviser-card__cta">{card.ctaLabel}</span>
              </AdviserTrackedLink>
            ))}
          </div>

          <div className="adviser-carousel adviser-carousel--mobile" aria-label={ariaLabel}>
            <div className="adviser-carousel__viewport">
              <div ref={railRef} className="adviser-carousel__rail">
                {cards.map((card) => (
                  <div key={card.id} className="adviser-carousel__slide">
                    <AdviserTrackedLink
                      href={card.href}
                      kind="card"
                      group={card.group}
                      itemId={card.id}
                      label={card.title}
                      className="adviser-card adviser-card--link glass adviser-carousel__card"
                    >
                      <div className="adviser-card__title-row">
                        <span className="adviser-card__emoji" aria-hidden="true">
                          {card.emoji}
                        </span>
                        <strong>{card.title}</strong>
                      </div>
                      <p>{card.summary}</p>
                      <small>{card.evidence}</small>
                      <span className="button button-primary button-small adviser-card__cta">{card.ctaLabel}</span>
                    </AdviserTrackedLink>
                  </div>
                ))}
              </div>
            </div>

            <div className="adviser-carousel__footer" aria-label={`${title} carousel navigation`}>
              <button
                type="button"
                className="adviser-carousel__button adviser-carousel__button--footer adviser-carousel__button--prev"
                aria-label={`Previous ${title.toLowerCase()}`}
                onClick={() => scrollToIndex(activeIndex - 1)}
                disabled={activeIndex === 0}
              >
                <span aria-hidden="true">‹</span>
              </button>

              <div className="adviser-carousel__status">
                <div className="adviser-carousel__dots">
                  {dots.map((dotId, index) => (
                    <button
                      key={dotId}
                      type="button"
                      className={`adviser-carousel__dot${index === activeIndex ? " is-active" : ""}`}
                      onClick={() => scrollToIndex(index)}
                      aria-label={`Go to ${title.toLowerCase()} card ${index + 1}`}
                    />
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="adviser-carousel__button adviser-carousel__button--footer adviser-carousel__button--next"
                aria-label={`Next ${title.toLowerCase()}`}
                onClick={() => scrollToIndex(activeIndex + 1)}
                disabled={activeIndex >= slideCount - 1}
              >
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
