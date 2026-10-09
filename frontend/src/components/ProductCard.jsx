import React from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { Heart } from "lucide-react";
import { toast } from "sonner";

export default function ProductCard({ product }) {
  const { lang, fmt, priceOf, wishlist, toggleWishlist, user } = useStore();
  const name = lang === "fr" ? product.name_fr : product.name_en;
  const p = priceOf(product.prices);
  const inWishlist = wishlist.includes(product.id);
  const img = product.images?.[0];
  const img2 = product.images?.[1];

  const onHeart = async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!user) { toast.error(lang === "fr" ? "Connectez-vous pour ajouter aux favoris" : "Sign in to save favorites"); return; }
    await toggleWishlist(product.id);
  };

  return (
    <Link to={`/product/${product.slug}`} data-testid={`product-card-${product.slug}`}
      className="group block">
      <div className="relative aspect-[4/5] bg-secondary overflow-hidden">
        {img && <img src={img} alt={name} loading="lazy"
          className="w-full h-full object-cover transition-opacity duration-300 group-hover:opacity-0" />}
        {img2
          ? <img src={img2} alt={name} loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          : img && <img src={img} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300" />}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {product.on_sale && <span className="bg-brand text-white text-[10px] font-bold uppercase px-2 py-1 tracking-wide" data-testid="sale-badge">Sale</span>}
          {product.is_new && <span className="bg-ink text-white text-[10px] font-bold uppercase px-2 py-1 tracking-wide">New</span>}
        </div>
        <button onClick={onHeart} data-testid={`wishlist-btn-${product.slug}`}
          className="absolute top-2 right-2 w-8 h-8 bg-white/90 flex items-center justify-center hover:bg-white transition-colors">
          <Heart className={`w-4 h-4 ${inWishlist ? "fill-brand text-brand" : "text-ink"}`} />
        </button>
        {!product.in_stock && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <span className="bg-ink text-white text-xs uppercase px-3 py-1 tracking-wide">Epuise</span>
          </div>
        )}
      </div>
      <div className="pt-3">
        {product.brand && <div className="text-xs text-ink-muted uppercase tracking-wider">{product.brand.name}</div>}
        <div className="text-sm font-medium text-ink line-clamp-1 mt-0.5">{name}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-sm font-semibold ${product.on_sale ? "text-brand" : "text-ink"}`} data-testid={`price-${product.slug}`}>{fmt(p.price)}</span>
          {p.compare_at && <span className="text-xs text-ink-muted line-through">{fmt(p.compare_at)}</span>}
        </div>
      </div>
    </Link>
  );
}
