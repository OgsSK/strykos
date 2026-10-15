import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { mediaSrc } from "@/lib/adminUtils";
import { ArrowRight } from "lucide-react";

/**
 * Hero hybride :
 *   - Mobile (< lg) : image en fond plein écran + texte/bouton superposés (overlay)
 *   - Desktop (lg+) : split classique — texte à gauche, image à droite
 * 100% piloté par l'admin : hero.slides[]
 */
export default function HeroSplit({ hero }) {
  const { lang, t } = useStore();
  const slides = (hero?.slides || []).filter(
    (s) => s.image_url || s.video_url || s.title_fr || s.title_en
  );
  const interval = hero?.interval_ms || 8000;
  const [idx, setIdx] = useState(0);
  const touchX = useRef(null);
  const vidRef = useRef();
  const n = slides.length;

  useEffect(() => {
    if (n < 2) return;
    const id = setTimeout(() => setIdx((i) => (i + 1) % n), interval);
    return () => clearTimeout(id);
  }, [idx, n, interval]);

  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().catch(() => {});
  }, [idx]);

  if (!n) return null;

  const s = slides[idx];
  const L = (k) => s?.[`${k}_${lang}`] || s?.[`${k}_fr`] || "";
  const go = (d) => setIdx((i) => (i + d + n) % n);

  return (
    <section
      className="relative bg-cream overflow-hidden"
      data-testid="hero-banner"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      {/* Décor flou en fond (desktop uniquement) */}
      <div className="hidden lg:block absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-cream-dark/60 to-transparent pointer-events-none" />

      {/* ============================================================
          MOBILE — image plein écran + overlay texte
          ============================================================ */}
      <div className="lg:hidden relative w-full h-[80vh] min-h-[520px] max-h-[720px]">
        {/* Média en fond */}
        <div key={`m-media-${idx}`} className="absolute inset-0">
          {s.image_url && (
            <img
              src={mediaSrc(s.image_url)}
              alt={L("title") || "Hero"}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {s.video_url && (
            <video
              src={mediaSrc(s.video_url)}
              poster={s.image_url ? mediaSrc(s.image_url) : undefined}
              muted
              loop
              playsInline
              autoPlay
              preload="auto"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {/* Overlay dégradé pour lisibilité */}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/40 to-ink/10" />
        </div>

        {/* Contenu superposé (bas de l'image, centré) */}
        <div
          key={`m-text-${idx}`}
          className="relative h-full flex flex-col justify-end items-center text-center px-5 pb-10 sm:pb-14 animate-fade-up"
        >
          {L("overline") && (
            <div className="mb-3">
              <span className="text-[10px] font-sans font-semibold tracking-[0.25em] text-cream/90 uppercase">
                {L("overline")}
              </span>
            </div>
          )}

          {L("title") && (
            <h1
              className="font-serif text-[2rem] leading-[1.15] font-normal text-cream mb-3 max-w-sm"
              style={{ textTransform: "none" }}
            >
              {L("title")}
            </h1>
          )}

          {L("subtitle") && (
            <p className="font-sans text-sm text-cream/85 leading-relaxed mb-6 max-w-xs">
              {L("subtitle")}
            </p>
          )}

          {(L("cta") || t("shopNow")) && (
            <Link
              to={s.cta_link || "/catalog"}
              className="group inline-flex items-center gap-2 bg-cream text-ink px-6 py-3 rounded-full text-sm font-semibold hover:bg-brand hover:text-cream transition-all"
            >
              {L("cta") || t("shopNow")}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          )}
        </div>
      </div>

      {/* ============================================================
          DESKTOP — split classique (texte gauche / image droite)
          ============================================================ */}
      <div className="hidden lg:block relative max-w-[1400px] mx-auto px-12 py-20">
        <div className="grid grid-cols-2 gap-12 items-center">
          {/* Texte */}
          <div key={`d-text-${idx}`} className="text-left animate-fade-up">
            {L("overline") && (
              <div className="mb-5">
                <span className="text-xs font-sans font-semibold tracking-[0.3em] text-brand uppercase">
                  {L("overline")}
                </span>
              </div>
            )}
            {L("title") && (
              <h1
                className="font-serif text-[3.75rem] xl:text-[4rem] leading-[1.1] font-normal text-ink mb-6 max-w-xl"
                style={{ textTransform: "none" }}
                data-testid="hero-title"
              >
                {L("title")}
              </h1>
            )}
            {L("subtitle") && (
              <p className="font-sans text-ink-soft text-base leading-relaxed mb-8 max-w-lg">
                {L("subtitle")}
              </p>
            )}
            {(L("cta") || t("shopNow")) && (
              <Link
                to={s.cta_link || "/catalog"}
                data-testid="hero-cta-primary"
                className="group inline-flex items-center gap-2 bg-ink text-cream px-8 py-4 rounded-full text-sm font-semibold hover:bg-brand transition-all"
              >
                {L("cta") || t("shopNow")}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            )}
          </div>

          {/* Image */}
          <div className="relative">
            <div
              key={`d-media-${idx}`}
              className="relative w-full aspect-[5/4] rounded-2xl overflow-hidden shadow-xl bg-cream-dark animate-fade-up"
            >
              {s.image_url && (
                <img
                  src={mediaSrc(s.image_url)}
                  alt={L("title") || "Hero"}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              {s.video_url && (
                <video
                  ref={vidRef}
                  src={mediaSrc(s.video_url)}
                  poster={s.image_url ? mediaSrc(s.image_url) : undefined}
                  muted
                  loop
                  playsInline
                  autoPlay
                  preload="auto"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}