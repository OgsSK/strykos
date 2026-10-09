import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Package, ShoppingCart, AlertTriangle, Clock } from "lucide-react";

export default function AdminDashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/admin/dashboard").then((r) => setD(r.data)).catch(() => {}); }, []);
  if (!d) return <div className="text-ink-muted">Chargement...</div>;

  const Kpi = ({ icon: Icon, label, value, color }) => (
    <div className="bg-white border border-border p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-ink-muted">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="text-3xl font-bold mt-2" data-testid={`kpi-${label.toLowerCase().replace(/ /g, "-")}`}>{value}</div>
    </div>
  );

  return (
    <div data-testid="admin-dashboard">
      <h1 className="font-heading text-2xl font-bold uppercase mb-6">Tableau de bord</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={ShoppingCart} label="Commandes" value={d.total_orders} color="text-blue-500" />
        <Kpi icon={ShoppingCart} label="Payees" value={d.paid_orders} color="text-green-500" />
        <Kpi icon={Clock} label="En attente" value={d.pending_payments} color="text-amber-500" />
        <Kpi icon={Package} label="A traiter" value={d.orders_to_process} color="text-brand" />
        <Kpi icon={Package} label="Produits" value={d.total_products} color="text-ink" />
        <Kpi icon={AlertTriangle} label="Ruptures" value={d.out_of_stock} color="text-red-500" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mt-8">
        <div className="bg-white border border-border p-5">
          <h3 className="font-semibold uppercase text-sm mb-4">Chiffre d'affaires par devise</h3>
          {Object.keys(d.revenue_by_currency).length === 0 ? <p className="text-ink-muted text-sm">Aucune vente</p> :
            Object.entries(d.revenue_by_currency).map(([cur, val]) => (
              <div key={cur} className="flex justify-between py-2 border-b border-border text-sm">
                <span>{cur}</span><span className="font-bold">{val} {cur}</span>
              </div>
            ))}
          <p className="text-xs text-ink-muted mt-3">Les montants ne sont pas additionnes entre devises differentes.</p>
        </div>
        <div className="bg-white border border-border p-5">
          <h3 className="font-semibold uppercase text-sm mb-4">Meilleures ventes</h3>
          {d.best_sellers.map((p) => (
            <div key={p.id} className="flex justify-between py-2 border-b border-border text-sm">
              <span>{p.name}</span><span className="font-bold">{p.sales}</span>
            </div>
          ))}
        </div>
      </div>

      {d.low_stock.length > 0 && (
        <div className="bg-white border border-border p-5 mt-6">
          <h3 className="font-semibold uppercase text-sm mb-4 text-amber-600">Stock faible</h3>
          {d.low_stock.map((p) => <div key={p.id} className="flex justify-between py-1 text-sm"><span>{p.name}</span><span className="font-bold">{p.stock}</span></div>)}
        </div>
      )}
    </div>
  );
}
