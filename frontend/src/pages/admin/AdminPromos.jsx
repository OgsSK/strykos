import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate, money as fmtMoney } from "@/lib/adminUtils";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Tag, RefreshCw, AlertCircle } from "lucide-react";
import { forceCheckVersion } from "@/lib/cacheVersion";

// ⭐ Helpers de formatage (GBP-safe via adminUtils.money)
const fmtEur = (v) => {
  if (v === "" || v === null || v === undefined) return "";
  return fmtMoney(v, "EUR", "fr-FR");
};

// ⭐ Taille de page
const PAGE_SIZE = 20;

const EMPTY = {
  code: "", description: "", discount_type: "percent", value: 10,
  min_subtotal_eur: 0,
  free_shipping: false, first_order_only: false,
  usage_limit: "", starts_at: "", expires_at: "", active: true,
};
const toLocalInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

// ⭐ Skeleton de chargement
const SkeletonRow = () => (
  <tr className="border-t border-border animate-pulse">
    {Array.from({ length: 7 }).map((_, i) => (
      <td key={i} className="p-3">
        <div className="h-4 bg-secondary rounded w-3/4" />
      </td>
    ))}
  </tr>
);

export default function AdminPromos() {
  const [params, setParams] = useSearchParams();
  const [promos, setPromos] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [limit, setLimit] = useState(PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (lim = PAGE_SIZE, opts = {}) => {
    const { isRefresh = false, silent = false } = opts;
    if (isRefresh) setRefreshing(true);
    else if (!silent) setLoading(true);
    setError(null);

    try {
      const { data } = await api.get(`/admin/promos?limit=${lim}&offset=0`);
      const items = data.items || [];
      setPromos(items);
      setTotal(data.total || 0);
      setHasMore(items.length >= lim && items.length < (data.total || 0));
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Erreur de chargement");
      if (!silent) toast.error("Impossible de charger les codes promo");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load(PAGE_SIZE);
    if (params.get("new")) {
      setForm(EMPTY);
      setEditing(null);
      setOpen(true);
      setParams({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = () => {
    setLoadingMore(true);
    const newLimit = limit + PAGE_SIZE;
    setLimit(newLimit);
    load(newLimit, { silent: true });
  };

  const refresh = async () => {
    await forceCheckVersion();
    await load(limit, { isRefresh: true });
    toast.success("Codes promo actualisés");
  };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // ⭐ MODIFIÉ : EUR est la devise principale, plus de conversion FCFA → EUR
  const save = async () => {
    if (!form.code.trim()) return toast.error("Code requis");

    const payloadValue = parseFloat(form.value) || 0;
    const minSubtotalEur = parseFloat(form.min_subtotal_eur) || 0;

    const payload = {
      ...form,
      code: form.code.trim().toUpperCase(),
      value: payloadValue,
      min_subtotal_eur: minSubtotalEur,
      usage_limit: form.usage_limit === "" ? null : parseInt(form.usage_limit),
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    };

    try {
      if (editing) await api.put(`/admin/promos/${editing}`, payload);
      else await api.post("/admin/promos", payload);
      toast.success("Code enregistré");
      setOpen(false);
      await load(limit, { silent: true });
      await forceCheckVersion();
    } catch (e) { toast.error(apiError(e)); }
  };

  const toggle = async (p) => {
    try {
      await api.put(`/admin/promos/${p.id}`, { ...p, active: !p.active });
      await load(limit, { silent: true });
      await forceCheckVersion();
    } catch (e) { toast.error(apiError(e)); }
  };

  const remove = async (p) => {
    if (!window.confirm(`Supprimer le code ${p.code} ?`)) return;
    try {
      await api.delete(`/admin/promos/${p.id}`);
      toast.success("Supprimé");
      await load(limit, { silent: true });
      await forceCheckVersion();
    } catch (e) { toast.error(apiError(e)); }
  };

  const isExpired = (p) => p.expires_at && new Date(p.expires_at) < new Date();

  if (loading && promos.length === 0) {
    return (
      <div data-testid="admin-promos-loading">
        <div className="flex items-center justify-between mb-5">
          <h1 className="font-heading text-2xl font-bold uppercase">Codes promo</h1>
        </div>
        <div className="bg-white border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="p-3">Code</th>
                <th className="p-3">Remise</th>
                <th className="p-3">Conditions</th>
                <th className="p-3">Utilisations</th>
                <th className="p-3">Validité</th>
                <th className="p-3">État</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (error && promos.length === 0) {
    return (
      <div data-testid="admin-promos-error" className="bg-red-50 border border-red-200 p-6 flex items-start gap-3">
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
    <div data-testid="admin-promos">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="font-heading text-2xl font-bold uppercase">
          Codes promo{" "}
          <span className="text-ink-muted text-base font-normal">
            ({promos.length}{hasMore ? "+" : ""}{total > 0 && !hasMore ? ` / ${total}` : ""})
          </span>
        </h1>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1 border border-border px-3 py-2 text-sm font-semibold hover:border-ink disabled:opacity-50 transition-colors"
            title="Recharger"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "..." : "Rafraîchir"}
          </button>
          <Button
            onClick={() => { setEditing(null); setForm(EMPTY); setOpen(true); }}
            className="bg-brand hover:bg-brand-dark rounded-none"
            data-testid="new-promo-btn"
          >
            <Plus className="w-4 h-4 mr-1" /> Nouveau code
          </Button>
        </div>
      </div>

      <div className="bg-white border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3">Code</th>
              <th className="p-3">Remise</th>
              <th className="p-3">Conditions</th>
              <th className="p-3">Utilisations</th>
              <th className="p-3">Validité</th>
              <th className="p-3">État</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {promos.map((p) => (
              <tr key={p.id} className="border-t border-border" data-testid={`promo-row-${p.code}`}>
                <td className="p-3">
                  <div className="font-mono font-bold inline-flex items-center gap-1">
                    <Tag className="w-3 h-3 text-brand" />{p.code}
                  </div>
                  <div className="text-xs text-ink-muted">{p.description}</div>
                </td>
                {/* ⭐ EUR uniquement */}
                <td className="p-3 font-semibold">
                  {p.discount_type === "percent"
                    ? `${p.value}%`
                    : fmtEur(p.value)}
                  {p.free_shipping && <div className="text-xs text-green-700">+ livraison offerte</div>}
                </td>
                {/* ⭐ Min subtotal EUR uniquement */}
                <td className="p-3 text-xs">
                  {p.min_subtotal_eur > 0 && (
                    <div>Min. {fmtEur(p.min_subtotal_eur)}</div>
                  )}
                  {p.first_order_only && <div>1ère commande</div>}
                </td>
                <td className="p-3">{p.used_count}{p.usage_limit != null && ` / ${p.usage_limit}`}</td>
                <td className="p-3 text-xs">
                  {p.starts_at && <div>Du {fmtDate(p.starts_at)}</div>}
                  {p.expires_at
                    ? <div className={isExpired(p) ? "text-red-600" : ""}>Jusqu'au {fmtDate(p.expires_at)}</div>
                    : <span className="text-ink-muted">Sans limite</span>}
                </td>
                <td className="p-3">
                  <button
                    onClick={() => toggle(p)}
                    className={`text-xs px-2 py-0.5 ${p.active && !isExpired(p) ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}
                    data-testid={`toggle-promo-${p.code}`}
                  >
                    {isExpired(p) ? "Expiré" : p.active ? "Actif" : "Inactif"}
                  </button>
                </td>
                <td className="p-3">
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={() => {
                        setEditing(p.id);
                        setForm({
                          ...p,
                          usage_limit: p.usage_limit ?? "",
                          starts_at: toLocalInput(p.starts_at),
                          expires_at: toLocalInput(p.expires_at),
                          // ⭐ MODIFIÉ : value EUR directement (plus de eurToXof)
                          value: p.value,
                          min_subtotal_eur: p.min_subtotal_eur || 0,
                        });
                        setOpen(true);
                      }}
                      className="p-1.5 hover:bg-secondary"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => remove(p)} className="p-1.5 hover:bg-red-50 text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {promos.length === 0 && !loading && (
              <tr><td colSpan={7} className="p-6 text-center text-ink-muted">Aucun code promo</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="text-center mt-4 p-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="bg-ink text-white px-6 py-2 text-xs font-bold uppercase hover:bg-ink/90 disabled:opacity-50 transition-colors"
            data-testid="load-more-promos"
          >
            {loadingMore ? "Chargement…" : `Charger plus de codes (${promos.length} / ${total})`}
          </button>
        </div>
      )}
      {!hasMore && promos.length >= PAGE_SIZE && (
        <div className="text-center mt-4 p-4 text-xs text-ink-muted">
          Tous les codes promo sont chargés ({promos.length})
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Modifier" : "Nouveau"} code promo</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Code *</Label><Input value={form.code} onChange={(e) => setF("code", e.target.value.toUpperCase())} className="font-mono" data-testid="promo-code-input" /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={(e) => setF("description", e.target.value)} /></div>

            <div>
              <Label>Type</Label>
              <select value={form.discount_type} onChange={(e) => setF("discount_type", e.target.value)} className="w-full border border-border h-10 px-2 bg-white" data-testid="promo-type">
                <option value="percent">Pourcentage (%)</option>
                {/* ⭐ MODIFIÉ : label EUR */}
                <option value="fixed">Montant fixe (EUR)</option>
              </select>
            </div>

            <div>
              {/* ⭐ MODIFIÉ : EUR au lieu de FCFA */}
              <Label>Valeur {form.discount_type === "percent" ? "(%)" : "(EUR)"}</Label>
              <Input
                type="number"
                step={form.discount_type === "percent" ? "1" : "0.01"}
                value={form.value}
                onChange={(e) => setF("value", e.target.value)}
                data-testid="promo-value"
              />
            </div>

            {/* ⭐ MODIFIÉ : min subtotal EUR directement */}
            <div>
              <Label>Montant minimum (EUR)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.min_subtotal_eur || ""}
                onChange={(e) => setF("min_subtotal_eur", e.target.value)}
                placeholder="Ex: 30"
              />
            </div>

            <div><Label>Limite d'utilisation</Label><Input type="number" value={form.usage_limit} onChange={(e) => setF("usage_limit", e.target.value)} placeholder="illimité" /></div>
            <div><Label>Début</Label><Input type="datetime-local" value={form.starts_at} onChange={(e) => setF("starts_at", e.target.value)} /></div>
            <div><Label>Expiration</Label><Input type="datetime-local" value={form.expires_at} onChange={(e) => setF("expires_at", e.target.value)} /></div>

            <div className="col-span-2 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.free_shipping} onChange={(e) => setF("free_shipping", e.target.checked)} /> Livraison offerte</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.first_order_only} onChange={(e) => setF("first_order_only", e.target.checked)} /> 1ère commande uniquement</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={(e) => setF("active", e.target.checked)} /> Actif</label>
            </div>
            <Button onClick={save} className="col-span-2 bg-ink hover:bg-ink/90 rounded-none" data-testid="save-promo-btn">Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}