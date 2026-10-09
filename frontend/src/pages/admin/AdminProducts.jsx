import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";

const EMPTY = {
  slug: "", sku: "", brand_id: "", category_id: "", name_fr: "", name_en: "",
  description_fr: "", description_en: "", price_eur: 0, price_usd: null, price_xof: null,
  sale_price_eur: null, is_new: false, is_featured: false, is_best_seller: false,
  club: "", national_team: "", surface: "", product_type: "", colors: [],
  customizable: false, customization_price_eur: 0, published: true, images: [], variants: [],
};

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [imagesText, setImagesText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/admin/products").then((r) => setProducts(r.data)).catch(() => {});
  useEffect(() => {
    load();
    api.get("/brands").then((r) => setBrands(r.data)).catch(() => {});
    api.get("/categories").then((r) => setCats(r.data)).catch(() => {});
  }, []);

  const openNew = () => {
    setEditing(null); setForm(EMPTY); setImagesText(""); setOpen(true);
  };
  const openEdit = (p) => {
    setEditing(p.id);
    setForm({
      slug: p.slug, sku: p.sku, brand_id: p.brand?.id || "", category_id: p.category?.id || "",
      name_fr: p.name_fr, name_en: p.name_en, description_fr: p.description_fr || "", description_en: p.description_en || "",
      price_eur: p.prices.EUR.compare_at || p.prices.EUR.price, price_usd: null, price_xof: null,
      sale_price_eur: p.on_sale ? p.prices.EUR.price : null,
      is_new: p.is_new, is_featured: p.is_featured, is_best_seller: p.is_best_seller,
      club: p.club || "", national_team: p.national_team || "", surface: p.surface || "",
      product_type: p.product_type || "", colors: p.colors || [], customizable: p.customizable,
      customization_price_eur: p.customization_price_eur || 0, published: p.published,
      images: p.images || [], variants: (p.variants || []).map((v) => ({ id: v.id, size: v.size, color: v.color, sku: v.sku, stock: v.stock, extra_price_eur: v.extra_price_eur })),
    });
    setImagesText((p.images || []).join("\n"));
    setOpen(true);
  };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const addVariant = () => setF("variants", [...form.variants, { size: "", color: "", sku: "", stock: 0, extra_price_eur: 0 }]);
  const updVariant = (i, k, v) => setF("variants", form.variants.map((x, idx) => idx === i ? { ...x, [k]: v } : x));
  const delVariant = (i) => setF("variants", form.variants.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    const payload = {
      ...form,
      price_eur: parseFloat(form.price_eur) || 0,
      sale_price_eur: form.sale_price_eur ? parseFloat(form.sale_price_eur) : null,
      customization_price_eur: parseFloat(form.customization_price_eur) || 0,
      brand_id: form.brand_id || null, category_id: form.category_id || null,
      images: imagesText.split("\n").map((s) => s.trim()).filter(Boolean),
      variants: form.variants.map((v) => ({ ...v, stock: parseInt(v.stock) || 0, extra_price_eur: parseFloat(v.extra_price_eur) || 0 })),
    };
    try {
      if (editing) await api.put(`/admin/products/${editing}`, payload);
      else await api.post("/admin/products", payload);
      toast.success("Produit enregistre"); setOpen(false); load();
    } catch (e) { toast.error(apiError(e)); }
    setSaving(false);
  };

  const archive = async (id) => {
    if (!window.confirm("Archiver ce produit ?")) return;
    await api.delete(`/admin/products/${id}`); toast.success("Archive"); load();
  };

  return (
    <div data-testid="admin-products">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold uppercase">Produits</h1>
        <Button onClick={openNew} data-testid="new-product-btn" className="bg-brand hover:bg-brand-dark rounded-none"><Plus className="w-4 h-4 mr-1" /> Nouveau</Button>
      </div>

      <div className="bg-white border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
            <tr><th className="p-3">Produit</th><th className="p-3">Marque</th><th className="p-3">Prix EUR</th><th className="p-3">Stock</th><th className="p-3">Statut</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const stock = (p.variants || []).reduce((s, v) => s + v.stock, 0);
              return (
                <tr key={p.id} className="border-t border-border" data-testid={`admin-product-${p.slug}`}>
                  <td className="p-3 flex items-center gap-2"><img src={p.images?.[0]} alt="" className="w-8 h-10 object-cover" />{p.name_fr}</td>
                  <td className="p-3">{p.brand?.name}</td>
                  <td className="p-3">{p.prices.EUR.price} €</td>
                  <td className="p-3">{stock}</td>
                  <td className="p-3">{p.published ? <span className="text-green-600">Publie</span> : <span className="text-ink-muted">Archive</span>}</td>
                  <td className="p-3 flex gap-2">
                    <button onClick={() => openEdit(p)} data-testid={`edit-product-${p.slug}`} className="text-ink hover:text-brand"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => archive(p.id)} className="text-ink hover:text-brand"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>{editing ? "Modifier" : "Nouveau"} produit</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Slug</Label><Input value={form.slug} onChange={(e) => setF("slug", e.target.value)} data-testid="pf-slug" /></div>
              <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setF("sku", e.target.value)} /></div>
              <div><Label>Nom FR</Label><Input value={form.name_fr} onChange={(e) => setF("name_fr", e.target.value)} data-testid="pf-name-fr" /></div>
              <div><Label>Nom EN</Label><Input value={form.name_en} onChange={(e) => setF("name_en", e.target.value)} data-testid="pf-name-en" /></div>
              <div>
                <Label>Marque</Label>
                <select value={form.brand_id} onChange={(e) => setF("brand_id", e.target.value)} className="w-full border border-border h-10 px-2">
                  <option value="">-</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Categorie</Label>
                <select value={form.category_id} onChange={(e) => setF("category_id", e.target.value)} className="w-full border border-border h-10 px-2">
                  <option value="">-</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name_fr}</option>)}
                </select>
              </div>
              <div><Label>Prix EUR</Label><Input type="number" value={form.price_eur} onChange={(e) => setF("price_eur", e.target.value)} data-testid="pf-price" /></div>
              <div><Label>Prix promo EUR</Label><Input type="number" value={form.sale_price_eur || ""} onChange={(e) => setF("sale_price_eur", e.target.value || null)} /></div>
              <div><Label>Club</Label><Input value={form.club} onChange={(e) => setF("club", e.target.value)} /></div>
              <div><Label>Selection</Label><Input value={form.national_team} onChange={(e) => setF("national_team", e.target.value)} /></div>
              <div><Label>Surface</Label><Input value={form.surface} onChange={(e) => setF("surface", e.target.value)} placeholder="FG/AG/..." /></div>
              <div><Label>Type</Label><Input value={form.product_type} onChange={(e) => setF("product_type", e.target.value)} /></div>
            </div>
            <div><Label>Description FR</Label><Textarea value={form.description_fr} onChange={(e) => setF("description_fr", e.target.value)} /></div>
            <div><Label>Description EN</Label><Textarea value={form.description_en} onChange={(e) => setF("description_en", e.target.value)} /></div>
            <div><Label>Images (une URL par ligne)</Label><Textarea value={imagesText} onChange={(e) => setImagesText(e.target.value)} rows={3} data-testid="pf-images" /></div>
            <div className="flex flex-wrap gap-4 text-sm">
              {[["is_new", "Nouveau"], ["is_featured", "En vedette"], ["is_best_seller", "Best seller"], ["customizable", "Personnalisable"], ["published", "Publie"]].map(([k, l]) => (
                <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={form[k]} onChange={(e) => setF(k, e.target.checked)} /> {l}</label>
              ))}
            </div>
            {form.customizable && <div><Label>Prix personnalisation EUR</Label><Input type="number" value={form.customization_price_eur} onChange={(e) => setF("customization_price_eur", e.target.value)} /></div>}

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Variantes (taille / stock)</Label>
                <Button type="button" onClick={addVariant} variant="outline" size="sm" className="rounded-none" data-testid="add-variant-btn"><Plus className="w-3 h-3" /></Button>
              </div>
              {form.variants.map((v, i) => (
                <div key={i} className="flex gap-2 mb-2 items-center">
                  <Input placeholder="Taille" value={v.size} onChange={(e) => updVariant(i, "size", e.target.value)} className="w-24" data-testid={`variant-size-${i}`} />
                  <Input placeholder="Couleur" value={v.color} onChange={(e) => updVariant(i, "color", e.target.value)} className="w-28" />
                  <Input placeholder="Stock" type="number" value={v.stock} onChange={(e) => updVariant(i, "stock", e.target.value)} className="w-20" data-testid={`variant-stock-${i}`} />
                  <button onClick={() => delVariant(i)} className="text-brand"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>

            <Button onClick={save} disabled={saving} data-testid="save-product-btn" className="w-full bg-ink hover:bg-ink/90 rounded-none">{saving ? "..." : "Enregistrer"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
