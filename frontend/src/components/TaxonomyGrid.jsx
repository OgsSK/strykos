import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api } from "@/lib/api";
import { ArrowRight } from "lucide-react";
import { mediaSrc } from "@/lib/adminUtils";
import SmartImage from "@/components/SmartImage";

/* Grid of gender/sport tiles — image si dispo, sinon fond noir uni */
export default function TaxonomyGrid({ type = "gender" }) {
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

  return (
    <section className="max-w-[1500px] mx-auto px-3 sm:px-6 lg:px-10 py-10 sm:py-14" data-testid={`taxonomy-grid-${type}`}>
      <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold uppercase tracking-tight text-center mb-8 sm:mb-12">
        {title}
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {list.map((tx) => {
          const name = lang === "fr" ? tx.name_fr : tx.name_en;
          const imgSrc = mediaSrc(tx.image_url || "");
          const hasImg = !!imgSrc;
          return (
            <Link
              key={tx.value}
              to={`/catalog?${paramKey}=${tx.value}`}
              className="group relative aspect-[3/4] overflow-hidden bg-ink block"
              data-testid={`taxonomy-tile-${tx.value}`}
            >
              {hasImg && (
                <>
                  <SmartImage
                    src={imgSrc}
                    alt={name}
                    width={600}
                    className="absolute inset-0 w-full h-full transition-transform duration-700 group-hover:scale-[1.06]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                </>
              )}
              {!hasImg && (
                <div className="absolute inset-0 bg-gradient-to-br from-ink via-ink to-brand/30 transition-opacity" />
              )}

              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 text-white">
                <div className="font-heading text-xl sm:text-2xl lg:text-3xl font-extrabold uppercase tracking-tight leading-none drop-shadow-lg">
                  {name}
                </div>
                <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                  {t("all")} <ArrowRight className="w-3 h-3" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}