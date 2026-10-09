import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api } from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import { ArrowRight } from "lucide-react";

const CATEGORIES = [
  { cat: "maillots", key: "jerseys", img: "https://images.unsplash.com/photo-1552066379-e7bfd22155c5?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
  { cat: "chaussures", key: "boots", img: "https://images.unsplash.com/photo-1511886929837-354d827aae26?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
  { cat: "equipements", key: "equipment", img: "https://images.unsplash.com/photo-1575361204480-aadea25e6e68?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
  { cat: "vetements", key: "clothing", img: "https://images.unsplash.com/photo-1540254597053-3901b858d40f?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
  { cat: "accessoires", key: "accessories", img: "https://images.unsplash.com/photo-1692506530242-c12d6c3ae2e2?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
];

function Section({ title, link, products }) {
  const { t } = useStore();
  if (!products || products.length === 0) return null;
  return (
    <section className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-end justify-between mb-6">
        <h2 className="font-heading text-2xl sm:text-3xl font-bold uppercase tracking-tight">{title}</h2>
        {link && <Link to={link} className="text-sm font-semibold text-brand hover:text-brand-dark flex items-center gap-1">
          {t("all")} <ArrowRight className="w-4 h-4" /></Link>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">
        {products.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}

export default function Home() {
  const { t, lang, settings } = useStore();
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/home").then((r) => setData(r.data)).catch(() => {}); }, []);
  const hero = settings?.hero;

  return (
    <div>
      {/* Hero */}
      <section className="relative h-[70vh] min-h-[460px] bg-ink text-white overflow-hidden" data-testid="hero-banner">
        {hero?.image_url && <img src={hero.image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 h-full flex flex-col justify-end pb-16">
          <div className="max-w-2xl animate-fade-up">
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold uppercase tracking-tight leading-none">
              {hero ? (lang === "fr" ? hero.title_fr : hero.title_en) : "STRYKOS"}
            </h1>
            <p className="mt-4 text-base sm:text-lg text-white/80 max-w-lg">
              {hero ? (lang === "fr" ? hero.subtitle_fr : hero.subtitle_en) : ""}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/catalog" data-testid="hero-cta-primary"
                className="bg-brand hover:bg-brand-dark text-white px-7 py-3 text-sm font-bold uppercase tracking-wide transition-colors">
                {hero ? (lang === "fr" ? hero.cta_fr : hero.cta_en) : t("shopNow")}
              </Link>
              <Link to="/catalog?is_new=true"
                className="bg-white/10 hover:bg-white/20 backdrop-blur border border-white/30 text-white px-7 py-3 text-sm font-bold uppercase tracking-wide transition-colors">
                {t("heroCta2")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 py-12">
        <h2 className="font-heading text-2xl sm:text-3xl font-bold uppercase tracking-tight mb-6">{t("shopByCategory")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {CATEGORIES.map((c) => (
            <Link key={c.cat} to={`/catalog?category=${c.cat}`} data-testid={`category-tile-${c.cat}`}
              className="relative aspect-square overflow-hidden group">
              <img src={c.img} alt={t(c.key)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              <div className="absolute inset-0 bg-ink/40 group-hover:bg-ink/30 transition-colors flex items-end p-3">
                <span className="text-white font-heading font-bold uppercase text-sm tracking-wide">{t(c.key)}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <Section title={t("newArrivals")} link="/catalog?is_new=true" products={data?.new_arrivals} />
      <div className="bg-secondary">
        <Section title={t("promotions")} link="/catalog?on_sale=true" products={data?.promotions} />
      </div>
      <Section title={t("bestSellers")} link="/catalog?sort=best_sellers" products={data?.best_sellers} />
      <Section title={t("featured")} link="/catalog" products={data?.featured} />
    </div>
  );
}
