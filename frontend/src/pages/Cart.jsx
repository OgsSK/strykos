import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2, ShoppingBag, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function Cart() {
  const { t, lang, cart, fmt, cartUnitPrice, cartSubtotal, updateQty, removeFromCart } = useStore();
  const nav = useNavigate();
  const [confirmRemove, setConfirmRemove] = useState(null); // { item, index }

  const askRemove = (item, index) => setConfirmRemove({ item, index });

  const doRemove = () => {
    if (!confirmRemove) return;
    removeFromCart(confirmRemove.item.variant_id, confirmRemove.item.customization);
    toast.success(lang === "fr" ? "Article retire du panier" : "Item removed from cart");
    setConfirmRemove(null);
  };

  if (cart.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center" data-testid="empty-cart">
        <ShoppingBag className="w-16 h-16 mx-auto text-ink-muted mb-4" />
        <h1 className="font-heading text-2xl font-bold uppercase">{t("emptyCart")}</h1>
        <Link to="/catalog"><Button className="mt-6 bg-brand hover:bg-brand-dark rounded-none uppercase">{t("continueShopping")}</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8" data-testid="cart-page">
      <h1 className="font-heading text-3xl font-bold uppercase tracking-tight mb-8">{t("yourCart")}</h1>
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {cart.map((item, i) => {
            const name = lang === "fr" ? item.name_fr : item.name_en;
            const unit = cartUnitPrice(item);
            return (
              <div key={i} className="flex gap-4 border border-border p-3" data-testid="cart-item">
                <img src={item.image} alt={name} className="w-20 h-24 object-cover bg-secondary" />
                <div className="flex-1">
                  <Link to={`/product/${item.slug}`} className="font-medium hover:text-brand">{name}</Link>
                  <div className="text-xs text-ink-muted mt-1">{t("size")}: {item.size}{item.color ? ` · ${item.color}` : ""}</div>
                  {/* PERSONNALISATION DESACTIVEE TEMPORAIREMENT */}
                  {false && item.customization && <div className="text-xs text-brand mt-0.5">{item.customization.name} {item.customization.number}</div>}
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center border border-border">
                      <button onClick={() => updateQty(item.variant_id, item.customization, item.quantity - 1)} className="p-1.5" data-testid="qty-minus"><Minus className="w-3 h-3" /></button>
                      <span className="w-8 text-center text-sm">{item.quantity}</span>
                      <button onClick={() => updateQty(item.variant_id, item.customization, item.quantity + 1)} className="p-1.5" data-testid="qty-plus"><Plus className="w-3 h-3" /></button>
                    </div>
                    <button
                      onClick={() => askRemove(item, i)}
                      data-testid="cart-remove-btn"
                      title={lang === "fr" ? "Retirer du panier" : "Remove from cart"}
                      className="text-ink-muted hover:text-brand transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="text-right font-semibold">{fmt(unit * item.quantity)}</div>
              </div>
            );
          })}
        </div>
        <div className="border border-border p-5 h-fit" data-testid="cart-summary">
          <h3 className="font-heading font-bold uppercase mb-4">{t("orderSummary")}</h3>
          <div className="flex justify-between text-sm py-2 border-b border-border">
            <span>{t("subtotal")}</span><span className="font-semibold" data-testid="cart-subtotal">{fmt(cartSubtotal)}</span>
          </div>
          <div className="flex justify-between text-sm py-2 text-ink-muted">
            <span>{t("shipping")}</span><span>{lang === "fr" ? "Calcule a l'etape suivante" : "At next step"}</span>
          </div>
          <Button onClick={() => nav("/checkout")} data-testid="checkout-button"
            className="w-full mt-4 bg-brand hover:bg-brand-dark text-white rounded-none h-12 uppercase font-bold tracking-wide">{t("checkout")}</Button>
          <Link to="/catalog" className="block text-center text-sm text-ink-muted hover:text-brand mt-3">{t("continueShopping")}</Link>
        </div>
      </div>

      {/* Modale : confirmation de retrait */}
      {confirmRemove && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setConfirmRemove(null)}>
          <div className="bg-white max-w-md w-full p-6 border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-bold text-lg mb-1">
                  {lang === "fr" ? "Retirer cet article ?" : "Remove this item?"}
                </h3>
                <p className="text-sm text-ink-soft">
                  {lang === "fr"
                    ? "Cet article sera retire de votre panier."
                    : "This item will be removed from your cart."}
                </p>
              </div>
            </div>

            {/* Aperçu du produit */}
            <div className="flex gap-3 border border-border p-3 bg-secondary/40">
              <img
                src={confirmRemove.item.image}
                alt={lang === "fr" ? confirmRemove.item.name_fr : confirmRemove.item.name_en}
                className="w-14 h-16 object-cover bg-secondary shrink-0"
              />
              <div className="flex-1 text-sm">
                <div className="font-medium leading-tight">
                  {lang === "fr" ? confirmRemove.item.name_fr : confirmRemove.item.name_en}
                </div>
                <div className="text-xs text-ink-muted mt-1">
                  {t("size")}: {confirmRemove.item.size}
                  {confirmRemove.item.color ? ` · ${confirmRemove.item.color}` : ""}
                </div>
                <div className="text-xs text-ink-muted">x{confirmRemove.item.quantity}</div>
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => setConfirmRemove(null)}
                className="px-4 py-2 border border-border text-xs font-bold uppercase hover:bg-secondary"
                data-testid="cancel-remove-btn"
              >
                {lang === "fr" ? "Annuler" : "Cancel"}
              </button>
              <button
                onClick={doRemove}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase inline-flex items-center gap-1.5"
                data-testid="confirm-remove-btn"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {lang === "fr" ? "Retirer" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}