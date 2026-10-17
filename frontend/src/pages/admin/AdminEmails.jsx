import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/adminUtils";
import { Mail, CheckCircle2, XCircle, PauseCircle, Trash2, AlertTriangle, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// ⭐ Taille de page
const PAGE_SIZE = 50;

// ⭐ Skeleton
const SkeletonRow = () => (
  <tr className="border-t border-border animate-pulse">
    {Array.from({ length: 6 }).map((_, i) => (
      <td key={i} className="p-3">
        <div className="h-4 bg-secondary rounded w-3/4" />
      </td>
    ))}
  </tr>
);

export default function AdminEmails() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // ⭐ États UI
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // ⭐ Pagination "Charger plus"
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // ⭐ load avec AbortController
  const load = useCallback(async (lim = PAGE_SIZE, opts = {}) => {
    const { isRefresh = false, silent = false } = opts;

    if (isRefresh) setRefreshing(true);
    else if (!silent) setLoading(true);
    setError(null);

    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    sp.set("limit", lim);
    sp.set("offset", 0);

    const controller = new AbortController();
    try {
      const { data: res } = await api.get(`/admin/emails?${sp.toString()}`, { signal: controller.signal });
      const items = res.items || [];
      setData({
        enabled: res.enabled,
        from_name: res.from_name,
        reply_to: res.reply_to,
        admin_notify: res.admin_notify,
        logs: items, // ⭐ pour compat avec le JSX existant
      });
      setTotal(res.total || 0);
      setHasMore(items.length >= lim && items.length < (res.total || 0));
      setLastUpdated(new Date());
    } catch (e) {
      if (e.name === "CanceledError" || e.name === "AbortError" || e.code === "ERR_CANCELED") return;
      setError(e?.response?.data?.detail || e.message || "Erreur de chargement");
      if (!silent) toast.error("Impossible de charger les e-mails");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
    return () => controller.abort();
  }, [status]);

  // ⭐ Rechargement quand le filtre change
  useEffect(() => {
    setLimit(PAGE_SIZE);
    let cleanup;
    load(PAGE_SIZE).then((c) => { cleanup = c; });
    return () => cleanup?.();
  }, [load]);

  // ⭐ Charger plus
  const loadMore = () => {
    setLoadingMore(true);
    const newLimit = limit + PAGE_SIZE;
    setLimit(newLimit);
    load(newLimit, { silent: true });
  };

  // ⭐ Refresh manuel
  const refresh = async () => {
    await load(limit, { isRefresh: true });
    toast.success("E-mails actualisés");
  };

  const deleteOne = async (id) => {
    if (!window.confirm("Supprimer cet e-mail de l'historique ?")) return;
    try {
      await api.delete(`/admin/emails/${id}`);
      toast.success("E-mail supprimé");
      await load(limit, { silent: true });
    } catch { toast.error("Suppression impossible"); }
  };

  const clearAll = async () => {
    setDeleting(true);
    try {
      const q = status ? `?status=${status}` : "";
      const { data: res } = await api.delete(`/admin/emails${q}`);
      toast.success(`${res.deleted} e-mail(s) supprimé(s)`);
      setConfirmClear(false);
      // Reset pagination après clear (tout a été supprimé)
      setLimit(PAGE_SIZE);
      await load(PAGE_SIZE, { silent: true });
    } catch { toast.error("Suppression impossible"); }
    setDeleting(false);
  };

  const Icon = { sent: CheckCircle2, failed: XCircle, disabled: PauseCircle };
  const color = { sent: "text-green-600", failed: "text-red-600", disabled: "text-ink-muted" };

  // ⭐ Skeleton initial
  if (loading && !data) {
    return (
      <div data-testid="admin-emails-loading">
        <div className="flex items-center justify-between mb-5">
          <h1 className="font-heading text-2xl font-bold uppercase">E-mails transactionnels</h1>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mb-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white border border-border p-4 animate-pulse">
              <div className="h-3 w-16 bg-secondary rounded mb-2" />
              <div className="h-5 w-24 bg-secondary rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Destinataire</th>
                <th className="p-3">Sujet</th>
                <th className="p-3">Modele</th>
                <th className="p-3">Statut</th>
                <th className="p-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ⭐ Erreur avec retry
  if (error && !data) {
    return (
      <div data-testid="admin-emails-error" className="bg-red-50 border border-red-200 p-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold text-red-800 mb-1">Erreur de chargement</div>
          <div className="text-sm text-red-700 mb-3">{error}</div>
          <button
            onClick={() => load(PAGE_SIZE)}
            className="inline-flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase px-3 py-2"
          >
            <RefreshCw className="w-3 h-3" /> Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div data-testid="admin-emails">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-heading text-2xl font-bold uppercase">E-mails transactionnels</h1>
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
            title="Recharger"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "..." : "Rafraîchir"}
          </button>
          <button
            onClick={() => setConfirmClear(true)}
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wide px-4 py-2"
            data-testid="emails-clear-btn"
          >
            <Trash2 className="w-4 h-4" /> Vider l'historique
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-5 text-sm">
        <div className="bg-white border border-border p-4">
          <div className="text-[11px] uppercase text-ink-muted">Etat</div>
          <div className={`font-bold ${data.enabled ? "text-green-600" : "text-red-600"}`} data-testid="emails-enabled">
            {data.enabled ? "Actif" : "Desactive"}
          </div>
        </div>
        <div className="bg-white border border-border p-4">
          <div className="text-[11px] uppercase text-ink-muted">Expediteur affiche</div>
          <div className="font-bold">{data.from_name}</div>
          <div className="text-xs text-ink-muted">Reponses vers {data.reply_to}</div>
        </div>
        <div className="bg-white border border-border p-4">
          <div className="text-[11px] uppercase text-ink-muted">Notification admin</div>
          <div className="font-bold">{data.admin_notify || "-"}</div>
        </div>
      </div>

      <p className="text-xs text-ink-muted mb-4">
        Envoyes automatiquement : confirmation de paiement (client + copie admin), expedition avec suivi, livraison, annulation/remboursement.
        Langue = celle choisie par le client lors de la commande.
      </p>

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        {["", "sent", "failed", "disabled"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`text-xs px-3 py-1 border ${status === s ? "bg-ink text-white border-ink" : "border-border hover:bg-secondary"}`}
          >
            {s || "Tous"}
          </button>
        ))}
        <span className="text-xs text-ink-muted ml-2">
          {data.logs.length}{hasMore ? "+" : ""}{total > 0 && !hasMore ? ` / ${total}` : ""} e-mail(s)
        </span>
        {error && (
          <span className="text-xs text-red-600 inline-flex items-center gap-1 ml-2">
            <AlertCircle className="w-3 h-3" /> {error}
          </span>
        )}
      </div>

      <div className="bg-white border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Destinataire</th>
              <th className="p-3">Sujet</th>
              <th className="p-3">Modele</th>
              <th className="p-3">Statut</th>
              <th className="p-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {data.logs.map((e) => {
              const I = Icon[e.status] || Mail;
              return (
                <tr key={e.id} className="border-t border-border hover:bg-secondary/40" data-testid={`email-log-${e.id}`}>
                  <td className="p-3 text-xs text-ink-muted whitespace-nowrap">{fmtDate(e.created_at, true)}</td>
                  <td className="p-3">{e.to_email}</td>
                  <td className="p-3">
                    {e.subject}
                    {e.order_id && (
                      <Link to={`/admin/orders/${e.order_id}`} className="ml-2 text-xs text-brand underline">commande</Link>
                    )}
                  </td>
                  <td className="p-3 text-xs">{e.template}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 text-xs ${color[e.status]}`} title={e.error}>
                      <I className="w-3.5 h-3.5" />{e.status}
                    </span>
                    {e.error && <div className="text-[10px] text-red-600 max-w-xs truncate">{e.error}</div>}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => deleteOne(e.id)}
                      className="text-ink-muted hover:text-red-600 transition-colors"
                      title="Supprimer"
                      data-testid={`email-delete-${e.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {data.logs.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink-muted">
                  {status ? `Aucun e-mail avec le statut "${status}"` : "Aucun e-mail"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ⭐ Bouton "Charger plus" */}
      {hasMore && (
        <div className="text-center mt-4 p-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="bg-ink text-white px-6 py-2 text-xs font-bold uppercase hover:bg-ink/90 disabled:opacity-50 transition-colors"
            data-testid="load-more-emails"
          >
            {loadingMore ? "Chargement…" : `Charger plus d'e-mails (${data.logs.length} / ${total})`}
          </button>
        </div>
      )}
      {!hasMore && data.logs.length >= PAGE_SIZE && (
        <div className="text-center mt-4 p-4 text-xs text-ink-muted">
          Tous les e-mails sont chargés ({data.logs.length})
        </div>
      )}

      {/* Modale : Vider l'historique */}
      {confirmClear && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setConfirmClear(false)}>
          <div className="bg-white max-w-md w-full p-6 border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
              <div>
                <h3 className="font-bold text-lg mb-1">Vider l'historique ?</h3>
                <p className="text-sm text-ink-soft">
                  Tu es sur le point de supprimer <strong>{total} e-mail(s)</strong>
                  {status ? ` avec le statut "${status}"` : ""}. Cette action est irréversible.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmClear(false)}
                className="px-4 py-2 border border-border text-xs font-bold uppercase hover:bg-secondary"
                disabled={deleting}
              >
                Annuler
              </button>
              <button
                onClick={clearAll}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase disabled:opacity-50"
                data-testid="emails-clear-confirm"
              >
                {deleting ? "Suppression..." : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}