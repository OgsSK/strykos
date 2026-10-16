import React, { useEffect, useState, useMemo } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
// ⭐ NOUVEAU : forcer le check de version après chaque save catégorie
import { forceCheckVersion } from "@/lib/cacheVersion";

const EMPTY = { slug: "", name_fr: "", name_en: "", type: "", parent_id: "", position: 0, published: true };
const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const MAX_PARENTS = 4;

export default function AdminCategories() {
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [expanded, setExpanded] = useState({});

  const load = () => api.get("/admin/categories").then((r) => setCats(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Sépare mères et enfants
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

  // ⭐ MODIFIÉ : force le check de version après save
  const save = async () => {
    if (!form.name_fr || !form.name_en) return toast.error("Noms FR et EN requis");
    const payload = {
      ...form,
      slug: form.slug || slugify(form.name_fr),
      parent_id: form.parent_id || null,
      position: parseInt(form.position) || 0,
    };
    try {
      if (editing) await api.put(`/admin/categories/${editing}`, payload);
      else await api.post("/admin/categories", payload);
      toast.success("Categorie enregistree");
      setOpen(false);
      load();
      // ⭐ NOUVEAU : force le check de version immédiatement
      await forceCheckVersion();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  // ⭐ MODIFIÉ : force le check de version après delete
  const remove = async (c) => {
    const hasChildren = childrenOf[c.id]?.length > 0;
    const msg = hasChildren
      ? `La categorie "${c.name_fr}" contient ${childrenOf[c.id].length} sous-categorie(s). Supprimer quand meme ?`
      : `Supprimer la categorie "${c.name_fr}" ?`;
    if (!window.confirm(msg)) return;
    try {
      await api.delete(`/admin/categories/${c.id}`);
      toast.success("Supprimee");
      load();
      // ⭐ NOUVEAU : force le check de version immédiatement
      await forceCheckVersion();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const toggleExpand = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const canAddParent = parents.length < MAX_PARENTS;

  return (
    <div data-testid="admin-categories">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl font-bold uppercase">Categories</h1>
          <p className="text-xs text-ink-muted mt-1">
            {parents.length} categorie(s) principale(s) · {cats.length - parents.length} sous-categorie(s)
            {!canAddParent && <span className="ml-2 text-amber-600 font-semibold">⚠ Limite de {MAX_PARENTS} principales atteinte</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {canAddParent && (
            <Button onClick={() => openNew("")} className="bg-brand hover:bg-brand-dark rounded-none" data-testid="new-category-btn">
              <Plus className="w-4 h-4 mr-1" /> Nouvelle principale
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white border border-border">
        {parents.length === 0 && (
          <p className="p-6 text-center text-ink-muted text-sm">Aucune categorie principale. Cliquez sur « Nouvelle principale ».</p>
        )}

        {parents.map((parent) => {
          const children = childrenOf[parent.id] || [];
          const isExp = expanded[parent.id] !== false; // ouvert par défaut
          return (
            <div key={parent.id} className="border-b border-border last:border-b-0">
              {/* Ligne du parent */}
              <div className="flex items-center justify-between p-3 bg-secondary/40 hover:bg-secondary/60">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <button
                    onClick={() => toggleExpand(parent.id)}
                    className="p-1 hover:bg-white rounded shrink-0"
                    disabled={children.length === 0}
                  >
                    {children.length === 0 ? (
                      <span className="w-4 h-4 inline-block" />
                    ) : isExp ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm">
                      {parent.name_fr}
                      <span className="ml-2 text-xs text-ink-muted font-normal">/ {parent.name_en}</span>
                      {!parent.published && <span className="ml-2 text-[10px] uppercase bg-gray-200 text-gray-600 px-1.5 py-0.5">Masquée</span>}
                    </div>
                    <div className="text-xs text-ink-muted mt-0.5">
                      <span className="font-mono">{parent.slug}</span>
                      <span className="mx-2">·</span>
                      {children.length} sous-catégorie(s)
                      <span className="mx-2">·</span>
                      {parent.product_count || 0} produit(s)
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => openNew(parent.id)}
                    className="p-1.5 hover:bg-white text-brand rounded"
                    title="Ajouter une sous-catégorie"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEdit(parent)}
                    className="p-1.5 hover:bg-white rounded"
                    title="Modifier"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => remove(parent)}
                    className="p-1.5 hover:bg-red-50 text-red-600 rounded"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Enfants */}
              {isExp && children.length > 0 && (
                <div className="bg-white">
                  {children.map((child) => (
                    <div
                      key={child.id}
                      className="flex items-center justify-between p-3 pl-12 border-t border-border hover:bg-cream/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">
                          <span className="text-ink-muted mr-2">└</span>
                          {child.name_fr}
                          <span className="ml-2 text-xs text-ink-muted font-normal">/ {child.name_en}</span>
                          {!child.published && <span className="ml-2 text-[10px] uppercase bg-gray-200 text-gray-600 px-1.5 py-0.5">Masquée</span>}
                        </div>
                        <div className="text-xs text-ink-muted mt-0.5 ml-6">
                          <span className="font-mono">{child.slug}</span>
                          <span className="mx-2">·</span>
                          {child.product_count || 0} produit(s)
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => openEdit(child)}
                          className="p-1.5 hover:bg-secondary rounded"
                          title="Modifier"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => remove(child)}
                          className="p-1.5 hover:bg-red-50 text-red-600 rounded"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Message si pas d'enfants */}
              {isExp && children.length === 0 && (
                <div className="p-3 pl-12 text-xs text-ink-muted italic border-t border-border">
                  Aucune sous-catégorie. Cliquez sur <Plus className="w-3 h-3 inline" /> pour en ajouter.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Modifier" : "Nouvelle"} {form.parent_id ? "sous-catégorie" : "catégorie"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {form.parent_id && (
              <div className="col-span-2 bg-cream border border-border p-2 text-xs">
                <span className="text-ink-muted">Parent : </span>
                <span className="font-semibold">
                  {parents.find((p) => p.id === form.parent_id)?.name_fr || "—"}
                </span>
              </div>
            )}

            <div>
              <Label>Nom FR *</Label>
              <Input value={form.name_fr} onChange={(e) => setF("name_fr", e.target.value)} data-testid="cf-name-fr" />
            </div>
            <div>
              <Label>Nom EN *</Label>
              <Input value={form.name_en} onChange={(e) => setF("name_en", e.target.value)} data-testid="cf-name-en" />
            </div>

            <div>
              <Label>Slug (URL)</Label>
              <Input
                value={form.slug}
                onChange={(e) => setF("slug", e.target.value)}
                placeholder="auto depuis le nom FR"
                className="font-mono text-xs"
              />
            </div>

            <div>
              <Label>Type (interne, optionnel)</Label>
              <Input
                value={form.type}
                onChange={(e) => setF("type", e.target.value)}
                placeholder="gateau / cupcake / macaron..."
              />
            </div>

            {/* Sélecteur de parent — uniquement les mères sans soi-même */}
            {!form.parent_id && !editing && (
              <div className="col-span-2">
                <Label>Catégorie parente (optionnel)</Label>
                <select
                  value={form.parent_id}
                  onChange={(e) => setF("parent_id", e.target.value)}
                  className="w-full border border-border h-10 px-2 bg-white"
                >
                  <option value="">Aucune (créer une catégorie principale)</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>{p.name_fr}</option>
                  ))}
                </select>
                <p className="text-[11px] text-ink-muted mt-1">
                  Laissez vide pour créer une catégorie principale (max {MAX_PARENTS}).
                </p>
              </div>
            )}

            <div>
              <Label>Position (ordre)</Label>
              <Input type="number" value={form.position} onChange={(e) => setF("position", e.target.value)} />
              <p className="text-[11px] text-ink-muted mt-1">Plus petit = plus haut dans le menu.</p>
            </div>

            <label className="flex items-center gap-2 text-sm mt-6">
              <input type="checkbox" checked={form.published} onChange={(e) => setF("published", e.target.checked)} />
              Visible sur la boutique
            </label>

            <Button onClick={save} className="col-span-2 bg-ink hover:bg-ink/90 rounded-none" data-testid="save-category-btn">
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}