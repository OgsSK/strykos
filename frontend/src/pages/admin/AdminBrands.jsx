import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SingleMediaUploader } from "@/components/admin/MediaUploader";
import { mediaSrc } from "@/lib/adminUtils";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
// ⭐ NOUVEAU : forcer le check de version après chaque save marque
import { forceCheckVersion } from "@/lib/cacheVersion";

const EMPTY = { name: "", slug: "", logo_url: "", description_fr: "", description_en: "", is_local: false, published: true };
const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function AdminBrands() {
  const [brands, setBrands] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const load = () => api.get("/admin/brands").then((r) => setBrands(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // ⭐ MODIFIÉ : force le check de version après save
  const save = async () => {
    if (!form.name) return toast.error("Nom requis");
    const payload = { ...form, slug: form.slug || slugify(form.name) };
    try {
      if (editing) await api.put(`/admin/brands/${editing}`, payload);
      else await api.post("/admin/brands", payload);
      toast.success("Marque enregistree");
      setOpen(false);
      load();
      // ⭐ NOUVEAU : force le check de version immédiatement
      await forceCheckVersion();
    } catch (e) { toast.error(apiError(e)); }
  };

  // ⭐ MODIFIÉ : force le check de version après delete
  const remove = async (b) => {
    if (!window.confirm(`Supprimer la marque "${b.name}" ? Les produits associes perdront leur marque.`)) return;
    try {
      await api.delete(`/admin/brands/${b.id}`);
      toast.success("Supprimee");
      load();
      // ⭐ NOUVEAU : force le check de version immédiatement
      await forceCheckVersion();
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div data-testid="admin-brands">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-heading text-2xl font-bold uppercase">Marques</h1>
        <Button onClick={() => { setEditing(null); setForm(EMPTY); setOpen(true); }} className="bg-brand hover:bg-brand-dark rounded-none" data-testid="new-brand-btn"><Plus className="w-4 h-4 mr-1" /> Nouvelle marque</Button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {brands.map((b) => (
          <div key={b.id} className="bg-white border border-border p-4 flex gap-3" data-testid={`brand-card-${b.slug}`}>
            <div className="w-14 h-14 bg-secondary flex items-center justify-center overflow-hidden shrink-0">{b.logo_url ? <img src={mediaSrc(b.logo_url)} alt="" className="w-full h-full object-contain" /> : <span className="font-heading font-bold text-lg">{b.name[0]}</span>}</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold flex items-center gap-2">{b.name} {b.is_local && <span className="text-[10px] bg-green-100 text-green-700 px-1.5">Locale</span>} {!b.published && <span className="text-[10px] bg-gray-200 px-1.5">Masquee</span>}</div>
              <div className="text-xs text-ink-muted">{b.product_count} produit(s) · /{b.slug}</div>
            </div>
            <div className="flex flex-col gap-1">
              <button onClick={() => { setEditing(b.id); setForm({ name: b.name, slug: b.slug, logo_url: b.logo_url || "", description_fr: b.description_fr || "", description_en: b.description_en || "", is_local: b.is_local, published: b.published }); setOpen(true); }} className="p-1.5 hover:bg-secondary" data-testid={`edit-brand-${b.slug}`}><Pencil className="w-4 h-4" /></button>
              <button onClick={() => remove(b)} className="p-1.5 hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
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