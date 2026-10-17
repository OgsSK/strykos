import React from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { ArrowRight } from "lucide-react";
import { mediaSrc } from "@/lib/adminUtils";

const DEFAULT = {
  image_url: "",
  title_fr: "L'ÉQUIPEMENT DES VRAIS JOUEURS",
  title_en: "GEAR FOR REAL PLAYERS",
  subtitle_fr: "Maillots authentiques, chaussures et équipements des plus grandes marques. Livraison internationale suivie.",
  subtitle_en: "Authentic jerseys, boots and gear from the biggest brands. Tracked worldwide delivery.",
  cta_fr: "Découvrir le catalogue",
  cta_en: "Shop now",
  cta_link: "/catalog",
};

export default function EditorialSection({ media }) {
  const { lang } = useStore();
  const m = { ...DEFAULT, ...(media || {}) };
  const title = lang === "fr" ? (m.title_fr || DEFAULT.title_fr) : (m.title_en || DEFAULT.title_en);
  const subtitle = lang === "fr" ? (m.subtitle_fr || DEFAULT.subtitle_fr) : (m.subtitle_en || DEFAULT.subtitle_en);
  const cta = lang === "fr" ? (m.cta_fr || DEFAULT.cta_fr) : (m.cta_en || DEFAULT.cta_en);
  const hasImg = !!(m.image_url && m.image_url.trim());

  return (
    <section className="max-w-[1500px] mx-auto px-3 sm:px-6 lg:px-10 py-10 sm:py-14" data-testid="editorial-section">
      <div className="grid md:grid-cols-2 gap-0 overflow-hidden bg-ink text-white">
        <div className="relative aspect-[4/3] md:aspect-auto md:min-h-[500px] bg-gradient-to-br from-ink via-ink to-brand/40">
          {hasImg && (
            <img src={mediaSrc(m.image_url)} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
          )}
        </div>
        <div className="p-8 sm:p-12 lg:p-16 flex flex-col justify-center">
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold uppercase tracking-tight leading-none mb-5">
            {title}
          </h2>
          <p className="text-white/80 text-base sm:text-lg leading-relaxed max-w-md mb-8">
            {subtitle}
          </p>
          <Link
            to={m.cta_link || "/catalog"}
            className="inline-flex items-center gap-2 bg-white text-ink hover:bg-brand hover:text-white px-6 py-3 text-sm font-bold uppercase tracking-wide transition-colors self-start"
          >
            {cta} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}