import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { swrGetShared } from "@/lib/cache";
import { mediaSrc } from "@/lib/adminUtils";

/* Vérifie si un lien correspond à au moins 1 produit existant.
   Utilise les compteurs de /api/nav. */
function isLinkAvailable(link, nav) {
  if (!nav || !link) return true;
  // Liens statiques toujours visibles
  if (link === "/catalog" || link === "/brands" || link.startsWith("/page/") || link.startsWith("/product/")) return true;

  const [, query] = link.split("?");
  if (!query) return true;
  const params = new URLSearchParams(query);

  // Catégorie
  if (params.get("category")) {
    const found = nav.categories?.find((c) => c.slug === params.get("category"));
    if (!found || !found.count) return false;
  }
  // Marque
  if (params.get("brand")) {
    const found = nav.brands?.find((b) => b.slug === params.get("brand"));
    if (!found || !found.count) return false;
  }
  // Genre
  if (params.get("gender")) {
    const found = nav.genders?.find((g) => g.value === params.get("gender"));
    if (!found || !found.count) return false;
  }
  // Sport
  if (params.get("sport")) {
    const found = nav.sports?.find((s) => s.value === params.get("sport"));
    if (!found || !found.count) return false;
  }
  // Sélection
  if (params.get("team")) {
    const found = nav.teams?.find((t) => t.value === params.get("team"));
    if (!found || !found.count) return false;
  }
  // Club
  if (params.get("club")) {
    const found = nav.clubs?.find((c) => c.value === params.get("club"));
    if (!found || !found.count) return false;
  }
  // Flags
  if (params.get("is_new") === "true" && !nav.filters?.is_new) return false;
  if (params.get("on_sale") === "true" && !nav.filters?.on_sale) return false;
  if (params.get("customizable") === "true" && !nav.filters?.customizable) return false;
  // Attributs
  if (params.get("product_type") && !nav.filters?.product_type?.[params.get("product_type")]) return false;
  if (params.get("surface") && !nav.filters?.surface?.[params.get("surface")]) return false;

  return true;
}

/* Tuile ronde réutilisable */
function IconTile({ item, index, lang }) {
  const L = (o, k) => o?.[`${k}_${lang}`] || o?.[`${k}_fr`] || "";
  return (
    <Link
      to={item.link || "/catalog"}
      className="group flex flex-col items-center text-center"
      data-testid={`category-tile-${index}`}
    >
      <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 overflow-hidden rounded-full bg-secondary ring-1 ring-border group-hover:ring-ink transition-all group-hover:scale-105">
        {item.image_url && (
          <img src={mediaSrc(item.image_url)} alt="" loading="lazy" className="w-full h-full object-cover" />
        )}
      </div>
      <span className="mt-3 text-xs sm:text-sm font-medium leading-tight group-hover:text-brand transition-colors">
        {L(item, "label")}
      </span>
    </Link>
  );
}

/* Colonne de liens réutilisable */
function LinkColumn({ column, lang }) {
  const L = (o, k) => o?.[`${k}_${lang}`] || o?.[`${k}_fr`] || "";
  return (
    <div>
      <h3 className="font-heading text-lg sm:text-xl font-semibold mb-4">{L(column, "title")}</h3>
      <ul className="space-y-3">
        {(column.links || []).map((lk, j) => (
          <li key={j}>
            <Link
              to={lk.link || "/catalog"}
              className="text-sm sm:text-base text-ink-soft hover:text-ink transition-colors"
            >
              {L(lk, "label")}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CategoryGrid({ icons }) {
  const { t, lang } = useStore();
  const [nav, setNav] = useState(null);

  useEffect(() => {
    swrGetShared("/nav", (d) => setNav(d), { ttl: 5 * 60 * 1000 }).catch(() => {});
  }, []);

  const L = (o, k) => o?.[`${k}_${lang}`] || o?.[`${k}_fr`] || "";

  // Filtre les items selon la disponibilité des produits
  const allItems = (icons?.items || []).filter((i) => i.image_url && L(i, "label"));
  const visibleItems = nav ? allItems.filter((i) => isLinkAvailable(i.link, nav)) : allItems;

  // Filtre les colonnes et leurs liens
  const allColumns = icons?.columns || [];
  const visibleColumns = (nav ? allColumns.map((col) => ({
    ...col,
    links: (col.links || []).filter((lk) => isLinkAvailable(lk.link, nav)),
  })).filter((col) => col.links.length > 0 && L(col, "title")) : allColumns);

  if (!visibleItems.length && !visibleColumns.length) return null;

  return (
    <section className="max-w-[1500px] mx-auto px-3 sm:px-6 lg:px-10 py-12 sm:py-16" data-testid="category-grid">
      {L(icons, "title") && (
        <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold uppercase tracking-tight text-center mb-8 sm:mb-12">
          {L(icons, "title")}
        </h2>
      )}

      {/* Vignettes rondes */}
      {visibleItems.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-x-3 gap-y-8 max-w-6xl mx-auto" data-testid="category-tiles">
          {visibleItems.slice(0, 16).map((it, i) => (
            <IconTile key={i} item={it} index={i} lang={lang} />
          ))}
        </div>
      )}

      {/* Colonnes de liens */}
      {visibleColumns.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10 max-w-5xl mx-auto mt-14 sm:mt-20" data-testid="category-columns">
          {visibleColumns.slice(0, 4).map((col, i) => (
            <LinkColumn key={i} column={col} lang={lang} />
          ))}
        </div>
      )}
    </section>
  );
}