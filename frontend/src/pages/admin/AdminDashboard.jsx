import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { money, fmtDate, STATUS_LABELS, STATUS_COLORS } from "@/lib/adminUtils";
import { forceCheckVersion } from "@/lib/cacheVersion";  // ⭐ nouveau
import { Package, ShoppingCart, AlertTriangle, Clock, Truck, Users, Mail, Tag, ArrowRight, Plus, XCircle, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";  // ⭐ nouveau

const Kpi = ({ icon: Icon, label, value, color, to, testid }) => (
  <Link to={to || "#"} className="bg-white border border-border p-4 hover:border-ink transition-colors block">
    <div className="flex items-center justify-between">
      <span className="text-[11px] uppercase tracking-wider text-ink-muted">{label}</span>
      <Icon className={`w-4 h-4 ${color}`} />
    </div>
    <div className="text-2xl font-bold mt-1" data-testid={testid}>{value}</div>
  </Link>
);

// ⭐ NOUVEAU : skeleton de chargement
const SkeletonKpi = () => (
  <div className="bg-white border border-border p-4 animate-pulse">
    <div className="h-3 w-20 bg-secondary rounded mb-2" />
    <div className="h-7 w-12 bg-secondary rounded" />
  </div>
);

export default function AdminDashboard() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // ⭐ load avec AbortController + gestion d'erreur
  const load = useCallback(async (isRefresh = false) => {
    const controller = new AbortController();
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const { data } = await api.get("/admin/dashboard", { signal: controller.signal });
      setD(data);
      setLastUpdated(new Date());
    } catch (e) {
      // Ignore les aborts volontaires
      if (e.name === "CanceledError" || e.name === "AbortError" || e.code === "ERR_CANCELED") return;
      setError(e?.response?.data?.detail || e.message || "Erreur de chargement");
      toast.error("Impossible de charger le tableau de bord");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let cleanup;
    load().then((c) => { cleanup = c; });
    return () => cleanup?.();
  }, [load]);

  // ⭐ NOUVEAU : bouton refresh
  const refresh = async () => {
    await forceCheckVersion();  // ⭐ force l'invalidation du cache client
    await load(true);
    toast.success("Tableau de bord actualisé");
  };

  // ⭐ État de chargement initial (skeleton)
  if (loading && !d) {
    return (
      <div data-testid="admin-dashboard-loading">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-heading text-2xl font-bold uppercase">Tableau de bord</h1>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonKpi key={i} />)}
        </div>
        <div className="mt-6 bg-white border border-border p-5 h-40 animate-pulse" />
      </div>
    );
  }

  // ⭐ État d'erreur avec retry
  if (error && !d) {
    return (
      <div data-testid="admin-dashboard-error" className="bg-red-50 border border-red-200 p-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold text-red-800 mb-1">Erreur de chargement</div>
          <div className="text-sm text-red-700 mb-3">{error}</div>
          <button
            onClick={() => load()}
            className="inline-flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase px-3 py-2"
          >
            <RefreshCw className="w-3 h-3" /> Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (!d) return null;

  const maxOrders = Math.max(1, ...d.series.map((s) => s.orders));

  return (
    <div data-testid="admin-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold uppercase">Tableau de bord</h1>
          {lastUpdated && (
            <p className="text-[11px] text-ink-muted mt-1">
              Actualisé à {lastUpdated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1 border border-border px-3 py-2 text-sm font-semibold hover:border-ink disabled:opacity-50 transition-colors"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "..." : "Rafraîchir"}
          </button>
          <Link to="/admin/products?new=1" className="inline-flex items-center gap-1 bg-brand text-white px-3 py-2 text-sm font-semibold hover:bg-brand-dark" data-testid="quick-new-product"><Plus className="w-4 h-4" /> Produit</Link>
          <Link to="/admin/promos?new=1" className="inline-flex items-center gap-1 bg-ink text-white px-3 py-2 text-sm font-semibold hover:bg-ink/90" data-testid="quick-new-promo"><Tag className="w-4 h-4" /> Code promo</Link>
        </div>
      </div>

      {!d.emails_enabled && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 mb-4">Envoi d'e-mails desactive : les confirmations de commande ne partent pas.</div>}
      {d.emails_failed > 0 && <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 mb-4">{d.emails_failed} e-mail(s) en echec. <Link to="/admin/emails" className="underline">Voir le journal</Link></div>}

      {/* Alerte : demandes d'annulation en attente */}
      {(d.pending_cancellations || 0) > 0 && (
        <div className="bg-red-50 border-2 border-red-300 text-red-800 text-sm p-4 mb-4 flex items-center justify-between gap-3 flex-wrap" data-testid="alert-pending-cancellations">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <div className="font-bold">
                {d.pending_cancellations} demande{d.pending_cancellations > 1 ? "s" : ""} d'annulation en attente
              </div>
              <div className="text-xs text-red-700">
                Un client a demande l'annulation d'une commande payee. A traiter sous 24 a 48h.
              </div>
            </div>
          </div>
          <Link
            to="/admin/orders?status=cancellation_requested"
            className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase px-4 py-2 shrink-0"
            data-testid="view-pending-cancellations"
          >
            Voir les demandes
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Package} label="A traiter" value={d.orders_to_process} color="text-brand" to="/admin/orders?status=paid" testid="kpi-a-traiter" />
        <Kpi icon={XCircle} label="Annulations" value={d.pending_cancellations || 0} color={(d.pending_cancellations || 0) > 0 ? "text-red-600" : "text-ink-muted"} to="/admin/orders?status=cancellation_requested" testid="kpi-annulations" />
        <Kpi icon={Truck} label="En livraison" value={d.orders_shipped} color="text-cyan-600" to="/admin/orders?status=shipped" testid="kpi-en-livraison" />
        <Kpi icon={Clock} label="Paiements en attente" value={d.pending_payments} color="text-amber-500" to="/admin/orders?payment_status=pending" testid="kpi-en-attente" />
        <Kpi icon={ShoppingCart} label="Commandes payees" value={d.paid_orders} color="text-green-600" to="/admin/orders?payment_status=paid" testid="kpi-payees" />
        <Kpi icon={Package} label="Produits" value={d.total_products} color="text-ink" to="/admin/products" testid="kpi-produits" />
        <Kpi icon={AlertTriangle} label="Ruptures" value={d.out_of_stock} color="text-red-500" to="/admin/products?stock=out" testid="kpi-ruptures" />
        <Kpi icon={Users} label="Clients" value={d.customers} color="text-blue-500" to="/admin/customers" testid="kpi-clients" />
        <Kpi icon={Mail} label="Codes promo actifs" value={d.promos_active} color="text-purple-500" to="/admin/promos" testid="kpi-promos" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <div className="bg-white border border-border p-5 lg:col-span-2">
          <h3 className="font-semibold uppercase text-sm mb-4">Commandes payees — 14 derniers jours</h3>
          <div className="flex items-end gap-1 h-32" data-testid="orders-chart">
            {d.series.map((s) => (
              <div key={s.date} className="flex-1 flex flex-col items-center gap-1 group" title={`${s.date}: ${s.orders} commande(s)`}>
                <div className="w-full bg-brand/80 group-hover:bg-brand transition-colors" style={{ height: `${Math.max(4, (s.orders / maxOrders) * 100)}%` }} />
                <span className="text-[9px] text-ink-muted">{s.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-border p-5">
          <h3 className="font-semibold uppercase text-sm mb-4">Chiffre d'affaires</h3>
          {Object.keys(d.revenue_by_currency).length === 0 ? <p className="text-ink-muted text-sm">Aucune vente</p> :
            Object.entries(d.revenue_by_currency).map(([cur, val]) => (
              <div key={cur} className="flex justify-between py-2 border-b border-border text-sm">
                <span>{cur} <span className="text-ink-muted text-xs">(30j: {money(d.revenue_30d[cur] || 0, cur)})</span></span>
                <span className="font-bold">{money(val, cur)}</span>
              </div>
            ))}
          <p className="text-[11px] text-ink-muted mt-3">Montants par devise d'affichage, non additionnes.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <div className="bg-white border border-border p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold uppercase text-sm">Dernieres commandes</h3>
            <Link to="/admin/orders" className="text-xs text-brand inline-flex items-center gap-1">Tout voir <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {d.recent_orders.map((o) => (
                <tr key={o.id} className="border-t border-border hover:bg-secondary/60">
                  <td className="py-2"><Link to={`/admin/orders/${o.id}`} className="font-semibold hover:text-brand" data-testid={`recent-order-${o.order_number}`}>{o.order_number}</Link></td>
                  <td className="py-2 text-ink-soft hidden sm:table-cell">{o.first_name} {o.last_name}</td>
                  <td className="py-2">{money(o.total, o.currency)}</td>
                  <td className="py-2"><span className={`text-[11px] px-2 py-0.5 ${STATUS_COLORS[o.status]}`}>{STATUS_LABELS[o.status]}</span></td>
                  <td className="py-2 text-xs text-ink-muted text-right">{fmtDate(o.created_at)}</td>
                </tr>
              ))}
              {d.recent_orders.length === 0 && <tr><td className="py-4 text-ink-muted text-center">Aucune commande</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="space-y-4">
          <div className="bg-white border border-border p-5">
            <h3 className="font-semibold uppercase text-sm mb-3">Meilleures ventes</h3>
            {d.best_sellers.map((p) => (
              <div key={p.id} className="flex justify-between py-1.5 border-b border-border text-sm">
                <span className="truncate pr-2">{p.name}</span><span className="font-bold">{p.sales}</span>
              </div>
            ))}
          </div>
          {(d.low_stock.length > 0 || d.out_of_stock_items.length > 0) && (
            <div className="bg-white border border-border p-5">
              <h3 className="font-semibold uppercase text-sm mb-3 text-amber-600">Alertes stock</h3>
              {d.out_of_stock_items.map((p) => <div key={p.id} className="flex justify-between py-1 text-sm"><span className="truncate pr-2">{p.name}</span><span className="font-bold text-red-600">0</span></div>)}
              {d.low_stock.map((p) => <div key={p.id} className="flex justify-between py-1 text-sm"><span className="truncate pr-2">{p.name}</span><span className="font-bold text-amber-600">{p.stock}</span></div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}