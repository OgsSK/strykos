import { Stars } from "@/components/Stars";
import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import TiltCard from "@/components/TiltCard";
import { swrGet } from "@/lib/cache";

export default function ProductCard({ product }) {
  const { lang, fmt, priceOf, wishlist, toggleWishlist, user, t, addToCart } = useStore();

  const name = lang === "fr" ? product.name_fr : product.name_en;
  const p = priceOf(product.prices);
  const inWishlist = wishlist.includes(product.id);
  const img = product.images?.[0];
  const img2 = product.images?.[1];
  const video = product.video_url;
  const vidRef = useRef();
  const [hover, setHover] = useState(false);
  const [quickAdding, setQuickAdding] = useState(false);

  // ⭐ Détection auto basée sur ce que le backend renvoie dans la liste (full=false)
  // Le backend renvoie `sizes` (array de noms) et `customization_fields`.
  // Il NE renvoie PAS les variants complets dans la home.
  const hasMultipleSizes = (product.sizes?.length || 0) > 1;
  const hasCustomization = (product.customization_fields?.length || 0) > 0;
  const needsChoice = hasMultipleSizes || hasCustomization || product.customizable;

  // ⭐ Texte du bouton (override admin ou auto)
  const ctaMode = product.cta_label || "auto";
  const resolveCta = () => {
    switch (ctaMode) {
      case "add_to_cart": return { text: t("addToCart"),   action: "add"  };
      case "choose":      return { text: t("choose"),      action: "go"   };
      case "customize":   return { text: t("customize"),   action: "go"   };
      case "order":       return { text: t("order"),       action: "go"   };
      case "view":        return { text: t("view"),        action: "go"   };
      default: // auto
        return needsChoice
          ? { text: t("choose"),     action: "go"  }
          : { text: t("addToCart"),  action: "add" };
    }
  };
  const cta = resolveCta();

  const onEnter = () => {
    setHover(true);
    const v = vidRef.current;
    if (v) { v.currentTime = 0; v.play().catch(() => {}); }
  };
  const onLeave = () => { setHover(false); vidRef.current?.pause(); };

  const onHeart = async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!user) {
      toast.error(lang === "fr" ? "Connectez-vous pour ajouter aux favoris" : "Sign in to save favorites");
      return;
    }
    await toggleWishlist(product.id);
  };

  // ⭐ Ajout direct au panier : on doit charger le produit complet
  // pour récupérer le variant_id (non inclus dans la liste).
  const handleQuickAdd = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (quickAdding) return;

    // Si le produit a des options → on laisse le Link rediriger
    if (needsChoice) return;

    setQuickAdding(true);
    try {
      // Fetch le produit complet pour avoir le variant_id + stock
      const fullProduct = await new Promise((resolve, reject) => {
        swrGet(`/products/${product.slug}`, (data) => resolve(data), { ttl: 60 * 1000 })
          .catch(reject);
      });

      const variants = fullProduct?.variants || [];
      const variant = variants.find((v) => v.stock > 0) || variants[0];

      if (!variant) {
        toast.error(t("outOfStock"));
        setQuickAdding(false);
        return;
      }
      if (variant.stock <= 0) {
        toast.error(t("outOfStock"));
        setQuickAdding(false);
        return;
      }

      addToCart({
        product_id: fullProduct.id,
        variant_id: variant.id,
        slug: fullProduct.slug,
        name_fr: fullProduct.name_fr,
        name_en: fullProduct.name_en,
        image: fullProduct.images?.[0] || "",
        size: variant.size,
        color: variant.color,
        prices: fullProduct.prices,
        extra_price_eur: variant.extra_price_eur || 0,
        customizable: false,
        customization_fields: [],
        customization_price_eur: 0,
        customization: null,
        quantity: 1,
      });
      toast.success(t("addToCart"));
    } catch {
      toast.error(lang === "fr" ? "Impossible d'ajouter au panier" : "Could not add to cart");
    }
    setQuickAdding(false);
  };

  return (
    <Link to={`/product/${product.slug}`} data-testid={`product-card-${product.slug}`} className="group block">
      <TiltCard
        intensity={7}
        scale={1.015}
        onMouseEnter={video ? onEnter : undefined}
        onMouseLeave={video ? onLeave : undefined}
      >
        <div className="relative aspect-square bg-cream-dark overflow-hidden rounded-2xl">
          {img && (
            <img
              src={img}
              alt={name}
              loading="lazy"
              className="w-full h-full object-cover transition-opacity duration-300 group-hover:opacity-0"
            />
          )}
          {video ? (
            <video
              ref={vidRef}
              src={video}
              poster={img2 || img}
              muted
              loop
              playsInline
              preload={hover ? "auto" : "none"}
              data-testid={`product-video-${product.slug}`}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            />
          ) : img2 ? (
            <img
              src={img2}
              alt={name}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            />
          ) : img ? (
            <img
              src={img}
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300"
            />
          ) : null}

          {video && (
            <span className="absolute bottom-2 left-2 bg-ink/70 text-white text-[9px] font-bold uppercase px-1.5 py-0.5 tracking-wider rounded">
              Video
            </span>
          )}

          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {product.on_sale && (
              <span className="bg-brand text-white text-[9px] sm:text-[10px] font-bold uppercase px-1.5 sm:px-2 py-0.5 sm:py-1 rounded" data-testid="sale-badge">
                Sale
              </span>
            )}
            {product.is_new && (
              <span className="bg-ink text-white text-[9px] sm:text-[10px] font-bold uppercase px-1.5 sm:px-2 py-0.5 sm:py-1 rounded">
                New
              </span>
            )}
          </div>

          <button
            onClick={onHeart}
            data-testid={`wishlist-btn-${product.slug}`}
            className="absolute top-2 right-2 w-7 h-7 sm:w-8 sm:h-8 bg-white/90 rounded-full flex items-center justify-center hover:bg-white transition-colors"
          >
            <Heart className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${inWishlist ? "fill-brand text-brand" : "text-ink"}`} />
          </button>

          {!product.in_stock && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
              <span className="bg-ink text-white text-[10px] sm:text-xs uppercase px-2 sm:px-3 py-1 tracking-wide rounded-full">
                {lang === "fr" ? "Épuisé" : "Sold out"}
              </span>
            </div>
          )}
        </div>
      </TiltCard>

      <div className="pt-2 sm:pt-3 text-center sm:text-left">
        {product.brand && (
          <div className="text-[10px] sm:text-xs text-ink-muted uppercase tracking-wider">
            {product.brand.name}
          </div>
        )}
        <div className="text-xs sm:text-sm font-medium text-ink line-clamp-1 mt-0.5">{name}</div>
        {product.review_count > 0 && (
          <div className="mt-0.5 flex justify-center sm:justify-start">
            <Stars value={product.rating_avg} size="xs" count={product.review_count} />
          </div>
        )}
        <div className="flex items-center justify-center sm:justify-start gap-2 mt-1">
          <span className={`text-xs sm:text-sm font-semibold ${product.on_sale ? "text-brand" : "text-ink"}`} data-testid={`price-${product.slug}`}>
            {fmt(p.price)}
          </span>
          {p.compare_at && (
            <span className="text-[10px] sm:text-xs text-ink-muted line-through">{fmt(p.compare_at)}</span>
          )}
        </div>

        {cta.action === "add" && !needsChoice ? (
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={!product.in_stock || quickAdding}
            className="mt-2 sm:mt-3 w-full bg-ink text-cream py-1.5 sm:py-2 rounded-full text-[10px] sm:text-xs font-semibold hover:bg-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid={`cta-${product.slug}`}
          >
            {quickAdding
              ? (lang === "fr" ? "Ajout..." : "Adding...")
              : cta.text}
          </button>
        ) : (
          <div
            className="mt-2 sm:mt-3 w-full bg-ink text-cream py-1.5 sm:py-2 rounded-full text-[10px] sm:text-xs font-semibold hover:bg-brand transition-colors text-center cursor-pointer"
            data-testid={`cta-${product.slug}`}
          >
            {cta.text} →
          </div>
        )}
      </div>
    </Link>
  );
}