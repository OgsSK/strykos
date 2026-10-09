import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { swrGetShared } from "@/lib/cache";
import HeroCarousel from "@/components/HeroCarousel";
import SectionBanner from "@/components/SectionBanner";
import StoryCards from "@/components/StoryCards";
import ProductCarousel from "@/components/ProductCarousel";
import IconicGrid from "@/components/IconicGrid";


function Section({ id, title, link, products, media, allLabel, subTitle }) {
  if (!products || products.length === 0) return null;
  const cards = media?.cards || [];
  return (
    <section className="max-w-[1500px] mx-auto px-3 sm:px-6 lg:px-10 py-8 sm:py-12" data-testid={`home-section-${id}`}>
      {cards.length > 0 && (
        <div className="mb-8 sm:mb-10">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight mb-4 sm:mb-6">{title}</h2>
          <StoryCards cards={cards} testid={`story-cards-${id}`} />
        </div>
      )}
      <ProductCarousel title={cards.length > 0 ? subTitle : title} link={link} allLabel={allLabel} products={products} testid={`carousel-${id}`} />
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

      <Section id="new_arrivals" title={t("newArrivals")} link="/catalog?is_new=true" products={data?.new_arrivals} media={sec.new_arrivals} allLabel={t("all")} subTitle={t("dontMiss")} />
      <Section id="promotions" title={t("promotions")} link="/catalog?on_sale=true" products={data?.promotions} media={sec.promotions} allLabel={t("all")} subTitle={t("dontMiss")} />
      <Section id="best_sellers" title={t("bestSellers")} link="/catalog?sort=best_sellers" products={data?.best_sellers} media={sec.best_sellers} allLabel={t("all")} subTitle={t("dontMiss")} />
      <Section id="featured" title={t("featured")} link="/catalog" products={data?.featured} media={sec.featured} allLabel={t("all")} subTitle={t("dontMiss")} />
    </div>
  );
}
