import React from "react";
import { Truck, ShieldCheck, Store, Headphones, Star, Heart, Clock, Phone, Gift, Package } from "lucide-react";
import { useStore } from "@/context/StoreProvider";

// Mapping clé (admin) → composant Lucide
const ICON_MAP = {
  truck: Truck,
  shield: ShieldCheck,
  store: Store,
  headphones: Headphones,
  star: Star,
  heart: Heart,
  clock: Clock,
  phone: Phone,
  gift: Gift,
  package: Package,
};

export default function Features({ features }) {
  const { lang } = useStore();
  const items = features?.items || [];
  if (!items.length) return null;

  return (
    <section className="bg-cream-dark py-10 sm:py-14" data-testid="features-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
        {items.map((item, i) => {
          const Icon = ICON_MAP[item.icon] || Truck;
          const title = item[`title_${lang}`] || item.title_fr || "";
          const subtitle = item[`subtitle_${lang}`] || item.subtitle_fr || "";
          if (!title) return null;
          return (
            <div key={i} className="flex flex-col items-center text-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white flex items-center justify-center mb-3 text-brand shadow-sm">
                <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <h3 className="text-sm sm:text-base font-semibold text-ink mb-1">{title}</h3>
              {subtitle && <p className="text-xs sm:text-sm text-ink-soft">{subtitle}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}