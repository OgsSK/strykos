import React, { useEffect, useState } from "react";
import { useStore } from "@/context/StoreProvider";
import { swrGetShared } from "@/lib/cache";
import HeroSplit from "@/components/HeroSplit";
import ProductGrid from "@/components/ProductGrid";
import CategoryTiles from "@/components/CategoryTiles";
import EditorialCards from "@/components/EditorialCards";
import CtaBanner from "@/components/CtaBanner";
import StoryBlock from "@/components/StoryBlock";
import Steps from "@/components/Steps";
import Gallery from "@/components/Gallery";
import Features from "@/components/Features";
import Testimonials from "@/components/Testimonials";

export default function Home() {
  const { settings, lang, cacheVersion } = useStore();  // ⭐ cacheVersion ajouté
  const [data, setData] = useState(null);

  // ⭐ MODIFIÉ : dépend de cacheVersion → re-fetch à chaque changement admin
  useEffect(() => {
    swrGetShared("/home", (d) => setData(d), { ttl: 3 * 60 * 1000 }).catch(() => {});
  }, [cacheVersion]);

  const sec = settings?.sections || {};

  const featuredProducts =
    (data?.best_sellers?.length > 0) ? data.best_sellers :
    (data?.featured?.length > 0)    ? data.featured :
    (data?.new_arrivals || []);

  const newArrivals = data?.new_arrivals || [];

  const editorialCards = [
    ...(sec.new_arrivals?.cards || []),
    ...(sec.promotions?.cards || []),
  ].slice(0, 4);

  return (
    <div className="bg-cream min-h-screen">
      {/* 1. Hero split hybride */}
      <HeroSplit hero={settings?.hero} />

      {/* 2. Nos gâteaux populaires */}
      {featuredProducts.length > 0 && (
        <ProductGrid
          title={lang === "fr" ? "Nos gâteaux populaires" : "Our popular cakes"}
          link="/catalog?sort=best_sellers"
          allLabel={lang === "fr" ? "Voir tout" : "See all"}
          products={featuredProducts}
          limit={4}
          testid="home-section-popular"
        />
      )}

      {/* 3. Nos catégories */}
      <CategoryTiles icons={settings?.icons} limit={6} />

      {/* 4. Grille éditoriale 2x2 alternée */}
      {editorialCards.length > 0 && (
        <EditorialCards cards={editorialCards} testid="home-section-editorial" />
      )}

      {/* 5. Nouveautés — même composant ProductGrid, données différentes */}
      {newArrivals.length > 0 && (
        <ProductGrid
          title={lang === "fr" ? "Nos nouveautés" : "New arrivals"}
          link="/catalog?is_new=true"
          allLabel={lang === "fr" ? "Voir tout" : "See all"}
          products={newArrivals}
          limit={4}
          testid="home-section-new-arrivals"
        />
      )}

      {/* 6. Bannière CTA pleine largeur */}
      <CtaBanner banner={settings?.cta_banner} />

      {/* 7. Notre histoire */}
      <StoryBlock story={settings?.story} />

      {/* 8. Comment ça marche (3 étapes) */}
      <Steps steps={settings?.steps} />

      {/* 9. Galerie / Instagram */}
      <Gallery gallery={settings?.gallery} />

      {/* 10. Les 4 avantages */}
      <Features features={settings?.features} />

      {/* 11. Témoignages */}
      <Testimonials testimonials={settings?.testimonials} />
    </div>
  );
}