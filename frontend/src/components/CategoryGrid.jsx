import React from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { mediaSrc } from "@/lib/adminUtils";

/* Grid of square category tiles (Nike-style) — uses settings.icons.items */
export default function CategoryGrid({ icons }) {
  const { t, lang } = useStore();
  const L = (o, k) => o?.[`${k}_${lang}`] || o?.[`${k}_fr`] || "";
  const items = (icons?.items || []).filter((i) => i.image_url && L(i, "label"));
  if (!items.length) return null;

  return (
    <section className="max-w-[1500px] mx-auto px-3 sm:px-6 lg:px-10 py-10 sm:py-14" data-testid="category-grid">
      <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold uppercase tracking-tight text-center mb-8 sm:mb-12">
        {t("shopByCategory")}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
        {items.slice(0, 8).map((it, i) => (
          <Link
            key={i}
            to={it.link || "/catalog"}
            className="group relative aspect-square overflow-hidden bg-ink block"
            data-testid={`category-tile-${i}`}
          >
            <img
              src={mediaSrc(it.image_url)}
              alt=""
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
              <div className="font-heading text-lg sm:text-xl lg:text-2xl font-extrabold uppercase tracking-tight text-white leading-tight drop-shadow">
                {L(it, "label")}
              </div>
              <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold uppercase text-white/90 opacity-0 group-hover:opacity-100 transition-opacity">
                {t("all")} →
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}