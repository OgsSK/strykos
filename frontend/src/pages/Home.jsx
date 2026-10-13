import React, { useEffect, useState } from "react";
import { useStore } from "@/context/StoreProvider";
import { swrGetShared } from "@/lib/cache";
import HeroCarousel from "@/components/HeroCarousel";
import SectionBanner from "@/components/SectionBanner";
import StoryCards from "@/components/StoryCards";
import CategoryGrid from "@/components/CategoryGrid";

export default function Home() {
  const { t, settings } = useStore();
  const [data, setData] = useState(null);
  useEffect(() => {
    swrGetShared("/home", (d) => setData(d), { ttl: 3 * 60 * 1000 }).catch(() => {});
  }, []);
  const sec = settings?.sections || {};

  return (
    <div>
      {/* 1. Hero plein écran */}
      <HeroCarousel hero={settings?.hero} />

      {/* 2+3. Bloc continu : Nouveautés + Promotions collés, full-bleed (Nike-style) */}
      <div className="py-1 sm:py-2">
        {(sec.new_arrivals?.cards || []).length > 0 && (
          <section data-testid="home-section-new_arrivals">
            <StoryCards cards={sec.new_arrivals.cards} testid="story-cards-new_arrivals" />
          </section>
        )}

        {(sec.promotions?.cards || []).length > 0 && (
          <section className="pt-1 sm:pt-2" data-testid="home-section-promotions">
            <StoryCards cards={sec.promotions.cards} testid="story-cards-promotions" />
          </section>
        )}
      </div>

      {/* 4. Bannière pleine largeur */}
      <SectionBanner media={sec.categories} title={t("shopByCategory")} testid="section-banner-categories" />

      {/* 5. Nos essentiels — tuiles rondes */}
      <CategoryGrid icons={settings?.icons} />
    </div>
  );
}