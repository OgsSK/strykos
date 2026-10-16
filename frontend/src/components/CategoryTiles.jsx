import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { swrGetShared } from "@/lib/cache";
import { mediaSrc } from "@/lib/adminUtils";

function isLinkAvailable(link, nav) {
  if (!nav || !link) return true;
  if (link === "/catalog" || link === "/brands" || link.startsWith("/page/") || link.startsWith("/product/")) return true;

  const [, query] = link.split("?");
  if (!query) return true;
  const params = new URLSearchParams(query);

  if (params.get("category")) {
    const found = nav.categories?.find((c) => c.slug === params.get("category"));
    if (!found || !found.count) return false;
  }
  if (params.get("brand")) {
    const found = nav.brands?.find((b) => b.slug === params.get("brand"));
    if (!found || !found.count) return false;
  }
  if (params.get("gender")) {
    const found = nav.genders?.find((g) => g.value === params.get("gender"));
    if (!found || !found.count) return false;
  }
  if (params.get("sport")) {
    const found = nav.sports?.find((s) => s.value === params.get("sport"));
    if (!found || !found.count) return false;
  }
  if (params.get("is_new") === "true" && !nav.filters?.is_new) return false;
  if (params.get("on_sale") === "true" && !nav.filters?.on_sale) return false;
  if (params.get("customizable") === "true" && !nav.filters?.customizable) return false;

  return true;
}

function IconTile({ item, index, lang }) {
  const L = (o, k) => o?.[`${k}_${lang}`] || o?.[`${k}_fr`] || "";
  return (
    <Link
      to={item.link || "/catalog"}
      className="group flex flex-col items-center text-center w-[calc(50%-8px)] sm:w-[calc(33.333%-11px)] lg:w-[calc(16.666%-14px)] max-w-[180px]"
      data-testid={`category-tile-${index}`}
    >
      <div className="w-full aspect-square rounded-2xl overflow-hidden bg-cream-dark group-hover:shadow-md transition-all group-hover:scale-[1.02]">
        {item.image_url && (
          <img src={mediaSrc(item.image_url)} alt="" loading="lazy" className="w-full h-full object-cover" />
        )}
      </div>
      <span className="mt-2 sm:mt-3 text-xs sm:text-sm font-medium leading-tight text-ink group-hover:text-brand transition-colors">
        {L(item, "label")}
      </span>
    </Link>
  );
}

export default function CategoryTiles({ icons, limit = 12 }) {
  const { lang, cacheVersion } = useStore();   // ⭐ cacheVersion ajouté
  const [nav, setNav] = useState(null);

  // ⭐ MODIFIÉ : dépend de cacheVersion → re-fetch à chaque changement admin
  useEffect(() => {
    swrGetShared("/nav", (d) => setNav(d), { ttl: 5 * 60 * 1000 }).catch(() => {});
  }, [cacheVersion]);

  const L = (o, k) => o?.[`${k}_${lang}`] || o?.[`${k}_fr`] || "";
  const allItems = (icons?.items || []).filter((i) => i.image_url && L(i, "label"));
  const visibleItems = nav ? allItems.filter((i) => isLinkAvailable(i.link, nav)) : allItems;
  const items = visibleItems.slice(0, limit);

  if (!items.length) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-12 sm:py-16" data-testid="category-tiles-section">
      {L(icons, "title") && (
        <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-ink text-center mb-8 sm:mb-10">
          {L(icons, "title")}
        </h2>
      )}

      {/* Flex + justify-center = centrage automatique, peu importe la quantité */}
      <div className="flex flex-wrap justify-center gap-4 sm:gap-5 lg:gap-6">
        {items.map((it, i) => (
          <IconTile key={i} item={it} index={i} lang={lang} />
        ))}
      </div>
    </section>
  );
}