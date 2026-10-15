import React from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { mediaSrc } from "@/lib/adminUtils";
import { ArrowRight } from "lucide-react";

/**
 * Section éditoriale 2x2 — 4 cartes alternées (image gauche/texte droite, puis inverse).
 * Lit depuis l'admin : cards[].{image_url, video_url, overline_fr/en, title_fr/en,
 *                              cta_fr/en, cta_link, cta2_fr/en, cta2_link}
 * Les cartes impaires : image à gauche. Les paires : image à droite.
 */
export default function EditorialCards({ cards = [], testid = "editorial-cards" }) {
  const { lang } = useStore();
  const visible = cards.slice(0, 4).filter((c) => c.image_url || c.title_fr || c.title_en);
  if (!visible.length) return null;

  const L = (o, k) => o?.[`${k}_${lang}`] || o?.[`${k}_fr`] || "";

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10 sm:py-14" data-testid={testid}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {visible.map((c, i) => {
          const imageLeft = i % 2 === 0; // 0 et 2 : image gauche. 1 et 3 : image droite.

          return (
            <article
              key={i}
              className={`grid grid-cols-1 sm:grid-cols-2 rounded-2xl overflow-hidden bg-cream-dark border border-ink/5 hover:shadow-lg transition-shadow duration-300 ${imageLeft ? "" : "sm:[&>*:first-child]:order-2"}`}
              data-testid={`${testid}-item-${i}`}
            >
              {/* Média */}
              <div className="relative aspect-[4/3] sm:aspect-auto sm:min-h-[240px] overflow-hidden bg-cream">
                {c.image_url && (
                  <img
                    src={mediaSrc(c.image_url)}
                    alt={L(c, "title")}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                  />
                )}
                {c.video_url && (
                  <video
                    src={mediaSrc(c.video_url)}
                    poster={c.image_url ? mediaSrc(c.image_url) : undefined}
                    muted
                    loop
                    playsInline
                    autoPlay
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
              </div>

              {/* Texte */}
              <div className="p-6 sm:p-7 flex flex-col justify-center">
                {L(c, "overline") && (
                  <span className="text-[10px] sm:text-[11px] font-semibold tracking-[0.2em] text-brand uppercase mb-2">
                    {L(c, "overline")}
                  </span>
                )}
                {L(c, "title") && (
                  <h3 className="font-heading text-xl sm:text-2xl font-bold text-ink mb-2 leading-tight">
                    {L(c, "title")}
                  </h3>
                )}
                {L(c, "subtitle") && (
                  <p className="text-sm text-ink-soft mb-4 leading-relaxed">
                    {L(c, "subtitle")}
                  </p>
                )}

                {L(c, "cta") && (
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={c.cta_link || "/catalog"}
                      className="inline-flex items-center gap-1.5 bg-ink text-cream px-4 py-2 rounded-full text-xs sm:text-sm font-semibold hover:bg-brand transition-colors"
                    >
                      {L(c, "cta")}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                    {L(c, "cta2") && c.cta2_link && (
                      <Link
                        to={c.cta2_link}
                        className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-ink hover:text-brand transition-colors"
                      >
                        {L(c, "cta2")}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}