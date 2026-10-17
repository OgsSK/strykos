import React, { useEffect, useState, useCallback } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SingleMediaUploader } from "@/components/admin/MediaUploader";
import { mediaSrc } from "@/lib/adminUtils";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw, AlertCircle } from "lucide-react";
import { forceCheckVersion } from "@/lib/cacheVersion";

const EMPTY = { name: "", slug: "", logo_url: "", description_fr: "", description_en: "", is_local: false, published: true };
const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ⭐ Skeleton de chargement
const SkeletonBrandCard = () => (
  <div className="bg-white border border-border p-4 flex gap-3 animate-pulse">
    <div className="w-14 h-14 bg-secondary rounded" />
    <div className="flex-1 min-w-0">
      <div className="h-4 w-32 bg-secondary rounded mb-2" />
      <div className="h-3 w-24 bg-secondary rounded" />
    </div>
  </div>
);

export default function AdminBrands() {
  const [brands, setBrands] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  // ⭐ États UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // ⭐ load avec AbortController
  const load = useCallback(async (isRefresh = false) => {
    const controller = new AbortController();
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const { data } = await api.get("/admin/brands", { signal: controller.signal });
      setBrands(data || []);
      setLastUpdated(new Date());
    } catch (e) {
      if (e.name === "CanceledError" || e.name === "AbortError" || e.code === "ERR_CANCELED") return;
      setError(e?.response?.data?.detail || e.message || "Erreur de chargement");
      toast.error("Impossible de charger les marques");
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

  // ⭐ Refresh manuel
  const refresh = async () => {
    await forceCheckVersion();
    await load(true);
    toast.success("Marques actualisées");
  };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // ⭐ Save
  const save = async () => {
    if (!form.name) return toast.error("Nom requis");
    const payload = { ...form, slug: form.slug || slugify(form.name) };
    try {
      if (editing) await api.put(`/admin/brands/${editing}`, payload);
      else await api.post("/admin/brands", payload);
      toast.success("Marque enregistree");
      setOpen(false);
      await load(true);
      await forceCheckVersion();
    } catch (e) { toast.error(apiError(e)); }
  };

  // ⭐ Remove
  const remove = async (b) => {
    if (!window.confirm(`Supprimer la marque "${b.name}" ? Les produits associes perdront leur marque.`)) return;
    try {
      await api.delete(`/admin/brands/${b.id}`);
      toast.success("Supprimee");
      await load(true);
      await forceCheckVersion();
    } catch (e) { toast.error(apiError(e)); }
  };

  // ⭐ Skeleton initial
  if (loading && brands.length === 0) {
    return (
      <div data-testid="admin-brands-loading">
        <div className="flex items-center justify-between mb-5">
          <h1 className="font-heading text-2xl font-bold uppercase">Marques</h1>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonBrandCard key={i} />)}
        </div>
      </div>
    );
  }

  // ⭐ Erreur avec retry
  if (error && brands.length === 0) {
    return (
      <div data-testid="admin-brands-error" className="bg-red-50 border border-red-200 p-6 flex items-start gap-3">
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

  return (
    <div data-testid="admin-brands">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-heading text-2xl font-bold uppercase">
            Marques <span className="text-ink-muted text-base font-normal">({brands.length})</span>
          </h1>
          {lastUpdated && (
            <p className="text-[11px] text-ink-muted mt-1">
              Actualisé à {lastUpdated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
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
            data-testid="new-brand-btn"
          >
            <Plus className="w-4 h-4 mr-1" /> Nouvelle marque
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {brands.map((b) => (
          <div key={b.id} className="bg-white border border-border p-4 flex gap-3" data-testid={`brand-card-${b.slug}`}>
            <div className="w-14 h-14 bg-secondary flex items-center justify-center overflow-hidden shrink-0">
              {b.logo_url
                ? <img src={mediaSrc(b.logo_url)} alt="" className="w-full h-full object-contain" />
                : <span className="font-heading font-bold text-lg">{b.name[0]}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold flex items-center gap-2 flex-wrap">
                {b.name}
                {b.is_local && <span className="text-[10px] bg-green-100 text-green-700 px-1.5">Locale</span>}
                {!b.published && <span className="text-[10px] bg-gray-200 px-1.5">Masquee</span>}
              </div>
              <div className="text-xs text-ink-muted">{b.product_count} produit(s) · /{b.slug}</div>
            </div>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => {
                  setEditing(b.id);
                  setForm({
                    name: b.name,
                    slug: b.slug,
                    logo_url: b.logo_url || "",
                    description_fr: b.description_fr || "",
                    description_en: b.description_en || "",
                    is_local: b.is_local,
                    published: b.published,
                  });
                  setOpen(true);
                }}
                className="p-1.5 hover:bg-secondary"
                data-testid={`edit-brand-${b.slug}`}
                title="Modifier"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => remove(b)} className="p-1.5 hover:bg-red-50 text-red-600" title="Supprimer">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {brands.length === 0 && (
          <div className="col-span-full text-center text-ink-muted text-sm py-8">
            Aucune marque. Cliquez sur "Nouvelle marque" pour commencer.
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Modifier" : "Nouvelle"} marque</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom *</Label><Input value={form.name} onChange={(e) => setF("name", e.target.value)} data-testid="bf-name" /></div>
            <div><Label>Slug</Label><Input value={form.slug} onChange={(e) => setF("slug", e.target.value)} placeholder="auto" /></div>
            <div><Label>Logo</Label><SingleMediaUploader value={form.logo_url} onChange={(v) => setF("logo_url", v)} label="un logo" testid="bf-logo" /></div>
            <div><Label>Description FR</Label><Textarea rows={2} value={form.description_fr} onChange={(e) => setF("description_fr", e.target.value)} /></div>
            <div><Label>Description EN</Label><Textarea rows={2} value={form.description_en} onChange={(e) => setF("description_en", e.target.value)} /></div>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_local} onChange={(e) => setF("is_local", e.target.checked)} /> Marque locale / africaine</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.published} onChange={(e) => setF("published", e.target.checked)} /> Visible</label>
            </div>
            <Button onClick={save} className="w-full bg-ink hover:bg-ink/90 rounded-none" data-testid="save-brand-btn">Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}