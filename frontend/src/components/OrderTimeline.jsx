import React from "react";
import { useStore } from "@/context/StoreProvider";
import { formatMoney } from "@/i18n/translations";
import { Check, Package, Truck, Home, CreditCard, ExternalLink, XCircle } from "lucide-react";

const FLOW = [
  { key: "paid", icon: CreditCard },
  { key: "preparing", icon: Package },
  { key: "shipped", icon: Truck },
  { key: "delivered", icon: Home },
];
const RANK = { pending_payment: -1, paid: 0, preparing: 1, shipped: 2, in_transit: 2, delivered: 3 };
const TERMINAL = ["cancelled", "refunded", "returned", "return_requested"];

export function OrderTimeline({ order }) {
  const { t, lang } = useStore();
  const rank = RANK[order.status] ?? -1;
  const terminal = TERMINAL.includes(order.status);
  const money = (v) => formatMoney(v, order.currency);

  return (
    <div className="border border-border bg-white" data-testid="order-timeline">
      <div className="p-5 border-b border-border flex flex-wrap justify-between gap-2">
        <div>
          <div className="text-xs text-ink-muted uppercase tracking-wider">{t("orderNumber")}</div>
          <div className="font-heading font-bold text-xl" data-testid="timeline-order-number">{order.order_number}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-muted uppercase tracking-wider">{t("status")}</div>
          <div className={`font-semibold ${terminal ? "text-brand" : "text-ink"}`} data-testid="timeline-status">{t(`st_${order.status}`)}</div>
        </div>
      </div>

      {terminal ? (
        <div className="p-5 flex items-center gap-3 text-sm text-ink-soft"><XCircle className="w-6 h-6 text-brand" /> {t(`st_${order.status}`)}</div>
      ) : (
        <div className="p-5">
          <div className="flex items-center">
            {FLOW.map((s, i) => {
              const done = rank >= i;
              const current = rank === i || (s.key === "shipped" && order.status === "in_transit");
              return (
                <React.Fragment key={s.key}>
                  <div className="flex flex-col items-center text-center w-20">
                    <div className={`w-10 h-10 flex items-center justify-center border-2 ${done ? "bg-ink border-ink text-white" : "border-border text-ink-muted"} ${current ? "ring-4 ring-brand/20 border-brand" : ""}`}>
                      {done && !current ? <Check className="w-5 h-5" /> : <s.icon className="w-5 h-5" />}
                    </div>
                    <span className={`text-[11px] mt-2 leading-tight ${done ? "font-semibold" : "text-ink-muted"}`}>{t(`st_${s.key}`)}</span>
                  </div>
                  {i < FLOW.length - 1 && <div className={`flex-1 h-0.5 -mt-6 ${rank > i ? "bg-ink" : "bg-border"}`} />}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-5 pb-5">
        <div className="bg-secondary p-4 text-sm" data-testid="tracking-info">
          <div className="font-semibold uppercase text-xs tracking-wider mb-2 inline-flex items-center gap-2"><Truck className="w-4 h-4" /> {t("carrier")}</div>
          {order.tracking_number ? (
            <div className="space-y-1">
              <div>{order.tracking_carrier && <span className="font-medium">{order.tracking_carrier} · </span>}<span className="font-mono" data-testid="tracking-number-value">{order.tracking_number}</span></div>
              {order.tracking_url && <a href={order.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand font-semibold hover:underline" data-testid="tracking-link">{t("trackOnCarrier")} <ExternalLink className="w-3 h-3" /></a>}
              {order.shipped_at && <div className="text-xs text-ink-muted">{t("st_shipped")}: {new Date(order.shipped_at).toLocaleDateString()}</div>}
            </div>
          ) : <p className="text-ink-muted">{t("notShippedYet")}</p>}
        </div>

        <div className="mt-4 text-sm">
          {(order.items || []).map((it, i) => (
            <div key={i} className="flex justify-between py-1.5 border-b border-border">
              <span>{lang === "fr" ? it.name_fr : it.name_en} ({it.size}) ×{it.quantity}</span><span>{money(it.line_total)}</span>
            </div>
          ))}
          {order.discount > 0 && <div className="flex justify-between py-1.5 text-green-700"><span>{t("discount")} {order.promo_code && `(${order.promo_code})`}</span><span>-{money(order.discount)}</span></div>}
          <div className="flex justify-between py-1.5"><span className="text-ink-muted">{t("shipping")}</span><span>{money(order.shipping_cost)}</span></div>
          <div className="flex justify-between py-2 font-bold"><span>{t("total")}</span><span>{money(order.total)}</span></div>
        </div>

        {(order.status_history || []).length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-ink-muted hover:text-ink">{t("orderHistory")}</summary>
            <ul className="mt-2 space-y-1">
              {[...order.status_history].reverse().map((h, i) => <li key={i} className="flex gap-3 text-xs"><span className="text-ink-muted w-32 shrink-0">{new Date(h.at).toLocaleString()}</span><span>{t(`st_${h.status}`)}</span></li>)}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
