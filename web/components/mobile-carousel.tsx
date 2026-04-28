"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";

type MobileCarouselProps = {
  ariaLabel: string;
  className?: string;
  slides: ReactNode[];
  labels: string[];
};

export function MobileCarousel({ ariaLabel, className = "", slides, labels }: MobileCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const safeSlides = useMemo(() => slides.filter(Boolean), [slides]);
  const safeLabels = useMemo(() => labels.filter(Boolean), [labels]);
  const currentIndex = safeSlides.length === 0 ? 0 : activeIndex % safeSlides.length;

  if (safeSlides.length === 0) {
    return null;
  }

  const prevSlide = () => {
    setActiveIndex((index) => (index - 1 + safeSlides.length) % safeSlides.length);
  };

  const nextSlide = () => {
    setActiveIndex((index) => (index + 1) % safeSlides.length);
  };

  return (
    <div className={`landing-carousel ${className}`.trim()} aria-label={ariaLabel}>
      <div className="landing-carousel__viewport">
        <div className="landing-carousel__slide">{safeSlides[currentIndex]}</div>
        {safeSlides.length > 1 ? (
          <>
            <button className="landing-carousel__button landing-carousel__button--prev" type="button" onClick={prevSlide} aria-label="Previous slide">
              <span aria-hidden="true">‹</span>
            </button>
            <button className="landing-carousel__button landing-carousel__button--next" type="button" onClick={nextSlide} aria-label="Next slide">
              <span aria-hidden="true">›</span>
            </button>
          </>
        ) : null}
      </div>

      <div className="landing-carousel__status" aria-live="polite">
        <span>{safeLabels[currentIndex] ?? `Item ${currentIndex + 1}`}</span>
        <span>
          {currentIndex + 1} / {safeSlides.length}
        </span>
      </div>

      {safeSlides.length > 1 ? (
        <div className="landing-carousel__dots" aria-hidden="true">
          {safeSlides.map((_, index) => (
            <span key={index} className={index === currentIndex ? "is-active" : ""} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
