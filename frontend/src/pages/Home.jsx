import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { swrGetShared } from "@/lib/cache";
import ProductCard from "@/components/ProductCard";
import HeroCarousel from "@/components/HeroCarousel";
import SectionBanner from "@/components/SectionBanner";

const CATEGORIES = [
  { cat: "maillots", key: "jerseys", img: "https://images.unsplash.com/photo-1552066379-e7bfd22155c5?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
  { cat: "chaussures", key: "boots", img: "https://images.unsplash.com/photo-1511886929837-354d827aae26?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
  { cat: "equipements", key: "equipment", img: "https://images.unsplash.com/photo-1575361204480-aadea25e6e68?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
  { cat: "vetements", key: "clothing", img: "https://images.unsplash.com/photo-1540254597053-3901b858d40f?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
  { cat: "accessoires", key: "accessories", img: "https://images.unsplash.com/photo-1692506530242-c12d6c3ae2e2?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
];

function Section({ id, title, link, products, media, dark }) {
  if (!products || products.length === 0) return null;
  return (
    <section className={dark ? "bg-secondary" : ""} data-testid={`home-section-${id}`}>
      <SectionBanner media={media} title={title} link={link} testid={`section-banner-${id}`} />
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">
          {products.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { t, settings } = useStore();
  const [data, setData] = useState(null);
  useEffect(() => { swrGetShared("/home", (d) => setData(d), { ttl: 3 * 60 * 1000 }).catch(() => {}); }, []);
  const sec = settings?.sections || {};

  return (
    <div>
      <HeroCarousel hero={settings?.hero} />

      <section data-testid="home-section-categories">
        <SectionBanner media={sec.categories} title={t("shopByCategory")} testid="section-banner-categories" />
        <div className="max-w-7xl mx-auto px-4 py-10">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {CATEGORIES.map((c) => (
              <Link key={c.cat} to={`/catalog?category=${c.cat}`} data-testid={`category-tile-${c.cat}`} className="relative aspect-square overflow-hidden group">
                <img src={c.img} alt={t(c.key)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-ink/40 group-hover:bg-ink/30 transition-colors flex items-end p-3">
                  <span className="text-white font-heading font-bold uppercase text-sm tracking-wide">{t(c.key)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Section id="new_arrivals" title={t("newArrivals")} link="/catalog?is_new=true" products={data?.new_arrivals} media={sec.new_arrivals} />
      <Section id="promotions" title={t("promotions")} link="/catalog?on_sale=true" products={data?.promotions} media={sec.promotions} dark />
      <Section id="best_sellers" title={t("bestSellers")} link="/catalog?sort=best_sellers" products={data?.best_sellers} media={sec.best_sellers} />
      <Section id="featured" title={t("featured")} link="/catalog" products={data?.featured} media={sec.featured} dark />
    </div>
  );
}
