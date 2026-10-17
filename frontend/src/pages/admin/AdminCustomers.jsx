import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { money, fmtDate, STATUS_LABELS, STATUS_COLORS } from "@/lib/adminUtils";
import { toast } from "sonner";
import { Search, ArrowLeft, Trash2, ShieldCheck } from "lucide-react";

// ⭐ Taille de page (batch size)
const PAGE_SIZE = 20;

export function AdminCustomerDetail() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  useEffect(() => { api.get(`/admin/customers/${id}`).then((r) => setC(r.data)).catch(() => toast.error("Client introuvable")); }, [id]);
  if (!c) return <div className="text-ink-muted">Chargement...</div>;
  return (
    <div data-testid="admin-customer-detail">
      <Link to="/admin/customers" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink mb-3"><ArrowLeft className="w-4 h-4" /> Clients</Link>
      <h1 className="font-heading text-2xl font-bold uppercase">{c.first_name} {c.last_name}</h1>
      <div className="text-sm text-ink-muted mb-5">{c.email} · {c.phone || "-"} · {c.role} · inscrit le {fmtDate(c.created_at)}</div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-border p-5">
          <h3 className="font-semibold uppercase text-sm mb-3">Commandes ({c.orders.length})</h3>
          {c.orders.map((o) => (
            <div key={o.id} className="flex justify-between items-center py-2 border-b border-border text-sm">
              <Link to={`/admin/orders/${o.id}`} className="font-semibold hover:text-brand">{o.order_number}</Link>
              <span className="text-xs text-ink-muted">{fmtDate(o.created_at)}</span>
              <span className={`text-[11px] px-2 py-0.5 ${STATUS_COLORS[o.status]}`}>{STATUS_LABELS[o.status]}</span>
              <span className="font-medium">{money(o.total, o.currency)}</span>
            </div>
          ))}
          {c.orders.length === 0 && <p className="text-sm text-ink-muted">Aucune commande</p>}
        </div>
        <div className="bg-white border border-border p-5 text-sm">
          <h3 className="font-semibold uppercase text-sm mb-3">Adresses</h3>
          {c.addresses.map((a) => <div key={a.id} className="py-2 border-b border-border"><div className="font-medium">{a.first_name} {a.last_name}</div><div className="text-ink-soft">{a.address_line}, {a.postal_code} {a.city}, {a.country}</div></div>)}
          {c.addresses.length === 0 && <p className="text-ink-muted">Aucune adresse</p>}
        </div>
      </div>
    </div>
  );
}


export default function AdminCustomers() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");                    // input
  const [appliedQ, setAppliedQ] = useState("");      // ⭐ valeur envoyée au serveur

  // ⭐ NOUVEAU : pagination "Charger plus"
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // ⭐ load() accepte une limite explicite
  const load = (lim = limit) => {
    const sp = new URLSearchParams();
    if (appliedQ) sp.set("q", appliedQ);
    sp.set("limit", lim);
    sp.set("offset", 0);

    api.get(`/admin/customers?${sp.toString()}`)
      .then((r) => {
        const items = r.data.items || [];
        setList(items);
        setTotal(r.data.total || 0);
        setHasMore(items.length >= lim && items.length < (r.data.total || 0));
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  };

  // ⭐ Rechargement quand la recherche validée change
  useEffect(() => {
    setLimit(PAGE_SIZE);
    load(PAGE_SIZE);
  }, [appliedQ]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⭐ NOUVEAU : charger 20 de plus
  const loadMore = () => {
    setLoadingMore(true);
    const newLimit = limit + PAGE_SIZE;
    setLimit(newLimit);
    load(newLimit);
  };

  const submitSearch = (e) => {
    e.preventDefault();
    setAppliedQ(q.trim());
  };

  const clearSearch = () => {
    setQ("");
    setAppliedQ("");
  };

  const setRole = async (u, role) => {
    try {
      await api.put(`/admin/customers/${u.id}/role`, { role });
      toast.success("Role mis a jour");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const remove = async (u) => {
    if (!window.confirm(`Supprimer le compte ${u.email} ? Ses commandes resteront archivees sans compte.`)) return;
    try {
      await api.delete(`/admin/customers/${u.id}`);
      toast.success("Compte supprime");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div data-testid="admin-customers">
      <h1 className="font-heading text-2xl font-bold uppercase mb-5">
        Clients{" "}
        <span className="text-ink-muted text-base font-normal">
          ({list.length}{hasMore ? "+" : ""}{total > 0 && !hasMore ? ` / ${total}` : ""})
        </span>
      </h1>

      <div className="flex flex-wrap gap-2 mb-4">
        <form onSubmit={submitSearch} className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-2 top-3 text-ink-muted" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher e-mail, nom... (Entrée)"
            className="pl-8"
            data-testid="customers-search"
          />
        </form>
        {appliedQ && (
          <button
            onClick={clearSearch}
            className="text-xs text-ink-muted hover:text-brand border border-border px-3 py-1"
          >
            Effacer recherche
          </button>
        )}
      </div>

      {appliedQ && (
        <div className="mb-3 border border-ink/20 bg-secondary/60 px-4 py-2 text-xs">
          <strong>Recherche : </strong>« {appliedQ} » · {total} résultat{total > 1 ? "s" : ""}
        </div>
      )}

      <div className="bg-white border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3">Client</th>
              <th className="p-3">Telephone</th>
              <th className="p-3">Commandes</th>
              <th className="p-3">Total payé (FCFA)</th>
              <th className="p-3">Role</th>
              <th className="p-3">Inscrit</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-t border-border hover:bg-secondary/50" data-testid={`customer-row-${u.email}`}>
                <td className="p-3">
                  <Link to={`/admin/customers/${u.id}`} className="font-medium hover:text-brand">
                    {u.first_name} {u.last_name}
                  </Link>
                  <div className="text-xs text-ink-muted">{u.email}</div>
                </td>
                <td className="p-3">{u.phone || "-"}</td>
                <td className="p-3">{u.orders_count}</td>
                <td className="p-3 font-semibold">
                  {(() => {
                    const xof = Math.round((u.spent_eur || 0) * 655.957);
                    return `${xof.toLocaleString("fr-FR")} FCFA`;
                  })()}
                </td>
                <td className="p-3">
                  <select
                    value={u.role}
                    onChange={(e) => setRole(u, e.target.value)}
                    className={`text-xs border border-border px-2 py-1 ${u.role === "admin" ? "text-brand font-semibold" : ""}`}
                  >
                    <option value="customer">client</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="p-3 text-xs text-ink-muted">{fmtDate(u.created_at)}</td>
                <td className="p-3">
                  <div className="flex gap-1 justify-end">
                    {u.role === "admin" && <ShieldCheck className="w-4 h-4 text-brand" />}
                    <button onClick={() => remove(u)} className="p-1.5 hover:bg-red-50 text-red-600" title="Supprimer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-ink-muted">
                  {appliedQ ? "Aucun client ne correspond à cette recherche" : "Aucun client"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ⭐ NOUVEAU : bouton "Charger plus" */}
      {hasMore && (
        <div className="text-center mt-4 p-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="bg-ink text-white px-6 py-2 text-xs font-bold uppercase hover:bg-ink/90 disabled:opacity-50 transition-colors"
            data-testid="load-more-customers"
          >
            {loadingMore ? "Chargement…" : `Charger plus de clients (${list.length} / ${total})`}
          </button>
        </div>
      )}
      {!hasMore && list.length >= PAGE_SIZE && (
        <div className="text-center mt-4 p-4 text-xs text-ink-muted">
          Tous les clients sont chargés ({list.length})
        </div>
      )}
    </div>
  );
}