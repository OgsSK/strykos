import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImageGalleryUploader, SingleMediaUploader } from "@/components/admin/MediaUploader";
import { mediaSrc, downloadCsv } from "@/lib/adminUtils";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Copy, Eye, EyeOff, Search, Download } from "lucide-react";

const EMPTY = {
  slug: "", sku: "", brand_id: "", category_id: "", name_fr: "", name_en: "",
  description_fr: "", description_en: "", price_eur: "", price_usd: "", price_xof: "",
  sale_price_eur: "", is_new: false, is_featured: false, is_best_seller: false,
  gender: "", sport: "",
  club: "", national_team: "", surface: "", product_type: "", colors: "",
  customizable: false, customization_price_eur: 0, video_url: "", published: true, images: [], variants: [],
};
const SIZE_PRESETS = { jersey: ["XS", "S", "M", "L", "XL", "XXL"], boots: ["39", "40", "41", "42", "43", "44", "45"], kids: ["6A", "8A", "10A", "12A", "14A"] };
const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const numOrNull = (v) => (v === "" || v === null || v === undefined ? null : parseFloat(v));

export default function AdminProducts() {
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [stockFilter, setStockFilter] = useState(params.get("stock") || "all");
  const [taxonomies, setTaxonomies] = useState({ genders: [], sports: [] });

  const load = () => api.get("/admin/products").then((r) => setProducts(r.data)).catch(() => {});
  useEffect(() => {
    load();
    api.get("/admin/brands").then((r) => setBrands(r.data)).catch(() => {});
    api.get("/admin/categories").then((r) => setCats(r.data)).catch(() => {});
    if (params.get("new")) { openNew(); setParams({}); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.get("/taxonomies").then((r) => setTaxonomies(r.data)).catch(() => {});
  }, []);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (p) => {
    setEditing(p.id);
    setForm({
      slug: p.slug, sku: p.sku || "", brand_id: p.brand?.id || "", category_id: p.category?.id || "",
      name_fr: p.name_fr, name_en: p.name_en, description_fr: p.description_fr || "", description_en: p.description_en || "",
      price_eur: p.price_eur ?? "", price_usd: p.price_usd ?? "", price_xof: p.price_xof ?? "", sale_price_eur: p.sale_price_eur ?? "",
      is_new: p.is_new, is_featured: p.is_featured, is_best_seller: p.is_best_seller,
      gender: p.gender || "", sport: p.sport || "",
      club: p.club || "", national_team: p.national_team || "", surface: p.surface || "",
      product_type: p.product_type || "", colors: (p.colors || []).join(", "), customizable: p.customizable,
      customization_price_eur: p.customization_price_eur || 0, video_url: p.video_url || "", published: p.published,
      images: p.images || [], variants: (p.variants || []).map((v) => ({ id: v.id, size: v.size, color: v.color, sku: v.sku, stock: v.stock, extra_price_eur: v.extra_price_eur })),
    });
    setOpen(true);
  };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const addVariant = (size = "") => setF("variants", [...form.variants, { size, color: "", sku: "", stock: 0, extra_price_eur: 0 }]);
  const addPreset = (key) => setF("variants", [...form.variants, ...SIZE_PRESETS[key].filter((s) => !form.variants.some((v) => v.size === s)).map((size) => ({ size, color: "", sku: "", stock: 0, extra_price_eur: 0 }))]);
  const updVariant = (i, k, v) => setF("variants", form.variants.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  const delVariant = (i) => setF("variants", form.variants.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!form.name_fr || !form.name_en || form.price_eur === "") return toast.error("Nom FR/EN et prix EUR requis");
    setSaving(true);
    const payload = {
      ...form,
      slug: form.slug || slugify(form.name_fr),
      gender: form.gender || "", sport: form.sport || "",
      price_eur: parseFloat(form.price_eur) || 0,
      price_usd: numOrNull(form.price_usd), price_xof: numOrNull(form.price_xof), sale_price_eur: numOrNull(form.sale_price_eur),
      customization_price_eur: parseFloat(form.customization_price_eur) || 0,
      brand_id: form.brand_id || null, category_id: form.category_id || null,
      colors: String(form.colors).split(",").map((s) => s.trim()).filter(Boolean),
      variants: form.variants.map((v) => ({ ...v, stock: parseInt(v.stock) || 0, extra_price_eur: parseFloat(v.extra_price_eur) || 0 })),
    };
    try {
      if (editing) await api.put(`/admin/products/${editing}`, payload);
      else await api.post("/admin/products", payload);
      toast.success("Produit enregistre"); setOpen(false); load();
    } catch (e) { toast.error(apiError(e)); }
    setSaving(false);
  };

  const togglePublish = async (p) => {
    try { await api.put(`/admin/products/${p.id}/publish`, { published: !p.published }); load(); } catch (e) { toast.error(apiError(e)); }
  };
  const duplicate = async (p) => {
    try { await api.post(`/admin/products/${p.id}/duplicate`); toast.success("Produit duplique (brouillon)"); load(); } catch (e) { toast.error(apiError(e)); }
  };
  const remove = async (p) => {
    if (!window.confirm(`Supprimer definitivement "${p.name_fr}" ? Cette action est irreversible.`)) return;
    try { await api.delete(`/admin/products/${p.id}?hard=true`); toast.success("Produit supprime"); load(); } catch (e) { toast.error(apiError(e)); }
  };

  const filtered = products.filter((p) => {
    const stock = (p.variants || []).reduce((s, v) => s + v.stock, 0);
    if (stockFilter === "out" && stock > 0) return false;
    if (stockFilter === "low" && (stock === 0 || stock > 5)) return false;
    if (stockFilter === "draft" && p.published) return false;
    if (q && !`${p.name_fr} ${p.name_en} ${p.sku} ${p.brand?.name} ${p.club}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div data-testid="admin-products">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="font-heading text-2xl font-bold uppercase">Produits <span className="text-ink-muted text-base font-normal">({filtered.length})</span></h1>
        <div className="flex gap-2">
          <button onClick={() => downloadCsv("/admin/export/stock.csv", "strykos-stock.csv").catch(() => toast.error("Export impossible"))} className="inline-flex items-center gap-1 border border-ink px-3 py-2 text-sm font-semibold hover:bg-ink hover:text-white transition-colors" data-testid="export-stock-csv"><Download className="w-4 h-4" /> Export stock CSV</button>
          <Button onClick={openNew} data-testid="new-product-btn" className="bg-brand hover:bg-brand-dark rounded-none"><Plus className="w-4 h-4 mr-1" /> Nouveau produit</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2 top-3 text-ink-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher nom, SKU, marque, club..." className="pl-8" data-testid="product-search" />
        </div>
        <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} className="border border-border h-10 px-2 text-sm bg-white" data-testid="product-stock-filter">
          <option value="all">Tous</option><option value="out">Ruptures</option><option value="low">Stock faible (≤5)</option><option value="draft">Non publies</option>
        </select>
      </div>

      <div className="bg-white border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
            <tr><th className="p-3">Produit</th><th className="p-3 hidden md:table-cell">Marque</th><th className="p-3">Prix EUR</th><th className="p-3">Stock</th><th className="p-3 hidden sm:table-cell">Ventes</th><th className="p-3">Statut</th><th className="p-3 text-right">Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const stock = (p.variants || []).reduce((s, v) => s + v.stock, 0);
              return (
                <tr key={p.id} className="border-t border-border hover:bg-secondary/50" data-testid={`admin-product-${p.slug}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <img src={mediaSrc(p.images?.[0])} alt="" className="w-10 h-12 object-cover bg-secondary" />
                      <div><div className="font-medium">{p.name_fr}</div><div className="text-xs text-ink-muted">{p.sku || p.slug}</div></div>
                    </div>
                  </td>
                  <td className="p-3 hidden md:table-cell">{p.brand?.name}</td>
                  <td className="p-3">{p.on_sale ? <><span className="text-brand font-semibold">{p.prices.EUR.price} €</span> <s className="text-xs text-ink-muted">{p.prices.EUR.compare_at} €</s></> : `${p.prices.EUR.price} €`}</td>
                  <td className={`p-3 font-semibold ${stock === 0 ? "text-red-600" : stock <= 5 ? "text-amber-600" : ""}`}>{stock}</td>
                  <td className="p-3 hidden sm:table-cell">{p.sales_count}</td>
                  <td className="p-3">
                    <button onClick={() => togglePublish(p)} data-testid={`toggle-publish-${p.slug}`} className={`text-xs px-2 py-0.5 ${p.published ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>{p.published ? "Publie" : "Brouillon"}</button>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(p)} data-testid={`edit-product-${p.slug}`} title="Modifier" className="p-1.5 hover:bg-secondary"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => duplicate(p)} title="Dupliquer" className="p-1.5 hover:bg-secondary"><Copy className="w-4 h-4" /></button>
                      <button onClick={() => togglePublish(p)} title={p.published ? "Depublier" : "Publier"} className="p-1.5 hover:bg-secondary">{p.published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                      <button onClick={() => remove(p)} data-testid={`delete-product-${p.slug}`} title="Supprimer" className="p-1.5 hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-ink-muted">Aucun produit</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-auto">
          <DialogHeader><DialogTitle>{editing ? "Modifier le produit" : "Nouveau produit"}</DialogTitle></DialogHeader>
          <div className="space-y-5">
            <section>
              <h4 className="text-xs uppercase tracking-wider text-ink-muted mb-2">Informations</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><Label>Nom FR *</Label><Input value={form.name_fr} onChange={(e) => { setF("name_fr", e.target.value); if (!editing && !form.slug) setF("slug", slugify(e.target.value)); }} data-testid="pf-name-fr" /></div>
                <div><Label>Nom EN *</Label><Input value={form.name_en} onChange={(e) => setF("name_en", e.target.value)} data-testid="pf-name-en" /></div>
                <div><Label>Slug (URL)</Label><Input value={form.slug} onChange={(e) => setF("slug", e.target.value)} data-testid="pf-slug" placeholder="genere automatiquement" /></div>
                <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setF("sku", e.target.value)} /></div>
                <div>
                  <Label>Marque</Label>
                  <select value={form.brand_id} onChange={(e) => setF("brand_id", e.target.value)} className="w-full border border-border h-10 px-2 bg-white" data-testid="pf-brand">
                    <option value="">-</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Categorie</Label>
                  <select value={form.category_id} onChange={(e) => setF("category_id", e.target.value)} className="w-full border border-border h-10 px-2 bg-white" data-testid="pf-category">
                    <option value="">-</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name_fr}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Genre</Label>
                  <select
                    value={form.gender}
                    onChange={(e) => setF("gender", e.target.value)}
                    className="w-full border border-border h-10 px-2 bg-white text-sm"
                    data-testid="pf-gender"
                  >
                    <option value="">—</option>
                    {taxonomies.genders.map((g) => (
                      <option key={g.value} value={g.value}>{g.name_fr}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Sport</Label>
                  <select
                    value={form.sport}
                    onChange={(e) => setF("sport", e.target.value)}
                    className="w-full border border-border h-10 px-2 bg-white text-sm"
                    data-testid="pf-sport"
                  >
                    <option value="">—</option>
                    {taxonomies.sports.map((s) => (
                      <option key={s.value} value={s.value}>{s.name_fr}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section>
              <h4 className="text-xs uppercase tracking-wider text-ink-muted mb-2">Prix</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div><Label>Prix EUR *</Label><Input type="number" step="0.01" value={form.price_eur} onChange={(e) => setF("price_eur", e.target.value)} data-testid="pf-price" /></div>
                <div><Label>Prix promo EUR</Label><Input type="number" step="0.01" value={form.sale_price_eur} onChange={(e) => setF("sale_price_eur", e.target.value)} data-testid="pf-sale-price" /></div>
                <div><Label>Prix USD manuel</Label><Input type="number" step="0.01" value={form.price_usd} onChange={(e) => setF("price_usd", e.target.value)} placeholder="auto" /></div>
                <div><Label>Prix XOF manuel</Label><Input type="number" step="1" value={form.price_xof} onChange={(e) => setF("price_xof", e.target.value)} placeholder="auto" /></div>
              </div>
              <p className="text-[11px] text-ink-muted mt-1">Laisser USD/XOF vides pour une conversion automatique via les taux (Parametres).</p>
            </section>

            <section>
              <h4 className="text-xs uppercase tracking-wider text-ink-muted mb-2">Images</h4>
              <ImageGalleryUploader value={form.images} onChange={(imgs) => setF("images", imgs)} testid="pf-gallery" />
            </section>

            <section>
              <h4 className="text-xs uppercase tracking-wider text-ink-muted mb-2">Video (optionnel)</h4>
              <SingleMediaUploader value={form.video_url} onChange={(v) => setF("video_url", v)} accept="video/mp4,video/webm,video/quicktime" kind="video" label="une video" testid="pf-video" />
              <p className="text-[11px] text-ink-muted mt-1">MP4/WEBM/MOV jusqu'a 300 Mo, envoi par morceaux.</p>
            </section>

            <section>
              <h4 className="text-xs uppercase tracking-wider text-ink-muted mb-2">Descriptions</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><Label>Description FR</Label><Textarea rows={4} value={form.description_fr} onChange={(e) => setF("description_fr", e.target.value)} /></div>
                <div><Label>Description EN</Label><Textarea rows={4} value={form.description_en} onChange={(e) => setF("description_en", e.target.value)} /></div>
              </div>
            </section>

            <section>
              <h4 className="text-xs uppercase tracking-wider text-ink-muted mb-2">Attributs football</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div><Label>Club</Label><Input value={form.club} onChange={(e) => setF("club", e.target.value)} /></div>
                <div><Label>Selection nationale</Label><Input value={form.national_team} onChange={(e) => setF("national_team", e.target.value)} /></div>
                <div><Label>Surface</Label><Input value={form.surface} onChange={(e) => setF("surface", e.target.value)} placeholder="FG / AG / TF / IC" /></div>
                <div><Label>Type</Label><Input value={form.product_type} onChange={(e) => setF("product_type", e.target.value)} placeholder="home / away / ball..." /></div>
                <div className="col-span-2"><Label>Couleurs (separees par des virgules)</Label><Input value={form.colors} onChange={(e) => setF("colors", e.target.value)} placeholder="Rouge, Blanc" /></div>
              </div>
            </section>

            <section>
              <h4 className="text-xs uppercase tracking-wider text-ink-muted mb-2">Options</h4>
              <div className="flex flex-wrap gap-4 text-sm">
                {[["is_new", "Nouveaute"], ["is_featured", "En vedette (accueil)"], ["is_best_seller", "Best seller"], ["customizable", "Personnalisable (nom/numero)"], ["published", "Publie"]].map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={form[k]} onChange={(e) => setF(k, e.target.checked)} data-testid={`pf-${k}`} /> {l}</label>
                ))}
              </div>
              {form.customizable && <div className="mt-2 max-w-xs"><Label>Prix personnalisation EUR</Label><Input type="number" step="0.01" value={form.customization_price_eur} onChange={(e) => setF("customization_price_eur", e.target.value)} /></div>}
            </section>

            <section>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h4 className="text-xs uppercase tracking-wider text-ink-muted">Variantes & stock</h4>
                <div className="flex gap-1 flex-wrap">
                  <button type="button" onClick={() => addPreset("jersey")} className="text-xs border border-border px-2 py-1 hover:bg-secondary">+ Tailles maillot</button>
                  <button type="button" onClick={() => addPreset("boots")} className="text-xs border border-border px-2 py-1 hover:bg-secondary">+ Pointures</button>
                  <button type="button" onClick={() => addPreset("kids")} className="text-xs border border-border px-2 py-1 hover:bg-secondary">+ Enfant</button>
                  <Button type="button" onClick={() => addVariant()} variant="outline" size="sm" className="rounded-none h-7" data-testid="add-variant-btn"><Plus className="w-3 h-3" /></Button>
                </div>
              </div>
              {form.variants.length === 0 && <p className="text-xs text-amber-600">Ajoutez au moins une variante pour rendre le produit achetable.</p>}
              {form.variants.map((v, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_80px_90px_32px] gap-2 mb-2 items-center">
                  <Input placeholder="Taille" value={v.size} onChange={(e) => updVariant(i, "size", e.target.value)} data-testid={`variant-size-${i}`} />
                  <Input placeholder="Couleur" value={v.color} onChange={(e) => updVariant(i, "color", e.target.value)} />
                  <Input placeholder="SKU variante" value={v.sku} onChange={(e) => updVariant(i, "sku", e.target.value)} />
                  <Input placeholder="Stock" type="number" value={v.stock} onChange={(e) => updVariant(i, "stock", e.target.value)} data-testid={`variant-stock-${i}`} />
                  <Input placeholder="+€" type="number" step="0.01" value={v.extra_price_eur} onChange={(e) => updVariant(i, "extra_price_eur", e.target.value)} title="Supplement EUR" />
                  <button type="button" onClick={() => delVariant(i)} className="text-brand"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </section>

            <div className="flex gap-2 sticky bottom-0 bg-white pt-3 border-t border-border">
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-none">Annuler</Button>
              <Button onClick={save} disabled={saving} data-testid="save-product-btn" className="flex-1 bg-ink hover:bg-ink/90 rounded-none">{saving ? "Enregistrement..." : "Enregistrer le produit"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}