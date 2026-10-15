import React from "react";
import { useStore } from "@/context/StoreProvider";
import { mediaSrc } from "@/lib/adminUtils";
import { Instagram } from "lucide-react";

export default function Gallery({ gallery }) {
  const { lang } = useStore();
  const items = (gallery?.items || []).filter((i) => i.image_url).slice(0, 8);
  if (!items.length) return null;

  const L = (o, k) => o?.[`${k}_${lang}`] || o?.[`${k}_fr`] || "";

  return (
    <section className="bg-cream-dark py-12 sm:py-20" data-testid="gallery-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
        {/* Titre */}
        <div className="text-center mb-8 sm:mb-12">
          {L(gallery, "overline") && (
            <span className="text-[11px] sm:text-xs font-sans font-semibold tracking-[0.25em] text-brand uppercase mb-3 block">
              {L(gallery, "overline")}
            </span>
          )}
          {L(gallery, "title") && (
            <h2
              className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-ink mb-3"
              style={{ textTransform: "none" }}
            >
              {L(gallery, "title")}
            </h2>
          )}
          {gallery.instagram_url && (
            <a
              href={gallery.instagram_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-brand transition-colors"
            >
              <Instagram className="w-4 h-4" />
              @cakesshop
            </a>
          )}
        </div>

        {/* Grille d'images */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {items.map((item, i) => (
            <a
              key={i}
              href={item.link || gallery.instagram_url || "#"}
              target={item.link || gallery.instagram_url ? "_blank" : undefined}
              rel="noreferrer"
              className="group relative aspect-square rounded-xl sm:rounded-2xl overflow-hidden bg-cream"
              data-testid={`gallery-item-${i}`}
            >
              <img
                src={mediaSrc(item.image_url)}
                alt={L(item, "caption") || ""}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/30 transition-colors flex items-center justify-center">
                <Instagram className="w-6 h-6 text-cream opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}