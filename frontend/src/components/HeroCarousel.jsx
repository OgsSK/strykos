import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { mediaSrc } from "@/lib/adminUtils";

function Slide({ slide, active }) {
  const ref = useRef();
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active) { v.currentTime = 0; v.play().catch(() => {}); } else { v.pause(); }
  }, [active]);
  return (
    <div className={`absolute inset-0 transition-opacity duration-1000 ${active ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
      {slide.image_url && <img src={mediaSrc(slide.image_url)} alt="" className="absolute inset-0 w-full h-full object-cover" />}
      {slide.video_url && (
        <video ref={ref} src={mediaSrc(slide.video_url)} poster={slide.image_url ? mediaSrc(slide.image_url) : undefined} muted loop playsInline preload={active ? "auto" : "metadata"} onError={(e) => { e.currentTarget.style.display = "none"; }}
          className="absolute inset-0 w-full h-full object-cover" data-testid="hero-video" />
      )}
      {/* Overlay léger pour la lisibilité du texte (Nike style) */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
    </div>
  );
}

export default function HeroCarousel({ hero }) {
  const { t, lang } = useStore();
  const slides = (hero?.slides || []).filter((s) => s.video_url || s.image_url);
  const interval = hero?.interval_ms || 7000;
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef(null);
  const n = slides.length;

  const go = useCallback((d) => setIdx((i) => (n ? (i + d + n) % n : 0)), [n]);
  useEffect(() => {
    if (paused || n < 2) return;
    const id = setTimeout(() => go(1), interval);
    return () => clearTimeout(id);
  }, [idx, paused, n, interval, go]);

  if (!n) return null;
  const s = slides[idx];
  const L = (k) => s[`${k}_${lang}`] || s[`${k}_fr`] || "";

  return (
    <section className="relative h-[80vh] min-h-[520px] bg-ink text-white overflow-hidden select-none" data-testid="hero-banner"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => { if (touchX.current == null) return; const dx = e.changedTouches[0].clientX - touchX.current; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); touchX.current = null; }}>
      {slides.map((sl, i) => <Slide key={i} slide={sl} active={i === idx} />)}

      {/* Contenu centré façon Nike */}
      <div className="relative h-full flex flex-col items-center justify-end pb-16 sm:pb-20 text-center px-4">
        <div key={idx} className="max-w-3xl animate-fade-up">
          {L("overline") && (
            <div className="text-xs sm:text-sm uppercase tracking-[0.2em] mb-3 opacity-90">{L("overline")}</div>
          )}
          <h1 className="font-heading text-4xl sm:text-6xl lg:text-7xl font-extrabold uppercase tracking-tight leading-[0.95] mb-4" data-testid="hero-title">{L("title")}</h1>
          <p className="text-base sm:text-lg text-white/90 max-w-xl mx-auto mb-7">{L("subtitle")}</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link to={s.cta_link || "/catalog"} data-testid="hero-cta-primary"
              className="bg-white text-ink hover:bg-ink hover:text-white px-7 py-3 text-sm font-bold uppercase tracking-wide rounded-full transition-colors">
              {L("cta") || t("shopNow")}
            </Link>
            <Link to="/catalog?is_new=true" className="bg-transparent border border-white/60 hover:bg-white hover:text-ink text-white px-7 py-3 text-sm font-bold uppercase tracking-wide rounded-full transition-colors">
              {t("heroCta2")}
            </Link>
          </div>
        </div>
      </div>

      {/* Arrows */}
      {n > 1 && (
        <>
          <button onClick={() => go(-1)} aria-label="previous" data-testid="hero-prev" className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 hidden sm:flex items-center justify-center bg-white/10 hover:bg-white/30 backdrop-blur rounded-full transition-colors"><ChevronLeft className="w-5 h-5" /></button>
          <button onClick={() => go(1)} aria-label="next" data-testid="hero-next" className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 hidden sm:flex items-center justify-center bg-white/10 hover:bg-white/30 backdrop-blur rounded-full transition-colors"><ChevronRight className="w-5 h-5" /></button>
          <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-2" data-testid="hero-dots">
            {slides.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} aria-label={`slide ${i + 1}`} className={`h-1.5 rounded-full transition-all ${i === idx ? "bg-white w-6" : "bg-white/40 w-1.5"}`} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}