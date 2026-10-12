import { Stars } from "@/components/Stars";
import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import TiltCard from "@/components/TiltCard";

export default function ProductCard({ product }) {
  const { lang, fmt, priceOf, wishlist, toggleWishlist, user } = useStore();
  const name = lang === "fr" ? product.name_fr : product.name_en;
  const p = priceOf(product.prices);
  const inWishlist = wishlist.includes(product.id);
  const img = product.images?.[0];
  const img2 = product.images?.[1];
  const video = product.video_url;
  const vidRef = useRef();
  const [hover, setHover] = useState(false);
  const onEnter = () => { setHover(true); const v = vidRef.current; if (v) { v.currentTime = 0; v.play().catch(() => {}); } };
  const onLeave = () => { setHover(false); vidRef.current?.pause(); };

  const onHeart = async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!user) { toast.error(lang === "fr" ? "Connectez-vous pour ajouter aux favoris" : "Sign in to save favorites"); return; }
    await toggleWishlist(product.id);
  };

  return (
    <Link to={`/product/${product.slug}`} data-testid={`product-card-${product.slug}`} className="group block">
      <TiltCard
        intensity={7}
        scale={1.015}
        onMouseEnter={video ? onEnter : undefined}
        onMouseLeave={video ? onLeave : undefined}
      >
        <div className="relative aspect-[4/5] bg-secondary overflow-hidden">
          {img && <img src={img} alt={name} loading="lazy"
            className="w-full h-full object-cover transition-opacity duration-300 group-hover:opacity-0" />}
          {video ? (
            <video ref={vidRef} src={video} poster={img2 || img} muted loop playsInline preload={hover ? "auto" : "none"} data-testid={`product-video-${product.slug}`}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          ) : img2
            ? <img src={img2} alt={name} loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            : img && <img src={img} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300" />}
          {video && <span className="absolute bottom-2 left-2 bg-ink/70 text-white text-[9px] font-bold uppercase px-1.5 py-0.5 tracking-wider" data-testid={`video-badge-${product.slug}`}>Video</span>}
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
      </TiltCard>
      <div className="pt-3">
        {product.brand && <div className="text-xs text-ink-muted uppercase tracking-wider">{product.brand.name}</div>}
        <div className="text-sm font-medium text-ink line-clamp-1 mt-0.5">{name}</div>
        {product.review_count > 0 && <div className="mt-0.5"><Stars value={product.rating_avg} size="xs" count={product.review_count} /></div>}
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-sm font-semibold ${product.on_sale ? "text-brand" : "text-ink"}`} data-testid={`price-${product.slug}`}>{fmt(p.price)}</span>
          {p.compare_at && <span className="text-xs text-ink-muted line-through">{fmt(p.compare_at)}</span>}
        </div>
      </div>
    </Link>
  );
}