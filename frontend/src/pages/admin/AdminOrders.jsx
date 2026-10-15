import React, { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { money, fmtDate, STATUSES, STATUS_LABELS, STATUS_COLORS, downloadCsv } from "@/lib/adminUtils";
import { toast } from "sonner";
import { Search, Truck, Trash2, Eye, Download, X, RotateCcw, XCircle, Package, Send, CheckCircle2, PackageCheck, KeyRound } from "lucide-react";

// Groupes de statuts pour la barre d'accès rapides
const QUICK_FILTERS = [
  { key: "to_process",   label_fr: "À traiter",   label_en: "To process",   statuses: "paid,preparing",                                    icon: Package,      color: "text-brand" },
  { key: "in_transit",   label_fr: "En transit",  label_en: "In transit",   statuses: "shipped,in_transit",                                icon: Send,         color: "text-cyan-600" },
  { key: "returns",      label_fr: "Retours",     label_en: "Returns",      statuses: "return_requested,return_approved,return_shipped,return_received", icon: RotateCcw, color: "text-orange-600" },
  { key: "cancellations",label_fr: "Annulations", label_en: "Cancellations",statuses: "cancellation_requested",                            icon: XCircle,      color: "text-red-600" },
  { key: "delivered",    label_fr: "Livrées",     label_en: "Delivered",    statuses: "delivered",                                         icon: CheckCircle2, color: "text-green-600" },
  { key: "completed",    label_fr: "Terminées",   label_en: "Completed",    statuses: "returned,refunded,cancelled,exchange_sent",         icon: PackageCheck, color: "text-gray-600" },
];

export default function AdminOrders() {
  const [params, setParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [counts, setCounts] = useState(null);
  const [q, setQ] = useState(params.get("q") || "");
  // ⭐ Filtre "Créneau programmé" (client-side, appliqué sur les résultats déjà chargés)
  const [schedFilter, setSchedFilter] = useState("all");

  const status = params.get("status") || "";
  const paymentStatus = params.get("payment_status") || "";
  const country = params.get("country") || "";
  const period = params.get("period") || "all";
  const sort = params.get("sort") || "recent";

  // Detecte si on est sur un acces rapide (comparaison avec les groupes)
  const activeQuick = QUICK_FILTERS.find((f) => f.statuses === status);

  const load = () => {
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    if (paymentStatus) sp.set("payment_status", paymentStatus);
    if (country) sp.set("country", country);
    if (period && period !== "all") sp.set("period", period);
    if (sort && sort !== "recent") sp.set("sort", sort);
    if (q) sp.set("q", q);
    api.get(`/admin/orders?${sp.toString()}`).then((r) => setOrders(r.data)).catch(() => {});
  };

  const loadCounts = () => {
    api.get("/admin/orders/counts").then((r) => setCounts(r.data)).catch(() => {});
  };

  useEffect(() => { load(); }, [status, paymentStatus, country, period, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadCounts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = (k, v) => {
    const sp = new URLSearchParams(params);
    if (v) sp.set(k, v); else sp.delete(k);
    setParams(sp);
  };

  const toggleQuick = (qf) => {
    if (status === qf.statuses) {
      setFilter("status", "");
    } else {
      setFilter("status", qf.statuses);
    }
  };

  const clearAllFilters = () => {
    setParams(new URLSearchParams());
    setQ("");
    setSchedFilter("all");
  };

  const hasActiveFilters = !!(status || paymentStatus || country || (period && period !== "all") || (sort && sort !== "recent") || q || schedFilter !== "all");

  // ⭐ Filtrage "Créneau programmé" (client-side, appliqué sur les résultats)
  const filteredOrders = useMemo(() => {
    if (schedFilter === "all") return orders;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return orders.filter((o) => {
      // Les 3 filtres "scheduled" ne concernent que les commandes avec date
      if (!o.scheduled_date) return false;
      const target = new Date(o.scheduled_date); target.setHours(0, 0, 0, 0);
      const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));
      if (schedFilter === "today") return diff === 0;
      if (schedFilter === "week") return diff >= 0 && diff <= 7;
      if (schedFilter === "overdue") return diff < 0;
      return true;
    });
  }, [orders, schedFilter]);

  const updateStatus = async (id, s) => {
    try {
      const { data } = await api.put(`/admin/orders/${id}/status`, { status: s });
      toast.success(data.email ? `Statut mis à jour · e-mail ${data.email.status}` : "Statut mis à jour");
      load();
      loadCounts();
    } catch (e) { toast.error(apiError(e)); }
  };
  const remove = async (o) => {
    if (!window.confirm(`Supprimer la commande ${o.order_number} ? Irréversible.`)) return;
    try { await api.delete(`/admin/orders/${o.id}`); toast.success("Commande supprimée"); load(); loadCounts(); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div data-testid="admin-orders">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="font-heading text-2xl font-bold uppercase">
          Commandes <span className="text-ink-muted text-base font-normal">({filteredOrders.length})</span>
        </h1>
        <div className="flex gap-2 items-center">
          {hasActiveFilters && (
            <button onClick={clearAllFilters} className="text-xs text-ink-muted hover:text-brand inline-flex items-center gap-1 border border-border px-2 py-1">
              <X className="w-3 h-3" /> Effacer filtres
            </button>
          )}
          <button onClick={() => {
            const sp = new URLSearchParams();
            if (status) sp.set("status", status);
            if (paymentStatus) sp.set("payment_status", paymentStatus);
            downloadCsv(`/admin/export/orders.csv?${sp}`, "strykos-commandes.csv").catch(() => toast.error("Export impossible"));
          }} className="inline-flex items-center gap-1 border border-ink px-3 py-2 text-sm font-semibold hover:bg-ink hover:text-white transition-colors" data-testid="export-orders-csv">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Barre d'accès rapides */}
      <div className="flex flex-wrap gap-2 mb-4">
        {QUICK_FILTERS.map((qf) => {
          const Icon = qf.icon;
          const count = counts?.[qf.key] || 0;
          const isActive = activeQuick?.key === qf.key;
          return (
            <button
              key={qf.key}
              onClick={() => toggleQuick(qf)}
              className={`inline-flex items-center gap-2 px-3 py-2 border text-xs font-semibold uppercase tracking-wide transition-colors ${
                isActive ? "bg-ink text-white border-ink" : "bg-white border-border hover:border-ink"
              }`}
              data-testid={`quick-${qf.key}`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : qf.color}`} />
              {qf.label_fr}
              <span className={`text-[11px] px-1.5 py-0.5 ${isActive ? "bg-white/20 text-white" : count > 0 ? "bg-brand text-white" : "bg-secondary text-ink-muted"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filtres avancés */}
      <div className="flex flex-wrap gap-2 mb-4">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-2 top-3 text-ink-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="N° commande, e-mail, nom, n° de suivi..." className="pl-8" data-testid="orders-search" />
        </form>

        <select value={status.includes(",") ? "" : status} onChange={(e) => setFilter("status", e.target.value)}
          className="border border-border h-10 px-2 text-sm bg-white" data-testid="orders-status-filter">
          <option value="">Tous les statuts</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>

        <select value={paymentStatus} onChange={(e) => setFilter("payment_status", e.target.value)}
          className="border border-border h-10 px-2 text-sm bg-white" data-testid="orders-payment-filter">
          <option value="">Tous paiements</option>
          <option value="paid">Payés</option>
          <option value="pending">En attente</option>
          <option value="refunded">Remboursés</option>
        </select>

        <select value={country} onChange={(e) => setFilter("country", e.target.value)}
          className="border border-border h-10 px-2 text-sm bg-white" data-testid="orders-country-filter">
          <option value="">Tous pays</option>
          <option value="BE">Belgique</option>
          <option value="ML">Mali</option>
          <option value="FR">France</option>
          <option value="SN">Sénégal</option>
          <option value="CI">Côte d'Ivoire</option>
        </select>

        <select value={period} onChange={(e) => setFilter("period", e.target.value)}
          className="border border-border h-10 px-2 text-sm bg-white" data-testid="orders-period-filter">
          <option value="all">Toute période</option>
          <option value="7d">7 derniers jours</option>
          <option value="30d">30 derniers jours</option>
          <option value="90d">90 derniers jours</option>
        </select>

        {/* ⭐ NOUVEAU : filtre "Créneau programmé" */}
        <select
          value={schedFilter}
          onChange={(e) => setSchedFilter(e.target.value)}
          className="border border-border h-10 px-2 text-sm bg-white"
          data-testid="orders-scheduled-filter"
        >
          <option value="all">Tous les créneaux</option>
          <option value="today">📅 Aujourd'hui</option>
          <option value="week">📅 Cette semaine</option>
          <option value="overdue">⚠️ En retard</option>
        </select>

        <select value={sort} onChange={(e) => setFilter("sort", e.target.value)}
          className="border border-border h-10 px-2 text-sm bg-white" data-testid="orders-sort">
          <option value="recent">Plus récentes</option>
          <option value="oldest">Plus anciennes</option>
          <option value="amount_desc">Montant ↓</option>
          <option value="amount_asc">Montant ↑</option>
          <option value="scheduled">📅 Date prévue</option>
        </select>
      </div>

      {/* Bandeau : filtre actif */}
      {activeQuick && (
        <div className="mb-3 border border-ink/20 bg-secondary/60 px-4 py-2 text-xs flex items-center justify-between">
          <span>
            <strong>Filtre actif : </strong>
            {activeQuick.label_fr} ({status.split(",").length} statut{status.split(",").length > 1 ? "s" : ""})
          </span>
          <button onClick={() => setFilter("status", "")} className="text-brand font-semibold hover:underline">
            Retirer
          </button>
        </div>
      )}

      {/* Bandeau : filtre programmé actif */}
      {schedFilter !== "all" && (
        <div className="mb-3 border border-blue-200 bg-blue-50 px-4 py-2 text-xs flex items-center justify-between">
          <span className="text-blue-800">
            <strong>Filtre programmé : </strong>
            {schedFilter === "today" && "📅 Aujourd'hui"}
            {schedFilter === "week" && "📅 Cette semaine"}
            {schedFilter === "overdue" && "⚠️ En retard"}
            {" "}· {filteredOrders.length} commande{filteredOrders.length > 1 ? "s" : ""}
          </span>
          <button onClick={() => setSchedFilter("all")} className="text-blue-700 font-semibold hover:underline">
            Retirer
          </button>
        </div>
      )}

      <div className="bg-white border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3">N°</th>
              <th className="p-3">Client</th>
              <th className="p-3">Total</th>
              {/* ⭐ NOUVEAU : colonne "Prévu" */}
              <th className="p-3 hidden md:table-cell">Prévu</th>
              <th className="p-3">Paiement</th>
              <th className="p-3">Statut</th>
              <th className="p-3 hidden md:table-cell">Suivi</th>
              <th className="p-3 hidden sm:table-cell">Date</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((o) => {
              const isReturn = o.status?.startsWith("return_");
              const isCancellation = o.status === "cancellation_requested";
              const rowHighlight = isReturn ? "border-l-4 border-l-orange-400" : isCancellation ? "border-l-4 border-l-red-500" : "";
              return (
                <tr key={o.id} className={`border-t border-border hover:bg-secondary/50 ${rowHighlight}`} data-testid={`order-row-${o.order_number}`}>
                  <td className="p-3">
                    <Link to={`/admin/orders/${o.id}`} className="font-semibold hover:text-brand" data-testid={`order-link-${o.order_number}`}>
                      {o.order_number}
                    </Link>
                    {/* ⭐ NOUVEAU : pastille OTP actif */}
                    {o.delivery_otp && ["shipped", "in_transit"].includes(o.status) && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider bg-purple-100 text-purple-800 px-1.5 py-0.5">
                        <KeyRound className="w-3 h-3" /> OTP
                      </span>
                    )}
                    {o.promo_code && <div className="text-[10px] text-purple-700">{o.promo_code}</div>}
                    {isReturn && (
                      <div className="text-[10px] text-orange-700 font-semibold mt-0.5 inline-flex items-center gap-1">
                        <RotateCcw className="w-2.5 h-2.5" /> {o.return_rma_code || "Retour"}
                      </div>
                    )}
                    {isCancellation && (
                      <div className="text-[10px] text-red-700 font-semibold mt-0.5 inline-flex items-center gap-1">
                        <XCircle className="w-2.5 h-2.5" /> Annulation demandée
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    {o.first_name} {o.last_name}
                    <div className="text-xs text-ink-muted">{o.email}</div>
                    {o.shipping_address?.country && (
                      <div className="text-[10px] text-ink-muted uppercase tracking-wide mt-0.5">{o.shipping_address.country}</div>
                    )}
                  </td>
                  <td className="p-3 font-medium">
                    {money(o.total, o.currency)}
                    {o.charge_currency !== o.currency && <div className="text-[10px] text-ink-muted">{money(o.charge_total, o.charge_currency)}</div>}
                  </td>

                  {/* ⭐ NOUVEAU : cellule "Prévu" */}
                  <td className="p-3 hidden md:table-cell text-sm whitespace-nowrap">
                    {o.scheduled_date ? (
                      (() => {
                        const today = new Date(); today.setHours(0, 0, 0, 0);
                        const target = new Date(o.scheduled_date); target.setHours(0, 0, 0, 0);
                        const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));
                        const dateStr = target.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
                        const slot = o.scheduled_time_slot || "";
                        const slotSuffix = slot ? ` · ${slot}` : "";
                        if (diff < 0) return <span className="text-red-600 font-semibold">⚠️ {dateStr}{slotSuffix}</span>;
                        if (diff === 0) return <span className="bg-amber-100 text-amber-800 px-2 py-0.5 font-semibold">🔔 {dateStr}{slotSuffix}</span>;
                        if (diff === 1) return <span className="text-orange-600 font-semibold">Demain {dateStr}{slotSuffix}</span>;
                        return <span className="text-ink-soft">{dateStr}{slotSuffix}</span>;
                      })()
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>

                  <td className="p-3">
                    <span className={`text-xs font-semibold ${o.payment_status === "paid" ? "text-green-600" : o.payment_status === "refunded" ? "text-red-600" : "text-amber-600"}`}>
                      {o.payment_status}
                    </span>
                  </td>
                  <td className="p-3">
                    <select value={o.status} onChange={(e) => updateStatus(o.id, e.target.value)}
                      className={`border-0 px-2 py-1 text-xs font-medium ${STATUS_COLORS[o.status] || "bg-secondary"}`}
                      data-testid={`order-status-${o.order_number}`}>
                      {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </td>
                  <td className="p-3 hidden md:table-cell text-xs">
                    {o.tracking_number
                      ? <span className="inline-flex items-center gap-1 text-cyan-700"><Truck className="w-3 h-3" />{o.tracking_carrier} {o.tracking_number}</span>
                      : <span className="text-ink-muted">-</span>}
                  </td>
                  <td className="p-3 text-xs text-ink-muted hidden sm:table-cell">{fmtDate(o.created_at, true)}</td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-end">
                      <Link to={`/admin/orders/${o.id}`} className="p-1.5 hover:bg-secondary" title="Détail"><Eye className="w-4 h-4" /></Link>
                      <button onClick={() => remove(o)} className="p-1.5 hover:bg-red-50 text-red-600" title="Supprimer" data-testid={`delete-order-${o.order_number}`}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredOrders.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-ink-muted">Aucune commande</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}