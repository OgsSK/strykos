import React, { useEffect, useState, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api } from "@/lib/api";
import { CheckCircle2, Clock, Loader2, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
// ⭐ MODIFIÉ : utilise adminUtils.money (Intl.NumberFormat, GBP-safe)
import { money as fmtMoney } from "@/lib/adminUtils";

export default function OrderConfirmation() {
  const { t, lang, clearCart } = useStore();
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  // ⭐ NOUVEAU : mode COD (pas de session Stripe)
  const orderNumber = params.get("order");
  const isCod = params.get("cod") === "1";
  const emailParam = params.get("email");

  const [state, setState] = useState("processing"); // processing | paid | pending
  const [order, setOrder] = useState(null);
  const cleared = useRef(false);
  const clearCartRef = useRef(clearCart);

  // ⭐ NOUVEAU : pré-remplit le panier pour le mode COD
  useEffect(() => {
    if (isCod && orderNumber && !cleared.current) {
      // Charge la commande via track (public avec order_number + email)
      const loadCodOrder = async () => {
        try {
          const { data } = await api.post("/orders/track", {
            order_number: orderNumber,
            email: emailParam || "",
          });
          setOrder(data);
          setState("paid");
          if (!cleared.current) {
            clearCartRef.current();
            cleared.current = true;
          }
        } catch {
          // Si on n'a pas l'email (utilisateur connecté), on tente /orders/{order_number}
          try {
            const { data } = await api.get(`/orders/${orderNumber}`);
            setOrder(data);
            setState("paid");
            if (!cleared.current) {
              clearCartRef.current();
              cleared.current = true;
            }
          } catch {
            setState("pending");
          }
        }
      };
      loadCodOrder();
      return;
    }
  }, [isCod, orderNumber, emailParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mode Stripe (comportement habituel)
  useEffect(() => {
    if (isCod || !sessionId) {
      if (!isCod) setState("pending");
      return;
    }
    let tries = 0;
    let timer;
    const poll = async () => {
      try {
        const { data } = await api.get(`/payments/status/${sessionId}`);
        setOrder(data.order);
        if (data.payment_status === "paid") {
          setState("paid");
          if (!cleared.current) { clearCartRef.current(); cleared.current = true; }
          return;
        }
      } catch (e) {}
      tries += 1;
      if (tries >= 8) { setState("pending"); return; }
      timer = setTimeout(poll, 2000);
    };
    poll();
    return () => clearTimeout(timer);
  }, [sessionId, isCod]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⭐ MODIFIÉ : délègue à adminUtils.money (Intl.NumberFormat)
  // Supporte EUR, GBP, USD, XOF — locale-aware
  const money = (v, cur) => fmtMoney(v, cur || "EUR", lang === "fr" ? "fr-FR" : "en-GB");

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center" data-testid="order-confirmation">
      {state === "processing" && (
        <div><Loader2 className="w-14 h-14 mx-auto text-brand animate-spin mb-4" />
          <h1 className="font-heading text-2xl font-bold uppercase">{t("orderProcessing")}</h1></div>
      )}

      {state === "paid" && order && (
        <div>
          {/* ⭐ Icône différente selon le mode */}
          {isCod ? (
            <Banknote className="w-16 h-16 mx-auto text-amber-600 mb-4" />
          ) : (
            <CheckCircle2 className="w-16 h-16 mx-auto text-green-600 mb-4" />
          )}

          <h1 className="font-heading text-3xl font-bold uppercase" data-testid="confirmation-title">
            {isCod
              ? (lang === "fr" ? "Commande enregistrée !" : "Order registered!")
              : t("orderConfirmed")}
          </h1>

          <p className="text-ink-soft mt-2">
            {isCod
              ? (lang === "fr"
                  ? "Merci ! Votre commande est confirmée. Vous réglerez en espèces à la réception."
                  : "Thank you! Your order is confirmed. You will pay in cash on delivery.")
              : t("thankYou")}
          </p>

          <p className="text-xs text-ink-muted mt-1">
            {lang === "fr"
              ? `Un e-mail de confirmation a été envoyé à ${order.email}`
              : `A confirmation email has been sent to ${order.email}`}
          </p>

          {/* ⭐ NOUVEAU : bandeau COD */}
          {isCod && (
            <div className="mt-6 bg-amber-50 border-l-4 border-amber-500 p-4 text-left">
              <div className="flex items-start gap-3">
                <Banknote className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-amber-900 text-sm uppercase tracking-wider mb-1">
                    {lang === "fr" ? "Paiement à la livraison" : "Cash on delivery"}
                  </div>
                  <p className="text-sm text-amber-800">
                    {lang === "fr"
                      ? "Préparez le montant exact en espèces. Le livreur encaissera à la remise du colis."
                      : "Prepare the exact amount in cash. The driver will collect on delivery."}
                  </p>
                  <p className="text-xs text-amber-700 mt-2">
                    {lang === "fr" ? "Montant à préparer : " : "Amount to prepare: "}
                    <strong>{money(order.total, order.currency)}</strong>
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 border border-border p-6 text-left">
            <div className="flex justify-between text-sm py-1">
              <span className="text-ink-muted">{t("orderNumber")}</span>
              <span className="font-bold" data-testid="confirmation-order-number">{order.order_number}</span>
            </div>

            {order.discount > 0 && (
              <div className="flex justify-between text-sm py-1 text-green-700">
                <span>{t("discount")} {order.promo_code && `(${order.promo_code})`}</span>
                <span>-{money(order.discount, order.currency)}</span>
              </div>
            )}

            <div className="flex justify-between text-sm py-1">
              <span className="text-ink-muted">{t("total")}</span>
              <span className="font-semibold">{money(order.total, order.currency)}</span>
            </div>

            {order.charge_currency !== order.currency && !isCod && (
              <div className="text-xs text-ink-muted py-1">
                {lang === "fr" ? "Facturé" : "Charged"}: {money(order.charge_total, order.charge_currency)}
              </div>
            )}

            <div className="flex justify-between text-sm py-1">
              <span className="text-ink-muted">{t("status")}</span>
              {/* ⭐ Statut adapté selon le mode */}
              {isCod ? (
                <span className="uppercase text-amber-700 font-semibold inline-flex items-center gap-1">
                  <Banknote className="w-3.5 h-3.5" />
                  {lang === "fr" ? "À payer à la livraison" : "Pay on delivery"}
                </span>
              ) : (
                <span className="uppercase text-green-600 font-semibold">{order.payment_status}</span>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-border text-sm">
              {(order.items || []).map((it, i) => (
                <div key={i} className="flex justify-between py-1">
                  <span>{(lang === "fr" ? it.name_fr : it.name_en)} ({it.size}) x{it.quantity}</span>
                  <span>{money(it.line_total, order.currency)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 justify-center mt-6">
            <Link
              to={`/suivi?order=${order.order_number}&email=${encodeURIComponent(order.email || "")}`}
              data-testid="confirmation-track-link"
            >
              <Button className="bg-ink hover:bg-ink/90 rounded-none uppercase">
                {t("trackOrder")}
              </Button>
            </Link>
            <Link to="/catalog">
              <Button variant="outline" className="rounded-none uppercase">
                {t("continueShopping")}
              </Button>
            </Link>
          </div>
        </div>
      )}

      {state === "pending" && (
        <div>
          <Clock className="w-14 h-14 mx-auto text-amber-500 mb-4" />
          <h1 className="font-heading text-2xl font-bold uppercase">{t("paymentPending")}</h1>
          {order && (
            <p className="text-ink-soft mt-2">
              {t("orderNumber")}: <strong>{order.order_number}</strong>
            </p>
          )}
          <Link to="/account">
            <Button className="mt-6 bg-ink hover:bg-ink/90 rounded-none uppercase">
              {t("myOrders")}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}