import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api } from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, Minus, Plus, ShieldCheck, Truck } from "lucide-react";
import { toast } from "sonner";

export default function ProductDetail() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { lang, t, fmt, priceOf, convertEur, addToCart, wishlist, toggleWishlist, user } = useStore();
  const [product, setProduct] = useState(null);
  const [activeImg, setActiveImg] = useState(0);
  const [variant, setVariant] = useState(null);
  const [qty, setQty] = useState(1);
  const [custom, setCustom] = useState({ name: "", number: "" });
  const [useCustom, setUseCustom] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    api.get(`/products/${slug}`).then((r) => {
      setProduct(r.data); setVariant(null); setActiveImg(0); setQty(1);
      setUseCustom(false); setCustom({ name: "", number: "" });
    }).catch(() => setProduct(false));
  }, [slug]);

  if (product === false) return <div className="py-20 text-center">{t("noResults")}</div>;
  if (!product) return <div className="py-20 text-center text-ink-muted">{t("loading")}</div>;

  const name = lang === "fr" ? product.name_fr : product.name_en;
  const desc = lang === "fr" ? product.description_fr : product.description_en;
  const p = priceOf(product.prices);
  const sizes = product.variants || [];
  const inWishlist = wishlist.includes(product.id);
  const canAdd = variant && variant.stock >= qty;

  const buildItem = () => ({
    product_id: product.id, variant_id: variant.id, slug: product.slug,
    name_fr: product.name_fr, name_en: product.name_en, image: product.images?.[0] || "",
    size: variant.size, color: variant.color, prices: product.prices,
    extra_price_eur: variant.extra_price_eur || 0,
    customizable: product.customizable, customization_price_eur: product.customization_price_eur,
    customization: useCustom && (custom.name || custom.number) ? custom : null,
    quantity: qty,
  });

  const handleAdd = (buy) => {
    if (!variant) { toast.error(lang === "fr" ? "Choisissez une taille" : "Select a size"); return; }
    if (variant.stock < qty) { toast.error(t("outOfStock")); return; }
    addToCart(buildItem());
    toast.success(lang === "fr" ? "Ajoute au panier" : "Added to cart");
    if (buy) nav("/checkout"); 
  };

  const onHeart = async () => {
    if (!user) { toast.error(lang === "fr" ? "Connectez-vous" : "Sign in first"); return; }
    await toggleWishlist(product.id);
  };

  const customPrice = convertEur(product.customization_price_eur);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8" data-testid="product-detail">
      <nav className="text-xs text-ink-muted mb-6">
        <Link to="/" className="hover:text-brand">STRYKOS</Link> / <Link to="/catalog" className="hover:text-brand">{t("catalog")}</Link> / <span className="text-ink">{name}</span>
      </nav>
      <div className="grid md:grid-cols-2 gap-10">
        {/* Gallery */}
        <div>
          <div className="aspect-[4/5] bg-secondary overflow-hidden">
            <img src={product.images?.[activeImg]} alt={name} className="w-full h-full object-cover" data-testid="product-main-image" />
          </div>
          {product.images?.length > 1 && (
            <div className="flex gap-2 mt-3">
              {product.images.map((img, i) => (
                <button key={i} onClick={() => setActiveImg(i)}
                  className={`w-16 h-20 overflow-hidden border-2 ${activeImg === i ? "border-brand" : "border-transparent"}`}>
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          {product.brand && <div className="text-sm text-ink-muted uppercase tracking-wider">{product.brand.name}</div>}
          <h1 className="font-heading text-2xl sm:text-3xl font-bold mt-1">{name}</h1>
          <div className="flex items-center gap-3 mt-3">
            <span className={`text-2xl font-bold ${product.on_sale ? "text-brand" : "text-ink"}`} data-testid="product-price">{fmt(p.price)}</span>
            {p.compare_at && <span className="text-lg text-ink-muted line-through">{fmt(p.compare_at)}</span>}
          </div>
          <div className="text-xs text-ink-muted mt-1">{t("reference")}: {product.sku}</div>

          {/* Sizes */}
          <div className="mt-6">
            <div className="text-sm font-semibold mb-2">{t("size")}</div>
            <div className="flex flex-wrap gap-2" data-testid="variant-selector">
              {sizes.map((v) => (
                <button key={v.id} disabled={v.stock === 0} onClick={() => setVariant(v)}
                  data-testid={`variant-${v.size}`}
                  className={`min-w-[48px] px-3 py-2 border text-sm transition-colors
                    ${v.stock === 0 ? "opacity-40 line-through cursor-not-allowed border-border" :
                    variant?.id === v.id ? "bg-ink text-white border-ink" : "border-border hover:border-ink"}`}>
                  {v.size}
                </button>
              ))}
            </div>
            {variant && <div className="text-xs mt-2 text-ink-muted" data-testid="variant-stock">
              {variant.stock > 0 ? `${t("inStock")} (${variant.stock})` : t("outOfStock")}</div>}
          </div>

          {/* Customization */}
          {product.customizable && (
            <div className="mt-6 border border-border p-4" data-testid="customization-block">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-sm">
                <input type="checkbox" checked={useCustom} onChange={(e) => setUseCustom(e.target.checked)} data-testid="customization-toggle" />
                {t("customization")} (+{fmt(customPrice)})
              </label>
              {useCustom && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <Input placeholder={t("playerName")} value={custom.name} maxLength={12}
                    onChange={(e) => setCustom({ ...custom, name: e.target.value.toUpperCase() })} data-testid="custom-name" />
                  <Input placeholder={t("playerNumber")} value={custom.number} maxLength={2} type="number"
                    onChange={(e) => setCustom({ ...custom, number: e.target.value })} data-testid="custom-number" />
                </div>
              )}
            </div>
          )}

          {/* Quantity + actions */}
          <div className="flex items-center gap-4 mt-6">
            <div className="flex items-center border border-border">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="p-2"><Minus className="w-4 h-4" /></button>
              <span className="w-10 text-center" data-testid="qty-value">{qty}</span>
              <button onClick={() => setQty(qty + 1)} className="p-2"><Plus className="w-4 h-4" /></button>
            </div>
            <button onClick={onHeart} data-testid="product-wishlist-btn" className="p-3 border border-border hover:border-ink">
              <Heart className={`w-5 h-5 ${inWishlist ? "fill-brand text-brand" : ""}`} />
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <Button onClick={() => handleAdd(false)} disabled={!canAdd} data-testid="add-to-cart-button"
              className="flex-1 bg-ink hover:bg-ink/90 text-white rounded-none h-12 uppercase tracking-wide font-bold">
              {t("addToCart")}
            </Button>
            <Button onClick={() => handleAdd(true)} disabled={!canAdd} data-testid="buy-now-button"
              className="flex-1 bg-brand hover:bg-brand-dark text-white rounded-none h-12 uppercase tracking-wide font-bold">
              {t("buyNow")}
            </Button>
          </div>

          {/* Delivery */}
          <div className="mt-6 space-y-2 text-sm text-ink-soft">
            <div className="flex items-center gap-2"><Truck className="w-4 h-4 text-brand" /> {t("deliveryInfo")}</div>
            <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-brand" /> {t("independentStore")}</div>
          </div>

          {desc && <div className="mt-6 pt-6 border-t border-border">
            <h3 className="font-semibold mb-2">{t("description")}</h3>
            <p className="text-sm text-ink-soft leading-relaxed">{desc}</p>
          </div>}
        </div>
      </div>

      {product.related?.length > 0 && (
        <section className="mt-16">
          <h2 className="font-heading text-2xl font-bold uppercase tracking-tight mb-6">{t("relatedProducts")}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">
            {product.related.map((rp) => <ProductCard key={rp.id} product={rp} />)}
          </div>
        </section>
      )}
    </div>
  );
}
