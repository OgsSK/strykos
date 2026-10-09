import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { swrGetShared } from "@/lib/cache";

export default function BrandsPage() {
  const { t, lang } = useStore();
  const [brands, setBrands] = useState([]);
  useEffect(() => { swrGetShared("/brands", (d) => setBrands(d), { ttl: 10 * 60 * 1000 }).catch(() => {}); }, []);
  const intl = brands.filter((b) => !b.is_local);
  const local = brands.filter((b) => b.is_local);

  const Grid = ({ list }) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {list.map((b) => (
        <Link key={b.id} to={`/catalog?brand=${b.slug}`} data-testid={`brand-${b.slug}`}
          className="border border-border p-8 flex items-center justify-center hover:border-ink transition-colors group">
          <span className="font-heading font-bold text-xl uppercase tracking-tight group-hover:text-brand">{b.name}</span>
        </Link>
      ))}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8" data-testid="brands-page">
      <h1 className="font-heading text-3xl font-bold uppercase tracking-tight mb-8">{t("brands")}</h1>
      <h2 className="font-heading text-xl font-semibold uppercase mb-4">{t("internationalBrands")}</h2>
      <Grid list={intl} />
      {local.length > 0 && (
        <>
          <h2 className="font-heading text-xl font-semibold uppercase mb-4 mt-12">{t("localBrands")}</h2>
          <Grid list={local} />
        </>
      )}
    </div>
  );
}
