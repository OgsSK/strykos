import React, { useRef, useState, useEffect } from "react";
import { Stars } from "@/components/Stars";
import { useStore } from "@/context/StoreProvider";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Testimonials({ testimonials }) {
  const { lang } = useStore();
  const items = testimonials?.items || [];
  const title = testimonials?.[`title_${lang}`] || testimonials?.title_fr || "";
  const scrollRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  // ⭐ Détecte la position de scroll pour activer/désactiver les flèches
  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atStart = el.scrollLeft <= 4;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    setCanPrev(!atStart);
    setCanNext(!atEnd);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [items.length]);

  if (!items.length) return null;

  const scrollBy = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.querySelector("[data-testimonial-item]");
    const step = card ? card.getBoundingClientRect().width + 16 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <section
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8 sm:py-12 lg:py-16"
      data-testid="testimonials-section"
    >
      {title && (
        <div className="flex items-end justify-between gap-4 mb-5 sm:mb-10">
          <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-ink">
            {title}
          </h2>
          {/* Flèches visibles uniquement sur mobile */}
          <div className="flex gap-2 sm:hidden">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              disabled={!canPrev}
              aria-label="previous"
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                canPrev
                  ? "bg-secondary text-ink hover:bg-ink hover:text-white"
                  : "bg-secondary/40 text-ink-muted/40 cursor-not-allowed"
              }`}
              data-testid="testimonials-prev"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              disabled={!canNext}
              aria-label="next"
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                canNext
                  ? "bg-secondary text-ink hover:bg-ink hover:text-white"
                  : "bg-secondary/40 text-ink-muted/40 cursor-not-allowed"
              }`}
              data-testid="testimonials-next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Mobile : carrousel horizontal — Desktop : grid 3 colonnes */}
      <div
        ref={scrollRef}
        className="flex sm:grid sm:grid-cols-3 gap-4 sm:gap-6 overflow-x-auto sm:overflow-visible snap-x snap-mandatory scroll-smooth pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar"
        data-testid="testimonials-track"
      >
        {items.map((item, i) => {
          const text = item[`text_${lang}`] || item.text_fr || "";
          if (!item.name || !text) return null;
          return (
            <div
              key={i}
              data-testimonial-item
              className="snap-start shrink-0 w-[80vw] sm:w-auto bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-cream-dark flex flex-col items-center text-center"
              data-testid={`testimonial-${i}`}
            >
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-cream-dark mb-3 overflow-hidden">
                {item.avatar ? (
                  <img src={item.avatar} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-brand font-bold">
                    {item.name.charAt(0)}
                  </div>
                )}
              </div>
              <h3 className="font-semibold text-ink mb-1 text-sm sm:text-base">{item.name}</h3>
              <Stars value={item.rating || 5} size="sm" />
              <p className="text-xs sm:text-sm text-ink-soft mt-3 italic leading-relaxed">"{text}"</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}