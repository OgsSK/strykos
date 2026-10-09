import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { money, fmtDate, STATUS_LABELS, STATUS_COLORS } from "@/lib/adminUtils";
import { Package, ShoppingCart, AlertTriangle, Clock, Truck, Users, Mail, Tag, ArrowRight, Plus } from "lucide-react";

const Kpi = ({ icon: Icon, label, value, color, to, testid }) => (
  <Link to={to || "#"} className="bg-white border border-border p-4 hover:border-ink transition-colors block">
    <div className="flex items-center justify-between">
      <span className="text-[11px] uppercase tracking-wider text-ink-muted">{label}</span>
      <Icon className={`w-4 h-4 ${color}`} />
    </div>
    <div className="text-2xl font-bold mt-1" data-testid={testid}>{value}</div>
  </Link>
);

export default function AdminDashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/admin/dashboard").then((r) => setD(r.data)).catch(() => {}); }, []);
  if (!d) return <div className="text-ink-muted">Chargement...</div>;
  const maxOrders = Math.max(1, ...d.series.map((s) => s.orders));

  return (
    <div data-testid="admin-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="font-heading text-2xl font-bold uppercase">Tableau de bord</h1>
        <div className="flex gap-2">
          <Link to="/admin/products?new=1" className="inline-flex items-center gap-1 bg-brand text-white px-3 py-2 text-sm font-semibold hover:bg-brand-dark" data-testid="quick-new-product"><Plus className="w-4 h-4" /> Produit</Link>
          <Link to="/admin/promos?new=1" className="inline-flex items-center gap-1 bg-ink text-white px-3 py-2 text-sm font-semibold hover:bg-ink/90" data-testid="quick-new-promo"><Tag className="w-4 h-4" /> Code promo</Link>
        </div>
      </div>

      {!d.emails_enabled && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 mb-4">Envoi d'e-mails desactive : les confirmations de commande ne partent pas.</div>}
      {d.emails_failed > 0 && <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 mb-4">{d.emails_failed} e-mail(s) en echec. <Link to="/admin/emails" className="underline">Voir le journal</Link></div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Package} label="A traiter" value={d.orders_to_process} color="text-brand" to="/admin/orders?status=paid" testid="kpi-a-traiter" />
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
