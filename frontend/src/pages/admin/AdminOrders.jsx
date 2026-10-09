import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { money, fmtDate, STATUSES, STATUS_LABELS, STATUS_COLORS } from "@/lib/adminUtils";
import { toast } from "sonner";
import { Search, Truck, Trash2, Eye } from "lucide-react";

export default function AdminOrders() {
  const [params, setParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [q, setQ] = useState("");
  const status = params.get("status") || "";
  const paymentStatus = params.get("payment_status") || "";

  const load = () => {
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    if (paymentStatus) sp.set("payment_status", paymentStatus);
    if (q) sp.set("q", q);
    api.get(`/admin/orders?${sp.toString()}`).then((r) => setOrders(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, [status, paymentStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = (k, v) => { const sp = new URLSearchParams(params); if (v) sp.set(k, v); else sp.delete(k); setParams(sp); };

  const updateStatus = async (id, s) => {
    try { const { data } = await api.put(`/admin/orders/${id}/status`, { status: s }); toast.success(data.email ? `Statut mis a jour · e-mail ${data.email.status}` : "Statut mis a jour"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const remove = async (o) => {
    if (!window.confirm(`Supprimer la commande ${o.order_number} ? Irreversible.`)) return;
    try { await api.delete(`/admin/orders/${o.id}`); toast.success("Commande supprimee"); load(); } catch (e) { toast.error(apiError(e)); }
  };

  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: orders.filter((o) => o.status === s).length }), {});

  return (
    <div data-testid="admin-orders">
      <h1 className="font-heading text-2xl font-bold uppercase mb-5">Commandes <span className="text-ink-muted text-base font-normal">({orders.length})</span></h1>
      <div className="flex flex-wrap gap-2 mb-4">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-2 top-3 text-ink-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="N° commande, e-mail, nom, n° de suivi..." className="pl-8" data-testid="orders-search" />
        </form>
        <select value={status} onChange={(e) => setFilter("status", e.target.value)} className="border border-border h-10 px-2 text-sm bg-white" data-testid="orders-status-filter">
          <option value="">Tous les statuts</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}{!status && counts[s] ? ` (${counts[s]})` : ""}</option>)}
        </select>
        <select value={paymentStatus} onChange={(e) => setFilter("payment_status", e.target.value)} className="border border-border h-10 px-2 text-sm bg-white" data-testid="orders-payment-filter">
          <option value="">Tous paiements</option><option value="paid">Payes</option><option value="pending">En attente</option><option value="refunded">Rembourses</option>
        </select>
      </div>

      <div className="bg-white border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3">N°</th><th className="p-3">Client</th><th className="p-3">Total</th>
              <th className="p-3">Paiement</th><th className="p-3">Statut</th><th className="p-3 hidden md:table-cell">Suivi</th><th className="p-3 hidden sm:table-cell">Date</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-border hover:bg-secondary/50" data-testid={`order-row-${o.order_number}`}>
                <td className="p-3"><Link to={`/admin/orders/${o.id}`} className="font-semibold hover:text-brand" data-testid={`order-link-${o.order_number}`}>{o.order_number}</Link>{o.promo_code && <div className="text-[10px] text-purple-700">{o.promo_code}</div>}</td>
                <td className="p-3">{o.first_name} {o.last_name}<div className="text-xs text-ink-muted">{o.email}</div></td>
                <td className="p-3 font-medium">{money(o.total, o.currency)}{o.charge_currency !== o.currency && <div className="text-[10px] text-ink-muted">{money(o.charge_total, o.charge_currency)}</div>}</td>
                <td className="p-3"><span className={`text-xs font-semibold ${o.payment_status === "paid" ? "text-green-600" : o.payment_status === "refunded" ? "text-red-600" : "text-amber-600"}`}>{o.payment_status}</span></td>
                <td className="p-3">
                  <select value={o.status} onChange={(e) => updateStatus(o.id, e.target.value)}
                    className={`border-0 px-2 py-1 text-xs font-medium ${STATUS_COLORS[o.status]}`} data-testid={`order-status-${o.order_number}`}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </td>
                <td className="p-3 hidden md:table-cell text-xs">{o.tracking_number ? <span className="inline-flex items-center gap-1 text-cyan-700"><Truck className="w-3 h-3" />{o.tracking_carrier} {o.tracking_number}</span> : <span className="text-ink-muted">-</span>}</td>
                <td className="p-3 text-xs text-ink-muted hidden sm:table-cell">{fmtDate(o.created_at, true)}</td>
                <td className="p-3">
                  <div className="flex gap-1 justify-end">
                    <Link to={`/admin/orders/${o.id}`} className="p-1.5 hover:bg-secondary" title="Detail"><Eye className="w-4 h-4" /></Link>
                    <button onClick={() => remove(o)} className="p-1.5 hover:bg-red-50 text-red-600" title="Supprimer" data-testid={`delete-order-${o.order_number}`}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-ink-muted">Aucune commande</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
