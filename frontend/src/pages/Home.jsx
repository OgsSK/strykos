import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { swrGetShared } from "@/lib/cache";
import ProductCard from "@/components/ProductCard";
import HeroCarousel from "@/components/HeroCarousel";
import SectionBanner from "@/components/SectionBanner";
import StoryCards from "@/components/StoryCards";
import IconicGrid from "@/components/IconicGrid";
import { ArrowRight } from "lucide-react";


function Section({ id, title, link, products, media, allLabel }) {
  if (!products || products.length === 0) return null;
  const cards = media?.cards || [];
  return (
    <section className="max-w-[1500px] mx-auto px-3 sm:px-6 lg:px-10 py-8 sm:py-12" data-testid={`home-section-${id}`}>
      <div className="flex items-end justify-between gap-4 mb-4 sm:mb-6">
        <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">{title}</h2>
        {link && <Link to={link} className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold hover:text-brand transition-colors">{allLabel} <ArrowRight className="w-4 h-4" /></Link>}
      </div>
      {cards.length > 0 && <div className="mb-8 sm:mb-10"><StoryCards cards={cards} testid={`story-cards-${id}`} /></div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 sm:gap-x-4 gap-y-8">
        {products.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} />)}
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
        <IconicGrid icons={settings?.icons} />
      </section>

      <Section id="new_arrivals" title={t("newArrivals")} link="/catalog?is_new=true" products={data?.new_arrivals} media={sec.new_arrivals} allLabel={t("all")} />
      <Section id="promotions" title={t("promotions")} link="/catalog?on_sale=true" products={data?.promotions} media={sec.promotions} allLabel={t("all")} />
      <Section id="best_sellers" title={t("bestSellers")} link="/catalog?sort=best_sellers" products={data?.best_sellers} media={sec.best_sellers} allLabel={t("all")} />
      <Section id="featured" title={t("featured")} link="/catalog" products={data?.featured} media={sec.featured} allLabel={t("all")} />
    </div>
  );
}
