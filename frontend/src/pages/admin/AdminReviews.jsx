import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { Stars } from "@/components/Stars";
import { fmtDate, mediaSrc } from "@/lib/adminUtils";
import { toast } from "sonner";
import { Trash2, Eye, EyeOff, BadgeCheck, MessageSquare, RefreshCw, AlertCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// ⭐ Taille de page (batch size)
const PAGE_SIZE = 20;

// ⭐ Skeleton de chargement
const SkeletonReview = () => (
  <div className="bg-white border border-border p-4 animate-pulse">
    <div className="flex justify-between mb-2">
      <div className="h-4 w-32 bg-secondary rounded" />
      <div className="h-4 w-16 bg-secondary rounded" />
    </div>
    <div className="h-4 w-48 bg-secondary rounded mb-2" />
    <div className="h-3 w-full bg-secondary rounded mb-1" />
    <div className="h-3 w-3/4 bg-secondary rounded" />
  </div>
);

export default function AdminReviews() {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState("");  // "" | "true" | "false"

  // ⭐ États UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // ⭐ Pagination "Charger plus"
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // ⭐ Reply state
  const [replying, setReplying] = useState(null);
  const [replyText, setReplyText] = useState("");

  // ⭐ load avec filtre serveur + pagination
  const load = useCallback(async (lim = PAGE_SIZE, opts = {}) => {
    const { isRefresh = false, silent = false } = opts;

    if (isRefresh) setRefreshing(true);
    else if (!silent) setLoading(true);
    setError(null);

    const sp = new URLSearchParams();
    if (filter !== "") sp.set("approved", filter);
    sp.set("limit", lim);
    sp.set("offset", 0);

    try {
      const { data } = await api.get(`/admin/reviews?${sp.toString()}`);
      const items = data.items || [];
      setList(items);
      setTotal(data.total || 0);
      setHasMore(items.length >= lim && items.length < (data.total || 0));
    } catch (e) {
      if (e.name === "CanceledError" || e.name === "AbortError" || e.code === "ERR_CANCELED") return;
      setError(e?.response?.data?.detail || e.message || "Erreur de chargement");
      if (!silent) toast.error("Impossible de charger les avis");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [filter]);

  // ⭐ Rechargement quand le filtre change
  useEffect(() => {
    setLimit(PAGE_SIZE);
    load(PAGE_SIZE);
  }, [filter, load]);

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
    toast.success("Avis actualisés");
  };

  // ⭐ Sauvegarde réponse (silent reload pour ne pas perdre la pagination)
  const saveReply = async (r, text = replyText) => {
    try {
      await api.put(`/admin/reviews/${r.id}/reply`, { reply: text });
      toast.success(text ? "Reponse publiee" : "Reponse supprimee");
      setReplying(null);
      await load(limit, { silent: true });
    } catch (e) { toast.error(apiError(e)); }
  };

  const toggle = async (r) => {
    try {
      await api.put(`/admin/reviews/${r.id}/approve`, { approved: !r.approved });
      await load(limit, { silent: true });
    } catch (e) { toast.error(apiError(e)); }
  };

  const remove = async (r) => {
    if (!window.confirm("Supprimer cet avis ?")) return;
    try {
      await api.delete(`/admin/reviews/${r.id}`);
      toast.success("Avis supprime");
      await load(limit, { silent: true });
    } catch (e) { toast.error(apiError(e)); }
  };

  // ⭐ Loading skeleton initial
  if (loading && list.length === 0) {
    return (
      <div data-testid="admin-reviews-loading">
        <div className="flex items-center justify-between mb-5">
          <h1 className="font-heading text-2xl font-bold uppercase">Avis clients</h1>
        </div>
        <div className="flex gap-2 mb-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 w-24 bg-secondary rounded animate-pulse" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonReview key={i} />)}
        </div>
      </div>
    );
  }

  // ⭐ Erreur avec retry
  if (error && list.length === 0) {
    return (
      <div data-testid="admin-reviews-error" className="bg-red-50 border border-red-200 p-6 flex items-start gap-3">
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

  return (
    <div data-testid="admin-reviews">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="font-heading text-2xl font-bold uppercase">
          Avis clients{" "}
          <span className="text-ink-muted text-base font-normal">
            ({list.length}{hasMore ? "+" : ""}{total > 0 && !hasMore ? ` / ${total}` : ""})
          </span>
        </h1>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1 border border-border px-3 py-2 text-sm font-semibold hover:border-ink disabled:opacity-50 transition-colors"
          title="Recharger"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "..." : "Rafraîchir"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {[["", "Tous"], ["true", "Publies"], ["false", "Masques"]].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={`text-xs px-3 py-1 border ${filter === v ? "bg-ink text-white border-ink" : "border-border hover:bg-secondary"}`}
          >
            {l}
          </button>
        ))}
        {error && (
          <span className="text-xs text-red-600 inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {error}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {list.map((r) => (
          <div
            key={r.id}
            className={`bg-white border p-4 ${r.approved ? "border-border" : "border-amber-300 bg-amber-50/40"}`}
            data-testid={`admin-review-${r.id}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Stars value={r.rating} />
                  <span className="text-xs text-ink-muted">{fmtDate(r.created_at, true)}</span>
                  {r.verified_purchase && (
                    <span className="text-[10px] text-green-700 inline-flex items-center gap-1">
                      <BadgeCheck className="w-3 h-3" /> achat verifie
                    </span>
                  )}
                </div>
                {r.title && <div className="font-semibold mt-1">{r.title}</div>}
                <p className="text-sm text-ink-soft mt-1">{r.body}</p>
                {r.images?.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {r.images.map((u) => <img key={u} src={mediaSrc(u)} alt="" className="w-14 h-14 object-cover" />)}
                  </div>
                )}
                <div className="text-xs text-ink-muted mt-2">
                  {r.author_name} ·{" "}
                  {r.product ? (
                    <Link to={`/product/${r.product.slug}`} className="underline hover:text-brand" target="_blank">
                      {r.product.name}
                    </Link>
                  ) : "produit supprime"}
                </div>

                {replying === r.id ? (
                  <div className="mt-3" data-testid={`reply-form-${r.id}`}>
                    <Textarea
                      rows={3}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Votre reponse publique au nom de CAKESSHOP..."
                      data-testid={`reply-text-${r.id}`}
                    />
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <Button size="sm" onClick={() => saveReply(r)} className="bg-ink hover:bg-ink/90 rounded-none" data-testid={`reply-save-${r.id}`}>
                        Publier la reponse
                      </Button>
                      {r.admin_reply && (
                        <Button size="sm" variant="outline" onClick={() => saveReply(r, "")} className="rounded-none text-red-600">
                          Supprimer
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setReplying(null)} className="rounded-none">
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : r.admin_reply ? (
                  <div className="mt-3 bg-secondary border-l-2 border-brand p-3 text-sm" data-testid={`admin-reply-${r.id}`}>
                    <div className="text-[11px] uppercase tracking-wider font-bold text-brand mb-1 flex justify-between">
                      Reponse CAKESSHOP{" "}
                      <button
                        onClick={() => { setReplying(r.id); setReplyText(r.admin_reply); }}
                        className="underline font-normal normal-case"
                      >
                        modifier
                      </button>
                    </div>
                    <p className="text-ink-soft whitespace-pre-line">{r.admin_reply}</p>
                  </div>
                ) : (
                  <button
                    onClick={() => { setReplying(r.id); setReplyText(""); }}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                    data-testid={`reply-btn-${r.id}`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Repondre publiquement
                  </button>
                )}
              </div>

              <div className="flex gap-1">
                <button
                  onClick={() => toggle(r)}
                  title={r.approved ? "Masquer" : "Publier"}
                  className="p-1.5 hover:bg-secondary"
                  data-testid={`toggle-review-${r.id}`}
                >
                  {r.approved ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button onClick={() => remove(r)} className="p-1.5 hover:bg-red-50 text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {list.length === 0 && !loading && (
          <p className="text-ink-muted text-sm">
            {filter === "" ? "Aucun avis" : filter === "true" ? "Aucun avis publié" : "Aucun avis masqué"}
          </p>
        )}
      </div>

      {/* ⭐ Bouton "Charger plus" */}
      {hasMore && (
        <div className="text-center mt-4 p-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="bg-ink text-white px-6 py-2 text-xs font-bold uppercase hover:bg-ink/90 disabled:opacity-50 transition-colors"
            data-testid="load-more-reviews"
          >
            {loadingMore ? "Chargement…" : `Charger plus d'avis (${list.length} / ${total})`}
          </button>
        </div>
      )}
      {!hasMore && list.length >= PAGE_SIZE && (
        <div className="text-center mt-4 p-4 text-xs text-ink-muted">
          Tous les avis sont chargés ({list.length})
        </div>
      )}
    </div>
  );
}