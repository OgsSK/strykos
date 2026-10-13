import React from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { mediaSrc } from "@/lib/adminUtils";

/* "Nos essentiels" style Nike : titre centré + tuiles RONDES + labels en dessous */
export default function CategoryGrid({ icons }) {
  const { t, lang } = useStore();
  const L = (o, k) => o?.[`${k}_${lang}`] || o?.[`${k}_fr`] || "";
  const items = (icons?.items || []).filter((i) => i.image_url && L(i, "label"));
  const columns = icons?.columns || [];
  if (!items.length && !columns.length) return null;

  return (
    <section className="max-w-[1500px] mx-auto px-3 sm:px-6 lg:px-10 py-14 sm:py-20" data-testid="category-grid">
      {L(icons, "title") && (
        <h2 className="font-heading text-4xl sm:text-6xl lg:text-7xl font-extrabold uppercase tracking-tight text-center leading-[0.95] mb-12 sm:mb-16" data-testid="iconic-title">
          {L(icons, "title")}
        </h2>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-x-3 gap-y-8 max-w-6xl mx-auto mb-16" data-testid="iconic-grid">
          {items.slice(0, 16).map((it, i) => (
            <Link key={i} to={it.link || "/catalog"} className="group flex flex-col items-center text-center" data-testid={`iconic-item-${i}`}>
              <div className="w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 overflow-hidden rounded-full bg-secondary ring-1 ring-border group-hover:ring-ink transition-all group-hover:scale-105">
                <img src={mediaSrc(it.image_url)} alt="" loading="lazy" className="w-full h-full object-cover" />
              </div>
              <span className="mt-4 text-xs sm:text-sm font-medium leading-tight group-hover:text-brand transition-colors">{L(it, "label")}</span>
            </Link>
          ))}
        </div>
      )}

      {columns.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12 max-w-5xl mx-auto pt-12 border-t border-border" data-testid="iconic-columns">
          {columns.slice(0, 4).map((col, i) => (
            <div key={i}>
              <h3 className="font-heading text-base sm:text-lg font-semibold mb-5">{L(col, "title")}</h3>
              <ul className="space-y-3">
                {(col.links || []).map((lk, j) => (
                  <li key={j}><Link to={lk.link || "/catalog"} className="text-sm text-ink-soft hover:text-ink transition-colors line-clamp-1">{L(lk, "label")}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}