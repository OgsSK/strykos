import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";

const STATUSES = ["pending_payment", "paid", "preparing", "shipped", "in_transit", "delivered", "cancelled", "return_requested", "returned", "refunded"];

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const load = () => api.get("/admin/orders").then((r) => setOrders(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const money = (v, cur) => cur === "XOF" ? `${Math.round(v).toLocaleString("fr-FR")} FCFA` : cur === "USD" ? `$${v.toFixed(2)}` : `${v.toFixed(2)} €`;

  const updateStatus = async (id, status) => {
    try { await api.put(`/admin/orders/${id}/status`, { status }); toast.success("Statut mis a jour"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div data-testid="admin-orders">
      <h1 className="font-heading text-2xl font-bold uppercase mb-6">Commandes</h1>
      <div className="bg-white border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3">N°</th><th className="p-3">Client</th><th className="p-3">Total</th>
              <th className="p-3">Paiement</th><th className="p-3">Statut</th><th className="p-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-border" data-testid={`order-row-${o.order_number}`}>
                <td className="p-3 font-semibold">{o.order_number}</td>
                <td className="p-3">{o.first_name} {o.last_name}<div className="text-xs text-ink-muted">{o.email}</div></td>
                <td className="p-3">{money(o.total, o.currency)}</td>
                <td className="p-3"><span className={o.payment_status === "paid" ? "text-green-600" : "text-amber-600"}>{o.payment_status}</span></td>
                <td className="p-3">
                  <select value={o.status} onChange={(e) => updateStatus(o.id, e.target.value)}
                    className="border border-border px-2 py-1 text-xs" data-testid={`order-status-${o.order_number}`}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="p-3 text-xs text-ink-muted">{new Date(o.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-ink-muted">Aucune commande</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
