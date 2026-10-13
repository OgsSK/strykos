import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api } from "@/lib/api";
import { mediaSrc } from "@/lib/adminUtils";
import SmartImage from "@/components/SmartImage";
import { ArrowRight } from "lucide-react";

/**
 * Grille de genres ou sports.
 * variant = "grid"  → tuiles carrées 3:4 (défaut, idéal pour sport)
 * variant = "strip" → bandes fines horizontales 16:5 (idéal pour genre)
 */
export default function TaxonomyGrid({ type = "gender", variant = "grid" }) {
  const { t, lang } = useStore();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/taxonomies").then((r) => setData(r.data)).catch(() => {});
  }, []);

  const list = type === "gender" ? (data?.genders || []) : (data?.sports || []);
  if (!list.length) return null;

  const title = type === "gender"
    ? (lang === "fr" ? "Acheter par genre" : "Shop by gender")
    : (lang === "fr" ? "Acheter par sport" : "Shop by sport");

  const paramKey = type === "gender" ? "gender" : "sport";

  // Config selon le variant
  const isStrip = variant === "strip";
  const gridClasses = isStrip
    ? "grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3"
    : "grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3";
  const itemClasses = isStrip
    ? "aspect-[16/6] sm:aspect-[16/5]"
    : "aspect-[3/4]";

  return (
    <section className="max-w-[1500px] mx-auto px-3 sm:px-6 lg:px-10 py-10 sm:py-14" data-testid={`taxonomy-grid-${type}`}>
      <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold uppercase tracking-tight text-center mb-8 sm:mb-12">
        {title}
      </h2>
      <div className={gridClasses}>
        {list.map((tx) => {
          const name = lang === "fr" ? tx.name_fr : tx.name_en;
          const imgSrc = mediaSrc(tx.image_url || "");
          const hasImg = !!imgSrc;

          return (
            <Link
              key={tx.value}
              to={`/catalog?${paramKey}=${tx.value}`}
              className={`group relative ${itemClasses} overflow-hidden bg-ink block`}
              data-testid={`taxonomy-tile-${tx.value}`}
            >
              {hasImg && (
                <>
                  <SmartImage
                    src={imgSrc}
                    alt={name}
                    width={isStrip ? 800 : 600}
                    className="absolute inset-0 w-full h-full transition-transform duration-700 group-hover:scale-[1.06]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                </>
              )}
              {!hasImg && (
                <div className="absolute inset-0 bg-gradient-to-br from-ink via-ink to-brand/30" />
              )}

              <div className={`absolute inset-0 flex items-center justify-center text-white ${isStrip ? "" : "items-end p-4 sm:p-6"}`}>
                {isStrip ? (
                  <div className="font-heading text-xl sm:text-2xl lg:text-3xl font-extrabold uppercase tracking-tight drop-shadow-lg text-center px-2">
                    {name}
                  </div>
                ) : (
                  <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 text-white">
                    <div className="font-heading text-xl sm:text-2xl lg:text-3xl font-extrabold uppercase tracking-tight leading-none drop-shadow-lg">
                      {name}
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                      {t("all")} <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}