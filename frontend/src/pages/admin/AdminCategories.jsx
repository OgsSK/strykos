import React, { useEffect, useState, useMemo, useCallback } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight, ExternalLink, Link as LinkIcon,
  Info, Package, AlertTriangle, RefreshCw, AlertCircle
} from "lucide-react";
import { forceCheckVersion } from "@/lib/cacheVersion";

const EMPTY = { slug: "", name_fr: "", name_en: "", type: "", parent_id: "", position: 0, published: true };

// ⭐ FONCTION DE NETTOYAGE ULTRA-SÉCURISÉE
const cleanSlug = (input) => {
  let s = (input || "").trim().toLowerCase();

  if (s.includes("category=")) {
    s = s.split("category=")[1].split("&")[0];
  }

  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

// ⭐ Skeleton de chargement
const SkeletonCategoryRow = () => (
  <div className="p-4 bg-secondary/20 animate-pulse">
    <div className="flex items-center gap-3">
      <div className="w-5 h-5 bg-secondary rounded" />
      <div className="flex-1">
        <div className="h-4 w-48 bg-secondary rounded mb-2" />
        <div className="h-3 w-64 bg-secondary rounded" />
      </div>
    </div>
  </div>
);

export default function AdminCategories() {
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [expanded, setExpanded] = useState({});

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
      const { data } = await api.get("/admin/categories", { signal: controller.signal });
      setCats(data || []);
      setLastUpdated(new Date());
    } catch (e) {
      if (e.name === "CanceledError" || e.name === "AbortError" || e.code === "ERR_CANCELED") return;
      setError(e?.response?.data?.detail || e.message || "Erreur de chargement");
      toast.error("Impossible de charger les catégories");
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
    toast.success("Catégories actualisées");
  };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const parents = useMemo(() => cats.filter((c) => !c.parent_id).sort((a, b) => a.position - b.position), [cats]);

  const childrenOf = useMemo(() => {
    const map = {};
    cats.filter((c) => c.parent_id).forEach((c) => {
      map[c.parent_id] = map[c.parent_id] || [];
      map[c.parent_id].push(c);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => a.position - b.position));
    return map;
  }, [cats]);

  const availableParents = useMemo(() => {
    if (!editing) return parents;
    return parents.filter((p) => p.id !== editing);
  }, [parents, editing]);

  const hasChildren = editing && cats.some((c) => c.parent_id === editing);

  const openNew = (parentId = "") => {
    setEditing(null);
    setForm({ ...EMPTY, parent_id: parentId });
    setOpen(true);
  };

  const openEdit = (c) => {
    setEditing(c.id);
    setForm({
      slug: c.slug,
      name_fr: c.name_fr,
      name_en: c.name_en,
      type: c.type || "",
      parent_id: c.parent_id || "",
      position: c.position,
      published: c.published,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name_fr || !form.name_en) return toast.error("Noms FR et EN requis");

    const finalSlug = cleanSlug(form.slug || form.name_fr);

    if (finalSlug.endsWith("-std") || finalSlug.includes("sku")) {
      return toast.error("Ce slug ressemble à une référence produit (SKU). Utilisez un nom simple (ex: 'anniversaires').");
    }

    if (!finalSlug) {
      return toast.error("Le slug est invalide. Utilisez des lettres et des tirets.");
    }

    const payload = {
      ...form,
      slug: finalSlug,
      parent_id: form.parent_id || null,
      position: parseInt(form.position) || 0,
    };

    try {
      if (editing) await api.put(`/admin/categories/${editing}`, payload);
      else await api.post("/admin/categories", payload);
      toast.success("Catégorie enregistrée");
      setOpen(false);
      await load(true);
      await forceCheckVersion();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (c) => {
    const children = childrenOf[c.id] || [];
    let msg = `Supprimer la catégorie "${c.name_fr}" ?`;

    if (children.length > 0) {
      msg = `⚠️ Attention : La catégorie "${c.name_fr}" contient ${children.length} sous-catégorie(s).\n\nSi vous la supprimez, les sous-catégories deviendront des catégories principales.\n\nContinuer ?`;
    }

    if (!window.confirm(msg)) return;
    try {
      await api.delete(`/admin/categories/${c.id}`);
      toast.success("Catégorie supprimée");
      await load(true);
      await forceCheckVersion();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const toggleExpand = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const copyLink = (slug) => {
    const url = `${window.location.origin}/catalog?category=${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Lien copié !");
  };

  // ⭐ Skeleton initial
  if (loading && cats.length === 0) {
    return (
      <div data-testid="admin-categories-loading" className="max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-heading text-2xl font-bold uppercase">Catégories</h1>
        </div>
        <div className="bg-white border border-border rounded-sm shadow-sm overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCategoryRow key={i} />)}
        </div>
      </div>
    );
  }

  // ⭐ Erreur avec retry
  if (error && cats.length === 0) {
    return (
      <div data-testid="admin-categories-error" className="max-w-5xl">
        <div className="bg-red-50 border border-red-200 p-6 flex items-start gap-3">
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
      </div>
    );
  }

  return (
    <div data-testid="admin-categories" className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold uppercase">Catégories</h1>
          <p className="text-xs text-ink-muted mt-1">
            {parents.length} catégorie(s) principale(s) · {cats.length - parents.length} sous-catégorie(s)
            {lastUpdated && (
              <span className="ml-2">
                · actualisé à {lastUpdated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
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
          <Button onClick={() => openNew("")} className="bg-brand hover:bg-brand-dark rounded-none">
            <Plus className="w-4 h-4 mr-2" /> Nouvelle catégorie
          </Button>
        </div>
      </div>

      <div className="bg-white border border-border rounded-sm shadow-sm overflow-hidden">
        {parents.length === 0 && (
          <p className="p-8 text-center text-ink-muted text-sm italic">Aucune catégorie pour le moment.</p>
        )}

        {parents.map((parent) => {
          const children = childrenOf[parent.id] || [];
          const isExp = expanded[parent.id] !== false;

          return (
            <div key={parent.id} className="border-b border-border last:border-b-0">
              <div className="flex items-center justify-between p-4 bg-secondary/20 hover:bg-secondary/40 transition-colors group">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <button
                    onClick={() => toggleExpand(parent.id)}
                    className={`p-1.5 rounded shrink-0 transition-colors ${children.length === 0 ? "opacity-30 cursor-default" : "hover:bg-white"}`}
                    disabled={children.length === 0}
                  >
                    {children.length === 0 ? <span className="w-5 h-5 inline-block" /> : isExp ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-base text-ink">{parent.name_fr}</span>
                      <span className="text-sm text-ink-muted">/ {parent.name_en}</span>
                      {!parent.published && (
                        <span className="text-[10px] uppercase tracking-wider bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">Masquée</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-ink-muted mt-1 flex-wrap">
                      <span className="font-mono bg-secondary px-1.5 py-0.5 rounded text-[11px]">{parent.slug}</span>
                      <span className="inline-flex items-center gap-1"><Info className="w-3 h-3" /> {children.length} sous-catégorie(s)</span>
                      <span className="inline-flex items-center gap-1"><Package className="w-3 h-3" /> {parent.product_count || 0} produit(s)</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openNew(parent.id)} className="p-2 hover:bg-white text-brand rounded" title="Ajouter une sous-catégorie">
                    <Plus className="w-4 h-4" />
                  </button>
                  <button onClick={() => copyLink(parent.slug)} className="p-2 hover:bg-white rounded text-ink-muted hover:text-ink" title="Copier le lien">
                    <LinkIcon className="w-4 h-4" />
                  </button>
                  <button onClick={() => window.open(`/catalog?category=${parent.slug}`, "_blank")} className="p-2 hover:bg-white rounded text-ink-muted hover:text-ink" title="Voir sur la boutique">
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEdit(parent)} className="p-2 hover:bg-white rounded text-ink-muted hover:text-ink" title="Modifier">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove(parent)} className="p-2 hover:bg-red-50 text-red-500 rounded" title="Supprimer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {isExp && children.length > 0 && (
                <div className="bg-white">
                  {children.map((child) => (
                    <div key={child.id} className="flex items-center justify-between p-3 pl-14 border-t border-border hover:bg-cream/30 transition-colors group">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm flex-wrap">
                          <span className="text-ink-muted font-mono text-xs">└─</span>
                          <span className="font-medium text-ink">{child.name_fr}</span>
                          <span className="text-xs text-ink-muted">/ {child.name_en}</span>
                          {!child.published && (
                            <span className="text-[10px] uppercase tracking-wider bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">Masquée</span>
                          )}
                        </div>
                        <div className="text-xs text-ink-muted mt-1 ml-6 flex items-center gap-3">
                          <span className="font-mono">{child.slug}</span>
                          <span className="inline-flex items-center gap-1"><Package className="w-3 h-3" /> {child.product_count || 0} produit(s)</span>
                        </div>
                      </div>

                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => copyLink(child.slug)} className="p-1.5 hover:bg-secondary rounded text-ink-muted hover:text-ink" title="Copier le lien">
                          <LinkIcon className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => window.open(`/catalog?category=${child.slug}`, "_blank")} className="p-1.5 hover:bg-secondary rounded text-ink-muted hover:text-ink" title="Voir sur la boutique">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openEdit(child)} className="p-1.5 hover:bg-secondary rounded text-ink-muted hover:text-ink" title="Modifier">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => remove(child)} className="p-1.5 hover:bg-red-50 text-red-500 rounded" title="Supprimer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isExp && children.length === 0 && (
                <div className="p-3 pl-14 text-xs text-ink-muted italic border-t border-border bg-cream/20">
                  Aucune sous-catégorie pour le moment.
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Modifier la catégorie" : "Créer une catégorie"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nom FR *</Label>
                <Input value={form.name_fr} onChange={(e) => setF("name_fr", e.target.value)} placeholder="Ex: Gâteaux d'anniversaire" />
              </div>
              <div>
                <Label>Nom EN *</Label>
                <Input value={form.name_en} onChange={(e) => setF("name_en", e.target.value)} placeholder="Ex: Birthday cakes" />
              </div>
            </div>

            <div className="bg-blue-50/50 p-4 border border-blue-100 rounded-md">
              <Label className="text-blue-900">Lien URL (Slug) *</Label>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-ink-muted font-mono bg-white px-2 py-2 border border-border rounded">/catalog?category=</span>
                <Input
                  value={form.slug}
                  onChange={(e) => setF("slug", cleanSlug(e.target.value))}
                  placeholder="gateaux-anniversaire"
                  className="font-mono text-sm bg-white"
                />
              </div>
              <p className="text-[11px] text-blue-700 mt-2 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Générez un mot simple. N'utilisez <strong>pas</strong> de référence produit (SKU).
              </p>

              {form.slug && (form.slug.endsWith("-std") || form.slug.includes("sku") || form.slug.length > 30) && (
                <div className="mt-3 bg-red-50 border border-red-200 p-3 rounded text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>Attention :</strong> Ce slug semble incorrect. Il ressemble à une référence produit.
                    Utilisez un nom simple comme <code>anniversaires</code> ou <code>gateaux-adultes</code>.
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label>Catégorie parente</Label>
              <select
                value={form.parent_id}
                onChange={(e) => setF("parent_id", e.target.value)}
                className="w-full border border-border h-10 px-3 bg-white text-sm mt-1"
              >
                <option value="">— Aucune (Catégorie principale) —</option>
                {availableParents.map((p) => (
                  <option key={p.id} value={p.id}>{p.name_fr}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type (interne, optionnel)</Label>
                <Input value={form.type} onChange={(e) => setF("type", e.target.value)} placeholder="Ex: gateau, cupcake..." />
              </div>
              <div>
                <Label>Position (ordre d'affichage)</Label>
                <Input type="number" value={form.position} onChange={(e) => setF("position", e.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input type="checkbox" id="published" checked={form.published} onChange={(e) => setF("published", e.target.checked)} className="w-4 h-4" />
              <Label htmlFor="published" className="cursor-pointer font-normal">Visible sur la boutique</Label>
            </div>

            {hasChildren && form.parent_id && (
              <div className="bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 rounded">
                ⚠️ Cette catégorie a des sous-catégories. Si vous lui assignez un parent, elle deviendra une sous-catégorie de 2ème niveau.
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-none">Annuler</Button>
            <Button onClick={save} className="bg-ink hover:bg-ink/90 rounded-none">Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}