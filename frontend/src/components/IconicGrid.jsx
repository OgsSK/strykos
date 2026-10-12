import React from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { mediaSrc } from "@/lib/adminUtils";

/* Nike-style "iconic models": big centred heading, grid of round/square thumbnails with labels, then link columns. */
export default function IconicGrid({ icons }) {
  const { lang } = useStore();
  const L = (o, k) => o?.[`${k}_${lang}`] || o?.[`${k}_fr`] || "";
  const items = (icons?.items || []).filter((i) => i.image_url || L(i, "label"));
  const columns = icons?.columns || [];
  if (!items.length && !columns.length) return null;
  return (
    <section className="max-w-[1500px] mx-auto px-3 sm:px-6 lg:px-10 py-12 sm:py-16" data-testid="iconic-section">
      {L(icons, "title") && (
        <h2 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold uppercase tracking-tight text-center leading-none mb-10 sm:mb-14" data-testid="iconic-title">{L(icons, "title")}</h2>
      )}
      {items.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-x-3 gap-y-8 max-w-6xl mx-auto" data-testid="iconic-grid">
          {items.slice(0, 16).map((it, i) => (
            <Link key={i} to={it.link || "/catalog"} className="group flex flex-col items-center text-center" data-testid={`iconic-item-${i}`}>
              <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 overflow-hidden rounded-full bg-secondary ring-1 ring-border group-hover:ring-ink transition-all group-hover:scale-105">
                {it.image_url && <img src={mediaSrc(it.image_url)} alt="" loading="lazy" className="w-full h-full object-cover" />}
              </div>
              <span className="mt-3 text-xs sm:text-sm font-medium leading-tight group-hover:text-brand transition-colors">{L(it, "label")}</span>
            </Link>
          ))}
        </div>
      )}
      {columns.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10 max-w-5xl mx-auto mt-14 sm:mt-20" data-testid="iconic-columns">
          {columns.slice(0, 4).map((col, i) => (
            <div key={i}>
              <h3 className="font-heading text-lg sm:text-xl font-semibold mb-4">{L(col, "title")}</h3>
              <ul className="space-y-3">
                {(col.links || []).map((lk, j) => (
                  <li key={j}><Link to={lk.link || "/catalog"} className="text-sm sm:text-base text-ink-soft hover:text-ink transition-colors line-clamp-1">{L(lk, "label")}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}