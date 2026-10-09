import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

const EMPTY = { slug: "", name_fr: "", name_en: "", type: "", parent_id: "", position: 0, published: true };
const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function AdminCategories() {
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const load = () => api.get("/admin/categories").then((r) => setCats(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name_fr || !form.name_en) return toast.error("Noms FR et EN requis");
    const payload = { ...form, slug: form.slug || slugify(form.name_fr), parent_id: form.parent_id || null, position: parseInt(form.position) || 0 };
    try {
      if (editing) await api.put(`/admin/categories/${editing}`, payload); else await api.post("/admin/categories", payload);
      toast.success("Categorie enregistree"); setOpen(false); load();
    } catch (e) { toast.error(apiError(e)); }
  };
  const remove = async (c) => {
    if (!window.confirm(`Supprimer la categorie "${c.name_fr}" ?`)) return;
    try { await api.delete(`/admin/categories/${c.id}`); toast.success("Supprimee"); load(); } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div data-testid="admin-categories">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-heading text-2xl font-bold uppercase">Categories</h1>
        <Button onClick={() => { setEditing(null); setForm(EMPTY); setOpen(true); }} className="bg-brand hover:bg-brand-dark rounded-none" data-testid="new-category-btn"><Plus className="w-4 h-4 mr-1" /> Nouvelle categorie</Button>
      </div>
      <div className="bg-white border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider"><tr><th className="p-3">#</th><th className="p-3">Nom FR</th><th className="p-3">Nom EN</th><th className="p-3">Slug</th><th className="p-3">Type</th><th className="p-3">Produits</th><th className="p-3">Visible</th><th className="p-3"></th></tr></thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id} className="border-t border-border" data-testid={`category-row-${c.slug}`}>
                <td className="p-3 text-ink-muted">{c.position}</td><td className="p-3 font-medium">{c.name_fr}</td><td className="p-3">{c.name_en}</td>
                <td className="p-3 text-xs text-ink-muted">{c.slug}</td><td className="p-3 text-xs">{c.type}</td><td className="p-3">{c.product_count}</td>
                <td className="p-3">{c.published ? <span className="text-green-600 text-xs">Oui</span> : <span className="text-ink-muted text-xs">Non</span>}</td>
                <td className="p-3"><div className="flex gap-1 justify-end">
                  <button onClick={() => { setEditing(c.id); setForm({ slug: c.slug, name_fr: c.name_fr, name_en: c.name_en, type: c.type || "", parent_id: c.parent_id || "", position: c.position, published: c.published }); setOpen(true); }} className="p-1.5 hover:bg-secondary" data-testid={`edit-category-${c.slug}`}><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(c)} className="p-1.5 hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Modifier" : "Nouvelle"} categorie</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Nom FR *</Label><Input value={form.name_fr} onChange={(e) => setF("name_fr", e.target.value)} data-testid="cf-name-fr" /></div>
            <div><Label>Nom EN *</Label><Input value={form.name_en} onChange={(e) => setF("name_en", e.target.value)} data-testid="cf-name-en" /></div>
            <div><Label>Slug</Label><Input value={form.slug} onChange={(e) => setF("slug", e.target.value)} placeholder="auto" /></div>
            <div><Label>Type (filtre)</Label><Input value={form.type} onChange={(e) => setF("type", e.target.value)} placeholder="jersey / boots / ..." /></div>
            <div>
              <Label>Parent</Label>
              <select value={form.parent_id} onChange={(e) => setF("parent_id", e.target.value)} className="w-full border border-border h-10 px-2 bg-white">
                <option value="">Aucun</option>{cats.filter((c) => c.id !== editing).map((c) => <option key={c.id} value={c.id}>{c.name_fr}</option>)}
              </select>
            </div>
            <div><Label>Position</Label><Input type="number" value={form.position} onChange={(e) => setF("position", e.target.value)} /></div>
            <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.published} onChange={(e) => setF("published", e.target.checked)} /> Visible sur la boutique</label>
            <Button onClick={save} className="col-span-2 bg-ink hover:bg-ink/90 rounded-none" data-testid="save-category-btn">Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
