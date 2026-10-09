import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

function Slide({ slide, active }) {
  const ref = useRef();
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active) { v.currentTime = 0; v.play().catch(() => {}); } else { v.pause(); }
  }, [active]);
  return (
    <div className={`absolute inset-0 transition-opacity duration-1000 ${active ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
      {slide.image_url && <img src={slide.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />}
      {slide.video_url && (
        <video ref={ref} src={slide.video_url} poster={slide.image_url || undefined} muted loop playsInline preload={active ? "auto" : "metadata"} onError={(e) => { e.currentTarget.style.display = "none"; }}
          className="absolute inset-0 w-full h-full object-cover" data-testid="hero-video" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/10" />
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
    <section className="relative h-[78vh] min-h-[500px] bg-ink text-white overflow-hidden select-none" data-testid="hero-banner"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => { if (touchX.current == null) return; const dx = e.changedTouches[0].clientX - touchX.current; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); touchX.current = null; }}>
      {slides.map((sl, i) => <Slide key={i} slide={sl} active={i === idx} />)}

      <div className="relative max-w-7xl mx-auto px-4 h-full flex flex-col justify-end pb-20">
        <div key={idx} className="max-w-2xl animate-fade-up">
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold uppercase tracking-tight leading-none" data-testid="hero-title">{L("title")}</h1>
          <p className="mt-4 text-base sm:text-lg text-white/80 max-w-lg">{L("subtitle")}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to={s.cta_link || "/catalog"} data-testid="hero-cta-primary"
              className="bg-brand hover:bg-brand-dark text-white px-7 py-3 text-sm font-bold uppercase tracking-wide transition-colors">{L("cta") || t("shopNow")}</Link>
            <Link to="/catalog?is_new=true" className="bg-white/10 hover:bg-white/20 backdrop-blur border border-white/30 text-white px-7 py-3 text-sm font-bold uppercase tracking-wide transition-colors">{t("heroCta2")}</Link>
          </div>
        </div>
      </div>

      {n > 1 && (
        <>
          <button onClick={() => go(-1)} aria-label="previous" data-testid="hero-prev" className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 hidden sm:flex items-center justify-center bg-black/30 hover:bg-black/60 backdrop-blur transition-colors"><ChevronLeft className="w-5 h-5" /></button>
          <button onClick={() => go(1)} aria-label="next" data-testid="hero-next" className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 hidden sm:flex items-center justify-center bg-black/30 hover:bg-black/60 backdrop-blur transition-colors"><ChevronRight className="w-5 h-5" /></button>
          <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-3" data-testid="hero-dots">
            {slides.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} aria-label={`slide ${i + 1}`} className="h-1 w-10 bg-white/30 overflow-hidden">
                <span className={`block h-full bg-white ${i === idx ? "animate-progress" : i < idx ? "w-full" : "w-0"}`} style={i === idx && !paused ? { animationDuration: `${interval}ms` } : { animation: "none", width: i === idx ? "100%" : undefined }} />
              </button>
            ))}
            <button onClick={() => setPaused((p) => !p)} aria-label="pause" className="ml-2 text-white/70 hover:text-white">{paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}</button>
          </div>
        </>
      )}
    </section>
  );
}
