import React, { useEffect, useState, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api } from "@/lib/api";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OrderConfirmation() {
  const { t, lang, clearCart } = useStore();
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [state, setState] = useState("processing"); // processing | paid | pending
  const [order, setOrder] = useState(null);
  const cleared = useRef(false);
  const clearCartRef = useRef(clearCart);

  useEffect(() => {
    if (!sessionId) { setState("pending"); return; }
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
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const money = (v, cur) => {
    if (v == null) return "";
    if (cur === "XOF") return `${Math.round(v).toLocaleString("fr-FR")} FCFA`;
    if (cur === "USD") return `$${v.toFixed(2)}`;
    return `${v.toFixed(2)} €`;
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center" data-testid="order-confirmation">
      {state === "processing" && (
        <div><Loader2 className="w-14 h-14 mx-auto text-brand animate-spin mb-4" />
          <h1 className="font-heading text-2xl font-bold uppercase">{t("orderProcessing")}</h1></div>
      )}
      {state === "paid" && order && (
        <div>
          <CheckCircle2 className="w-16 h-16 mx-auto text-green-600 mb-4" />
          <h1 className="font-heading text-3xl font-bold uppercase" data-testid="confirmation-title">{t("orderConfirmed")}</h1>
          <p className="text-ink-soft mt-2">{t("thankYou")}</p>
          <p className="text-xs text-ink-muted mt-1">{lang === "fr" ? `Un e-mail de confirmation a ete envoye a ${order.email}` : `A confirmation email has been sent to ${order.email}`}</p>
          <div className="mt-6 border border-border p-6 text-left">
            <div className="flex justify-between text-sm py-1"><span className="text-ink-muted">{t("orderNumber")}</span><span className="font-bold" data-testid="confirmation-order-number">{order.order_number}</span></div>
            {order.discount > 0 && <div className="flex justify-between text-sm py-1 text-green-700"><span>{t("discount")} {order.promo_code && `(${order.promo_code})`}</span><span>-{money(order.discount, order.currency)}</span></div>}
            <div className="flex justify-between text-sm py-1"><span className="text-ink-muted">{t("total")}</span><span className="font-semibold">{money(order.total, order.currency)}</span></div>
            {order.charge_currency !== order.currency && <div className="text-xs text-ink-muted py-1">{lang === "fr" ? "Facture" : "Charged"}: {money(order.charge_total, order.charge_currency)}</div>}
            <div className="flex justify-between text-sm py-1"><span className="text-ink-muted">{t("status")}</span><span className="uppercase text-green-600 font-semibold">{order.payment_status}</span></div>
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
            <Link to={`/suivi?order=${order.order_number}&email=${encodeURIComponent(order.email || "")}`} data-testid="confirmation-track-link"><Button className="bg-ink hover:bg-ink/90 rounded-none uppercase">{t("trackOrder")}</Button></Link>
            <Link to="/catalog"><Button variant="outline" className="rounded-none uppercase">{t("continueShopping")}</Button></Link>
          </div>
        </div>
      )}
      {state === "pending" && (
        <div>
          <Clock className="w-14 h-14 mx-auto text-amber-500 mb-4" />
          <h1 className="font-heading text-2xl font-bold uppercase">{t("paymentPending")}</h1>
          {order && <p className="text-ink-soft mt-2">{t("orderNumber")}: <strong>{order.order_number}</strong></p>}
          <Link to="/account"><Button className="mt-6 bg-ink hover:bg-ink/90 rounded-none uppercase">{t("myOrders")}</Button></Link>
        </div>
      )}
    </div>
  );
}
