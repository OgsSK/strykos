import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ProductCard from "@/components/ProductCard";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";

/* Nike-style horizontal product carousel: title + arrows, scroll-snap, swipe on touch. */
export default function ProductCarousel({ title, link, allLabel, products = [], testid = "product-carousel" }) {
  const ref = useRef();
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  useEffect(() => { update(); const el = ref.current; if (!el) return; el.addEventListener("scroll", update, { passive: true }); window.addEventListener("resize", update); return () => { el.removeEventListener("scroll", update); window.removeEventListener("resize", update); }; }, [products.length]);

  const scrollBy = (dir) => {
    const el = ref.current;
    if (!el) return;
    const card = el.querySelector("[data-carousel-item]");
    const step = card ? card.getBoundingClientRect().width + 16 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step * 2, behavior: "smooth" });
  };

  if (!products.length) return null;
  return (
    <div data-testid={testid}>
      <div className="flex items-end justify-between gap-4 mb-4 sm:mb-6">
        <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">{title}</h2>
        <div className="flex items-center gap-3">
          {link && <Link to={link} className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold hover:text-brand transition-colors">{allLabel} <ArrowRight className="w-4 h-4" /></Link>}
          <div className="flex gap-2">
            <button onClick={() => scrollBy(-1)} disabled={!canPrev} aria-label="previous" data-testid={`${testid}-prev`}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-secondary flex items-center justify-center hover:bg-ink hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-secondary disabled:hover:text-ink"><ChevronLeft className="w-5 h-5" /></button>
            <button onClick={() => scrollBy(1)} disabled={!canNext} aria-label="next" data-testid={`${testid}-next`}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-secondary flex items-center justify-center hover:bg-ink hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-secondary disabled:hover:text-ink"><ChevronRight className="w-5 h-5" /></button>
          </div>
        </div>
      </div>
      <div ref={ref} className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 -mx-3 px-3 sm:mx-0 sm:px-0 no-scrollbar" data-testid={`${testid}-track`}>
        {products.slice(0, 8).map((p) => (
          <div key={p.id} data-carousel-item className="snap-start shrink-0 w-[70vw] sm:w-[44%] md:w-[31%] lg:w-[23.5%]">
            <ProductCard product={p} />
          </div>
        ))}
      </div>
      {link && <Link to={link} className="sm:hidden mt-3 inline-flex items-center gap-1 text-sm font-semibold">{allLabel} <ArrowRight className="w-4 h-4" /></Link>}
    </div>
  );
}
