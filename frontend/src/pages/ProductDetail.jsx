import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api } from "@/lib/api";
import { swrGet } from "@/lib/cache";
import ProductCard from "@/components/ProductCard";
import ProductReviews from "@/components/ProductReviews";
import { Stars } from "@/components/Stars";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Heart, Minus, Plus, ShieldCheck, Truck } from "lucide-react";
import { toast } from "sonner";
import TiltCard from "@/components/TiltCard";
import { mediaSrc } from "@/lib/adminUtils";

export default function ProductDetail() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { lang, t, fmt, priceOf, convertEur, addToCart, wishlist, toggleWishlist, user, brand } = useStore();
  const [product, setProduct] = useState(null);
  const [activeImg, setActiveImg] = useState(0);
  const [variant, setVariant] = useState(null);
  const [qty, setQty] = useState(1);
  // ⭐ Personnalisation : state keyed par field.key
  const [customValues, setCustomValues] = useState({});

  useEffect(() => {
    window.scrollTo(0, 0);
    let first = true;
    swrGet(`/products/${slug}`, (data) => {
      setProduct(data);
      if (first) {
        // ⭐ Présélectionne le 1er variant EN STOCK (ou le 1er tout court si tous épuisés)
        const variants = data?.variants || [];
        const firstInStock = variants.find((v) => v.stock > 0) || variants[0] || null;
        setVariant(firstInStock);
        setActiveImg(0);
        setQty(1);
        // ⭐ Initialise les champs avec leur default_value
        const fields = data?.customization_fields || [];
        const init = {};
        fields.forEach((f) => { if (f.key) init[f.key] = f.default_value || ""; });
        setCustomValues(init);
        first = false;
      }
    }, { ttl: 3 * 60 * 1000 }).catch(() => setProduct(false));
  }, [slug]);

  // ⭐ Calcule le surcoût personnalisation (somme des champs non vides)
  const customPriceEur = useMemo(() => {
    if (!product || product === false) return 0;
    const fields = product.customization_fields || [];
    if (!fields.length) {
      // Fallback ancien système
      const anyFilled = Object.values(customValues).some((v) => v && String(v).trim());
      return anyFilled ? Number(product.customization_price_eur || 0) : 0;
    }
    return fields.reduce((sum, f) => {
      const v = customValues[f.key];
      if (v === undefined || v === null || String(v).trim() === "") return sum;
      return sum + Number(f.price_eur || 0);
    }, 0);
  }, [customValues, product]);

  // ⭐ Preview live — DOIT être avant les early returns (règle des hooks)
  const previewText = useMemo(() => {
    if (!product || product === false) return "";
    const fields = product.customization_fields || [];
    const textField = fields.find((f) => ["text", "textarea"].includes(f.type) && customValues[f.key]);
    if (textField && customValues[textField.key]) {
      return String(customValues[textField.key]).slice(0, 40);
    }
    return "";
  }, [product, customValues]);

  // ─── EARLY RETURNS (après tous les hooks) ───
  if (product === false) return <div className="py-20 text-center">{t("noResults")}</div>;
  if (!product) return <div className="py-20 text-center text-ink-muted">{t("loading")}</div>;

  const name = lang === "fr" ? product.name_fr : product.name_en;
  const desc = lang === "fr" ? product.description_fr : product.description_en;
  const p = priceOf(product.prices);
  const sizes = product.variants || [];
  const inWishlist = wishlist.includes(product.id);
  const canAdd = variant && variant.stock >= qty;

  // ⭐ Nouveaux indicateurs d'état pour le bouton
  const allVariantsOut = sizes.length > 0 && sizes.every((v) => v.stock === 0);
  const needsVariantChoice = !variant && sizes.length > 1;

  const fields = product.customization_fields || [];
  const hasFields = product.customizable && fields.length > 0;

  // ⭐ Prix unitaire total affiché
  const extraVariantDisplay = variant ? convertEur(variant.extra_price_eur || 0) : 0;
  const customDisplay = convertEur(customPriceEur);
  const unitTotal = p.price + extraVariantDisplay + customDisplay;

  const setFieldValue = (key, val) => setCustomValues((prev) => ({ ...prev, [key]: val }));

  // ⭐ Validation avant ajout
  const validateCustomization = () => {
    if (!hasFields) return true;
    for (const f of fields) {
      const v = customValues[f.key];
      const isEmpty = v === undefined || v === null || String(v).trim() === "";
      if (f.required && isEmpty) {
        toast.error(lang === "fr"
          ? `Le champ « ${f.label_fr || f.key} » est obligatoire`
          : `Field "${f.label_en || f.key}" is required`);
        return false;
      }
      if (!isEmpty && ["text", "textarea"].includes(f.type)) {
        const maxLen = Number(f.max_length || 200);
        if (String(v).length > maxLen) {
          toast.error(lang === "fr"
            ? `« ${f.label_fr || f.key} » ne doit pas dépasser ${maxLen} caractères`
            : `"${f.label_en || f.key}" must not exceed ${maxLen} characters`);
          return false;
        }
      }
    }
    return true;
  };

  const buildItem = () => {
    // ⭐ Objet brut envoyé au backend : { message: "...", age: "8", ... }
    const customObj = {};
    let hasAny = false;
    fields.forEach((f) => {
      const v = customValues[f.key];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        customObj[f.key] = String(v).trim();
        hasAny = true;
      }
    });
    return {
      product_id: product.id,
      variant_id: variant.id,
      slug: product.slug,
      name_fr: product.name_fr,
      name_en: product.name_en,
      image: product.images?.[0] || "",
      size: variant.size,
      color: variant.color,
      prices: product.prices,
      extra_price_eur: variant.extra_price_eur || 0,
      customizable: product.customizable,
      customization_fields: fields,              // ⭐ schéma pour l'affichage panier/admin
      customization_price_eur: customPriceEur,   // ⭐ surcoût réel calculé
      customization: hasAny ? customObj : null,  // ⭐ valeurs saisies
      quantity: qty,
    };
  };

  const handleAdd = (buy) => {
    if (!variant) {
      toast.error(lang === "fr" ? "Choisissez une portion" : "Select a portion");
      return;
    }
    if (variant.stock < qty) { toast.error(t("outOfStock")); return; }
    if (!validateCustomization()) return;
    addToCart(buildItem());
    toast.success(lang === "fr" ? "Ajouté au panier" : "Added to cart");
    if (buy) nav("/checkout");
  };

  const onHeart = async () => {
    if (!user) { toast.error(lang === "fr" ? "Connectez-vous" : "Sign in first"); return; }
    await toggleWishlist(product.id);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8" data-testid="product-detail">
      <nav className="text-xs text-ink-muted mb-6">
        <Link to="/" className="hover:text-brand">{brand.part1}{brand.part2}</Link> /{" "}
        <Link to="/catalog" className="hover:text-brand">{t("catalog")}</Link> /{" "}
        <span className="text-ink">{name}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-10">
        {/* Galerie */}
        <div>
          <TiltCard intensity={6} scale={1.01} key={`tilt-${activeImg}`}>
            <div className="relative aspect-[4/5] bg-secondary overflow-hidden">
              <img src={mediaSrc(product.images?.[activeImg])} alt={name} className="w-full h-full object-cover" data-testid="product-main-image" />
              {/* ⭐ Preview live du texte personnalisé */}
              {previewText && (
                <div className="absolute inset-x-4 bottom-4 bg-white/90 backdrop-blur px-4 py-2 rounded shadow-lg text-center">
                  <div className="text-[10px] uppercase tracking-wider text-ink-muted">Aperçu</div>
                  <div className="font-serif text-lg text-ink italic truncate">"{previewText}"</div>
                </div>
              )}
            </div>
          </TiltCard>
          {product.images?.length > 1 && (
            <div className="flex gap-2 mt-3">
              {product.images.map((img, i) => (
                <button key={i} onClick={() => setActiveImg(i)}
                  className={`w-16 h-20 overflow-hidden border-2 ${activeImg === i ? "border-brand" : "border-transparent"}`}>
                  <img src={mediaSrc(img)} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          {product.video_url && (
            <video src={mediaSrc(product.video_url)} controls playsInline className="w-full mt-4 bg-black" data-testid="product-video" />
          )}
        </div>

        {/* Info */}
        <div>
          {product.brand && <div className="text-sm text-ink-muted uppercase tracking-wider">{product.brand.name}</div>}
          {product.review_count > 0 && (
            <a href="#product-reviews" className="inline-block mt-1">
              <Stars value={product.rating_avg} count={product.review_count} testid="product-stars" />
            </a>
          )}
          <h1 className="font-heading text-2xl sm:text-3xl font-bold mt-1">{name}</h1>

          <div className="flex items-center gap-3 mt-3">
            <span className={`text-2xl font-bold ${product.on_sale ? "text-brand" : "text-ink"}`} data-testid="product-price">
              {fmt(unitTotal)}
            </span>
            {p.compare_at && <span className="text-lg text-ink-muted line-through">{fmt(p.compare_at)}</span>}
          </div>
          {(customPriceEur > 0 || extraVariantDisplay > 0) && (
            <div className="text-xs text-ink-muted mt-1">
              {p.price && <>Base : {fmt(p.price)}</>}
              {extraVariantDisplay > 0 && <> · Portion : +{fmt(extraVariantDisplay)}</>}
              {customPriceEur > 0 && <> · Personnalisation : +{fmt(customDisplay)}</>}
            </div>
          )}
          <div className="text-xs text-ink-muted mt-1">{t("reference")}: {product.sku}</div>

          {/* Portions / formats */}
          <div className="mt-6">
            <div className="text-sm font-semibold mb-2">
              {lang === "fr" ? "Portion / Format" : "Portion / Format"}
            </div>
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
            {/* ⭐ Stock du variant sélectionné */}
            {variant && (
              <div className="text-xs mt-2 text-ink-muted" data-testid="variant-stock">
                {variant.stock > 0
                  ? `${t("inStock")} (${variant.stock})`
                  : t("outOfStock")}
              </div>
            )}
            {/* ⭐ Bonus UX : message d'aide si aucune portion sélectionnée */}
            {!variant && sizes.length > 0 && (
              <p className="text-xs mt-2 text-brand">
                {lang === "fr" ? "👆 Choisissez une portion pour continuer" : "👆 Choose a portion to continue"}
              </p>
            )}
          </div>

          {/* ⭐ Personnalisation dynamique */}
          {hasFields && (
            <div className="mt-6 border border-border p-4 bg-brand/5" data-testid="customization-block">
              <div className="font-semibold text-sm mb-3 flex items-center gap-2">
                🎨 {lang === "fr" ? "Personnalisez votre création" : "Customize your creation"}
              </div>
              <div className="space-y-3">
                {fields.map((f) => {
                  const val = customValues[f.key] ?? "";
                  const priceNum = Number(f.price_eur || 0);
                  const label = lang === "fr" ? f.label_fr : f.label_en;
                  const placeholder = lang === "fr" ? f.placeholder_fr : f.placeholder_en;
                  const maxLen = f.max_length ? Number(f.max_length) : undefined;
                  return (
                    <div key={f.key}>
                      <Label className="text-xs font-medium flex items-center justify-between">
                        <span>
                          {label}
                          {f.required && <span className="text-brand ml-1">*</span>}
                        </span>
                        {priceNum > 0 && (
                          <span className="text-[11px] text-brand font-semibold">
                            +{fmt(convertEur(priceNum))}
                          </span>
                        )}
                      </Label>

                      {f.type === "textarea" ? (
                        <Textarea rows={2} value={val} maxLength={maxLen}
                          placeholder={placeholder}
                          onChange={(e) => setFieldValue(f.key, e.target.value)}
                          className="mt-1 bg-white" data-testid={`custom-field-${f.key}`} />
                      ) : f.type === "select" ? (
                        <select value={val} onChange={(e) => setFieldValue(f.key, e.target.value)}
                          className="mt-1 w-full border border-border h-10 px-3 bg-white text-sm"
                          data-testid={`custom-field-${f.key}`}>
                          <option value="">—</option>
                          {(f.options || []).map((o) => (
                            <option key={o.value} value={o.value}>
                              {lang === "fr" ? o.label_fr : o.label_en}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                          value={val}
                          maxLength={f.type === "text" ? maxLen : undefined}
                          placeholder={placeholder}
                          onChange={(e) => setFieldValue(f.key, e.target.value)}
                          className="mt-1 bg-white" data-testid={`custom-field-${f.key}`} />
                      )}

                      {f.type === "text" && maxLen && (
                        <p className="text-[10px] text-ink-muted mt-0.5 text-right">
                          {String(val).length}/{maxLen}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantité + actions */}
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

          {/* ⭐ Bouton avec label intelligent */}
          {allVariantsOut ? (
            <Button disabled data-testid="out-of-stock-button"
              className="w-full mt-4 bg-gray-200 text-gray-500 rounded-none h-12 uppercase tracking-wide font-bold cursor-not-allowed">
              {lang === "fr" ? "Épuisé" : "Sold out"}
            </Button>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <Button
                onClick={() => handleAdd(false)}
                disabled={!canAdd}
                data-testid="add-to-cart-button"
                className="flex-1 bg-ink hover:bg-ink/90 text-white rounded-none h-12 uppercase tracking-wide font-bold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {needsVariantChoice
                  ? (lang === "fr" ? "Choisissez une portion" : "Choose a portion")
                  : t("addToCart")}
              </Button>
              <Button
                onClick={() => handleAdd(true)}
                disabled={!canAdd}
                data-testid="buy-now-button"
                className="flex-1 bg-brand hover:bg-brand-dark text-white rounded-none h-12 uppercase tracking-wide font-bold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {t("buyNow")}
              </Button>
            </div>
          )}

          {/* Delivery */}
          <div className="mt-6 space-y-2 text-sm text-ink-soft">
            <div className="flex items-center gap-2"><Truck className="w-4 h-4 text-brand" /> {t("deliveryInfo")}</div>
            <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-brand" /> {t("independentStore")}</div>
          </div>

          {desc && (
            <div className="mt-6 pt-6 border-t border-border">
              <h3 className="font-semibold mb-2">{t("description")}</h3>
              <p className="text-sm text-ink-soft leading-relaxed">{desc}</p>
            </div>
          )}
        </div>
      </div>

      <ProductReviews slug={product.slug} />

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