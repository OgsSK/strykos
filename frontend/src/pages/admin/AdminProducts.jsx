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
import {
  Plus, Trash2, Pencil, Copy, Eye, EyeOff, Search, Download,
  ArrowUp, ArrowDown, Wand2, ChevronDown, Banknote
} from "lucide-react";

// ⭐ Devise principale = FCFA. L'EUR est calculé automatiquement pour Stripe.
const XOF_RATE = 655.957;

const xofToEur = (xof) => {
  if (xof === "" || xof === null || xof === undefined) return "";
  const n = parseFloat(xof);
  if (isNaN(n)) return "";
  return Math.round((n / XOF_RATE) * 100) / 100;
};

const eurToXof = (eur) => {
  if (eur === "" || eur === null || eur === undefined) return "";
  const n = parseFloat(eur);
  if (isNaN(n)) return "";
  return Math.round(n * XOF_RATE);
};

const EMPTY = {
  slug: "", sku: "", brand_id: "", category_id: "", name_fr: "", name_en: "",
  description_fr: "", description_en: "",
  price_eur: "", price_usd: "", price_xof: "",
  sale_price_eur: "", sale_price_xof: "",   // ⭐ nouveau champ
  is_new: false, is_featured: false, is_best_seller: false,
  gender: "", sport: "",
  product_type: "", colors: "",
  customizable: false, customization_price_eur: 0, customization_fields: [],
  cta_label: "",   // ⭐ NOUVEAU : texte du bouton sur la home
  cod_allowed: true,   // ⭐ NOUVEAU : paiement à la livraison autorisé
  video_url: "", published: true, images: [], variants: [],
};

// Presets de portions
const SIZE_PRESETS = {
  cake: ["4 parts", "6 parts", "8 parts", "10 parts", "12 parts", "20 parts"],
  cupcake: ["x6", "x12", "x24", "x48"],
  macarons: ["x6", "x12", "x20", "x30"],
  tarte: ["4 parts", "6 parts", "8 parts", "10 parts"],
  cookie: ["x6", "x12", "x24"],
};

// ⭐ Presets de personnalisation
const CUSTOM_PRESETS = {
  birthday: {
    label_fr: "🎂 Anniversaire",
    label_en: "🎂 Birthday",
    fields: [
      {
        key: "message", type: "text", required: true, max_length: 30, price_eur: 0,
        label_fr: "Message sur le gâteau", label_en: "Message on the cake",
        placeholder_fr: "Joyeux anniversaire Léa !", placeholder_en: "Happy birthday Lea!",
        default_value: "", options: [],
      },
      {
        key: "age", type: "number", required: false, max_length: 3, price_eur: 0,
        label_fr: "Âge (pour les bougies)", label_en: "Age (for candles)",
        placeholder_fr: "8", placeholder_en: "8",
        default_value: "", options: [],
      },
    ],
  },
  wedding: {
    label_fr: "💍 Mariage",
    label_en: "💍 Wedding",
    fields: [
      {
        key: "message", type: "text", required: true, max_length: 40, price_eur: 0,
        label_fr: "Message des mariés", label_en: "Couple's message",
        placeholder_fr: "Julie & Marc - 12 juin 2026", placeholder_en: "Julie & Marc - June 12, 2026",
        default_value: "", options: [],
      },
      {
        key: "event_date", type: "date", required: false, max_length: 0, price_eur: 0,
        label_fr: "Date de l'événement", label_en: "Event date",
        placeholder_fr: "", placeholder_en: "",
        default_value: "", options: [],
      },
    ],
  },
  babyshower: {
    label_fr: "👶 Baby shower",
    label_en: "👶 Baby shower",
    fields: [
      {
        key: "baby_name", type: "text", required: true, max_length: 20, price_eur: 0,
        label_fr: "Prénom du bébé", label_en: "Baby's name",
        placeholder_fr: "Emma", placeholder_en: "Emma",
        default_value: "", options: [],
      },
      {
        key: "theme", type: "select", required: false, max_length: 0, price_eur: 0,
        label_fr: "Thème", label_en: "Theme",
        placeholder_fr: "", placeholder_en: "",
        default_value: "neutre",
        options: [
          { value: "neutre", label_fr: "Neutre", label_en: "Neutral" },
          { value: "fille",  label_fr: "Fille",  label_en: "Girl" },
          { value: "garcon", label_fr: "Garçon", label_en: "Boy" },
        ],
      },
    ],
  },
};

const FIELD_TYPES = [
  { value: "text",     label: "Texte court" },
  { value: "textarea", label: "Texte long" },
  { value: "number",   label: "Nombre" },
  { value: "date",     label: "Date" },
  { value: "select",   label: "Choix unique" },
];

const fmtXof = (amount) => {
  if (amount == null) return "";
  const rounded = Math.round(Number(amount) / 100) * 100;
  return `${rounded.toLocaleString("fr-FR")} FCFA`;
};
const fmtEur = (amount) => (amount == null ? "" : `${Number(amount).toFixed(2)} €`);

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
  const [showPresets, setShowPresets] = useState(false);

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
      price_eur: p.price_eur ?? "",
      price_xof: p.price_xof ?? (p.price_eur ? eurToXof(p.price_eur) : ""),
      price_usd: p.price_usd ?? "",
      sale_price_eur: p.sale_price_eur ?? "",
      sale_price_xof: p.sale_price_eur ? eurToXof(p.sale_price_eur) : (p.sale_price_xof ?? ""),
      is_new: p.is_new, is_featured: p.is_featured, is_best_seller: p.is_best_seller,
      gender: p.gender || "", sport: p.sport || "",
      product_type: p.product_type || "", colors: (p.colors || []).join(", "), customizable: p.customizable,
      customization_price_eur: p.customization_price_eur || 0,
      customization_fields: p.customization_fields || [],
      cta_label: p.cta_label || "",   // ⭐ NOUVEAU : mappe le libellé du bouton
      cod_allowed: p.cod_allowed !== false,   // ⭐ NOUVEAU : paiement à la livraison
      video_url: p.video_url || "", published: p.published,
      images: p.images || [],
      variants: (p.variants || []).map((v) => ({ id: v.id, size: v.size, color: v.color, sku: v.sku, stock: v.stock, extra_price_eur: v.extra_price_eur })),
    });
    setOpen(true);
  };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const addVariant = (size = "") => setF("variants", [...form.variants, { size, color: "", sku: "", stock: 0, extra_price_eur: 0 }]);
  const addPreset = (key) => setF("variants", [...form.variants, ...SIZE_PRESETS[key].filter((s) => !form.variants.some((v) => v.size === s)).map((size) => ({ size, color: "", sku: "", stock: 0, extra_price_eur: 0 }))]);
  const updVariant = (i, k, v) => setF("variants", form.variants.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  const delVariant = (i) => setF("variants", form.variants.filter((_, idx) => idx !== i));

  // ⭐ Gestion des champs de personnalisation
  const addCustomField = () => setF("customization_fields", [
    ...(form.customization_fields || []),
    {
      key: `field_${Date.now()}`,
      type: "text",
      required: false,
      max_length: 30,
      price_eur: 0,
      label_fr: "", label_en: "",
      placeholder_fr: "", placeholder_en: "",
      default_value: "", options: [],
    },
  ]);
  const updCustomField = (i, patch) => setF("customization_fields",
    (form.customization_fields || []).map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const delCustomField = (i) => setF("customization_fields",
    (form.customization_fields || []).filter((_, idx) => idx !== i));
  const moveCustomField = (i, dir) => {
    const arr = [...(form.customization_fields || [])];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setF("customization_fields", arr);
  };
  const applyCustomPreset = (key) => {
    const preset = CUSTOM_PRESETS[key];
    if (!preset) return;
    setF("customization_fields", [...(preset.fields || [])]);
    setF("customizable", true);
    setShowPresets(false);
    toast.success(`Preset « ${preset.label_fr} » appliqué`);
  };

  // ⭐ Options d'un champ "select"
  const addOption = (fieldIdx) => {
    const fields = [...(form.customization_fields || [])];
    const opts = [...(fields[fieldIdx].options || []), { value: "", label_fr: "", label_en: "" }];
    fields[fieldIdx] = { ...fields[fieldIdx], options: opts };
    setF("customization_fields", fields);
  };
  const updOption = (fieldIdx, optIdx, patch) => {
    const fields = [...(form.customization_fields || [])];
    const opts = (fields[fieldIdx].options || []).map((o, i) => (i === optIdx ? { ...o, ...patch } : o));
    fields[fieldIdx] = { ...fields[fieldIdx], options: opts };
    setF("customization_fields", fields);
  };
  const delOption = (fieldIdx, optIdx) => {
    const fields = [...(form.customization_fields || [])];
    const opts = (fields[fieldIdx].options || []).filter((_, i) => i !== optIdx);
    fields[fieldIdx] = { ...fields[fieldIdx], options: opts };
    setF("customization_fields", fields);
  };

  const save = async () => {
    if (!form.name_fr || !form.name_en || form.price_eur === "") return toast.error("Nom FR/EN et prix EUR requis");
    setSaving(true);
    const payload = {
      ...form,
      slug: form.slug || slugify(form.name_fr),
      gender: form.gender || "", sport: form.sport || "",
      price_eur: parseFloat(form.price_eur) || 0,
      price_usd: numOrNull(form.price_usd),
      price_xof: numOrNull(form.price_xof),
      sale_price_eur: numOrNull(form.sale_price_eur),
      sale_price_xof: numOrNull(form.sale_price_xof),   // ⭐ nouveau
      customization_price_eur: parseFloat(form.customization_price_eur) || 0,
      customization_fields: (form.customization_fields || []).map((f) => ({
        ...f,
        price_eur: parseFloat(f.price_eur) || 0,
        max_length: parseInt(f.max_length) || 0,
      })),
      // ⭐ NOUVEAU : normalisation cta_label (lowercase, trim, max 40 chars)
      cta_label: (form.cta_label || "").trim().toLowerCase().slice(0, 40),
      // ⭐ NOUVEAU : paiement à la livraison
      cod_allowed: form.cod_allowed !== false,
      brand_id: form.brand_id || null, category_id: form.category_id || null,
      colors: String(form.colors).split(",").map((s) => s.trim()).filter(Boolean),
      variants: form.variants.map((v) => ({ ...v, stock: parseInt(v.stock) || 0, extra_price_eur: parseFloat(v.extra_price_eur) || 0 })),
    };
    try {
      if (editing) await api.put(`/admin/products/${editing}`, payload);
      else await api.post("/admin/products", payload);
      toast.success("Produit enregistré"); setOpen(false); load();
    } catch (e) { toast.error(apiError(e)); }
    setSaving(false);
  };

  const togglePublish = async (p) => {
    try { await api.put(`/admin/products/${p.id}/publish`, { published: !p.published }); load(); } catch (e) { toast.error(apiError(e)); }
  };
  const duplicate = async (p) => {
    try { await api.post(`/admin/products/${p.id}/duplicate`); toast.success("Produit dupliqué (brouillon)"); load(); } catch (e) { toast.error(apiError(e)); }
  };
  const remove = async (p) => {
    if (!window.confirm(`Supprimer définitivement "${p.name_fr}" ? Cette action est irréversible.`)) return;
    try { await api.delete(`/admin/products/${p.id}?hard=true`); toast.success("Produit supprimé"); load(); } catch (e) { toast.error(apiError(e)); }
  };

  const filtered = products.filter((p) => {
    const stock = (p.variants || []).reduce((s, v) => s + v.stock, 0);
    if (stockFilter === "out" && stock > 0) return false;
    if (stockFilter === "low" && (stock === 0 || stock > 5)) return false;
    if (stockFilter === "draft" && p.published) return false;
    if (q && !`${p.name_fr} ${p.name_en} ${p.sku} ${p.brand?.name}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div data-testid="admin-products">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="font-heading text-2xl font-bold uppercase">
          Produits <span className="text-ink-muted text-base font-normal">({filtered.length})</span>
        </h1>
        <div className="flex gap-2">
          <button onClick={() => downloadCsv("/admin/export/stock.csv", "cakes-stock.csv").catch(() => toast.error("Export impossible"))} className="inline-flex items-center gap-1 border border-ink px-3 py-2 text-sm font-semibold hover:bg-ink hover:text-white transition-colors" data-testid="export-stock-csv">
            <Download className="w-4 h-4" /> Export stock CSV
          </button>
          <Button onClick={openNew} data-testid="new-product-btn" className="bg-brand hover:bg-brand-dark rounded-none">
            <Plus className="w-4 h-4 mr-1" /> Nouveau produit
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2 top-3 text-ink-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher nom, SKU, création, catégorie..." className="pl-8" data-testid="product-search" />
        </div>
        <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} className="border border-border h-10 px-2 text-sm bg-white" data-testid="product-stock-filter">
          <option value="all">Tous</option>
          <option value="out">Ruptures</option>
          <option value="low">Stock faible (≤5)</option>
          <option value="draft">Non publiés</option>
        </select>
      </div>

      <div className="bg-white border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3">Produit</th>
              <th className="p-3 hidden md:table-cell">Catégorie</th>
              <th className="p-3">Prix FCFA</th>
              <th className="p-3">Stock</th>
              <th className="p-3 hidden sm:table-cell">Ventes</th>
              <th className="p-3">Statut</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const stock = (p.variants || []).reduce((s, v) => s + v.stock, 0);
              const priceXof = p.prices?.XOF?.price ?? 0;
              const compareXof = p.prices?.XOF?.compare_at ?? null;
              return (
                <tr key={p.id} className="border-t border-border hover:bg-secondary/50" data-testid={`admin-product-${p.slug}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <img src={mediaSrc(p.images?.[0])} alt="" className="w-10 h-12 object-cover bg-secondary rounded" />
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {p.name_fr}
                          {/* ⭐ NOUVEAU : indicateur COD */}
                          {p.cod_allowed === false && (
                            <span className="text-[10px] uppercase tracking-wider bg-gray-100 text-gray-600 px-1.5 py-0.5 inline-flex items-center gap-1">
                              <Banknote className="w-2.5 h-2.5" /> Non-COD
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-ink-muted">{p.sku || p.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 hidden md:table-cell text-sm text-ink-soft">
                    {p.category?.name_fr || "—"}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {p.on_sale ? (
                      <>
                        <span className="text-brand font-semibold">{fmtXof(priceXof)}</span>{" "}
                        <s className="text-xs text-ink-muted">{fmtXof(compareXof)}</s>
                      </>
                    ) : (
                      <span className="font-medium">{fmtXof(priceXof)}</span>
                    )}
                    <div className="text-[10px] text-ink-muted mt-0.5">
                      {p.price_eur ? fmtEur(p.price_eur) : ""}
                    </div>
                  </td>
                  <td className={`p-3 font-semibold ${stock === 0 ? "text-red-600" : stock <= 5 ? "text-amber-600" : ""}`}>
                    {stock}
                  </td>
                  <td className="p-3 hidden sm:table-cell">{p.sales_count}</td>
                  <td className="p-3">
                    <button onClick={() => togglePublish(p)} data-testid={`toggle-publish-${p.slug}`} className={`text-xs px-2 py-0.5 ${p.published ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>
                      {p.published ? "Publié" : "Brouillon"}
                    </button>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(p)} data-testid={`edit-product-${p.slug}`} title="Modifier" className="p-1.5 hover:bg-secondary">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => duplicate(p)} title="Dupliquer" className="p-1.5 hover:bg-secondary">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={() => togglePublish(p)} title={p.published ? "Dépublier" : "Publier"} className="p-1.5 hover:bg-secondary">
                        {p.published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button onClick={() => remove(p)} data-testid={`delete-product-${p.slug}`} title="Supprimer" className="p-1.5 hover:bg-red-50 text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-ink-muted">Aucun produit</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le produit" : "Nouveau produit"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* === INFOS === */}
            <section>
              <h4 className="text-xs uppercase tracking-wider text-ink-muted mb-2">Informations</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Nom FR *</Label>
                  <Input value={form.name_fr} onChange={(e) => { setF("name_fr", e.target.value); if (!editing && !form.slug) setF("slug", slugify(e.target.value)); }} data-testid="pf-name-fr" />
                </div>
                <div>
                  <Label>Nom EN *</Label>
                  <Input value={form.name_en} onChange={(e) => setF("name_en", e.target.value)} data-testid="pf-name-en" />
                </div>
                <div>
                  <Label>Slug (URL)</Label>
                  <Input value={form.slug} onChange={(e) => setF("slug", e.target.value)} placeholder="genere automatiquement" />
                </div>
                <div>
                  <Label>SKU / Référence</Label>
                  <Input value={form.sku} onChange={(e) => setF("sku", e.target.value)} />
                </div>
                <div>
                  <Label>Création (marque / pâtissier)</Label>
                  <select value={form.brand_id} onChange={(e) => setF("brand_id", e.target.value)} className="w-full border border-border h-10 px-2 bg-white" data-testid="pf-brand">
                    <option value="">—</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Catégorie</Label>
                  <select value={form.category_id} onChange={(e) => setF("category_id", e.target.value)} className="w-full border border-border h-10 px-2 bg-white" data-testid="pf-category">
                    <option value="">—</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.name_fr}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Occasion</Label>
                  <select value={form.gender} onChange={(e) => setF("gender", e.target.value)} className="w-full border border-border h-10 px-2 bg-white text-sm" data-testid="pf-gender">
                    <option value="">—</option>
                    {(taxonomies.genders || []).map((g) => (
                      <option key={g.value} value={g.value}>{g.name_fr}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Saveur / Régime</Label>
                  <select value={form.sport} onChange={(e) => setF("sport", e.target.value)} className="w-full border border-border h-10 px-2 bg-white text-sm" data-testid="pf-sport">
                    <option value="">—</option>
                    {(taxonomies.sports || []).map((s) => (
                      <option key={s.value} value={s.value}>{s.name_fr}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* === PRIX === */}
            <section>
              <h4 className="text-xs uppercase tracking-wider text-ink-muted mb-2">Prix</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label>Prix FCFA * <span className="text-ink-muted font-normal">(affiché au client)</span></Label>
                  <Input
                    type="number"
                    step="100"
                    value={form.price_xof || ""}
                    onChange={(e) => {
                      const xof = e.target.value;
                      setF("price_xof", xof);
                      setF("price_eur", xofToEur(xof));
                    }}
                    placeholder="Ex: 25000"
                    data-testid="pf-price-xof"
                  />
                  {form.price_eur !== "" && (
                    <p className="text-[11px] text-ink-muted mt-1">
                      ≈ {form.price_eur} € <span className="italic">(technique Stripe)</span>
                    </p>
                  )}
                </div>
                <div>
                  <Label>Prix promo FCFA <span className="text-ink-muted font-normal">(optionnel)</span></Label>
                  <Input
                    type="number"
                    step="100"
                    value={form.sale_price_xof || ""}
                    onChange={(e) => {
                      const xof = e.target.value;
                      setF("sale_price_xof", xof);
                      setF("sale_price_eur", xofToEur(xof));
                    }}
                    placeholder="Ex: 20000"
                    data-testid="pf-sale-price-xof"
                  />
                  {form.sale_price_eur !== "" && (
                    <p className="text-[11px] text-ink-muted mt-1">
                      ≈ {form.sale_price_eur} €
                    </p>
                  )}
                </div>
                <div>
                  <Label>Prix USD manuel <span className="text-ink-muted font-normal">(optionnel)</span></Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.price_usd}
                    onChange={(e) => setF("price_usd", e.target.value)}
                    placeholder="auto"
                  />
                </div>
              </div>
              <p className="text-[11px] text-ink-muted mt-2">
                💡 Le prix FCFA est saisi manuellement. Il est converti automatiquement en EUR (pour Stripe) avec le taux actuel.
                Pour Stripe, le montant sera facturé dans la devise de charge (EUR) équivalente.
              </p>
            </section>

            {/* === IMAGES === */}
            <section>
              <h4 className="text-xs uppercase tracking-wider text-ink-muted mb-2">Photos du gâteau</h4>
              <ImageGalleryUploader value={form.images} onChange={(imgs) => setF("images", imgs)} testid="pf-gallery" />
            </section>

            {/* === VIDEO === */}
            <section>
              <h4 className="text-xs uppercase tracking-wider text-ink-muted mb-2">Vidéo (optionnel)</h4>
              <SingleMediaUploader value={form.video_url} onChange={(v) => setF("video_url", v)} accept="video/mp4,video/webm,video/quicktime" kind="video" label="une video" testid="pf-video" />
            </section>

            {/* === DESCRIPTIONS === */}
            <section>
              <h4 className="text-xs uppercase tracking-wider text-ink-muted mb-2">Descriptions</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Description FR</Label>
                  <Textarea rows={4} value={form.description_fr} onChange={(e) => setF("description_fr", e.target.value)} />
                </div>
                <div>
                  <Label>Description EN</Label>
                  <Textarea rows={4} value={form.description_en} onChange={(e) => setF("description_en", e.target.value)} />
                </div>
              </div>
            </section>

            {/* === ATTRIBUTS === */}
            <section>
              <h4 className="text-xs uppercase tracking-wider text-ink-muted mb-2">Attributs</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <Label>Type de produit</Label>
                  <Input value={form.product_type} onChange={(e) => setF("product_type", e.target.value)} placeholder="gâteau / cupcake / macaron" />
                </div>
                <div className="col-span-2">
                  <Label>Couleurs / Décorations (séparées par virgules)</Label>
                  <Input value={form.colors} onChange={(e) => setF("colors", e.target.value)} placeholder="Rose, Blanc, Doré" />
                </div>
              </div>
            </section>

            {/* === OPTIONS === */}
            <section>
              <h4 className="text-xs uppercase tracking-wider text-ink-muted mb-2">Options</h4>
              <div className="flex flex-wrap gap-4 text-sm">
                {[
                  ["is_new", "Nouveauté"],
                  ["is_featured", "En vedette (accueil)"],
                  ["is_best_seller", "Best seller"],
                  ["customizable", "Personnalisable"],
                  ["published", "Publié"],
                ].map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2">
                    <input type="checkbox" checked={form[k]} onChange={(e) => setF(k, e.target.checked)} data-testid={`pf-${k}`} /> {l}
                  </label>
                ))}
              </div>

              {/* ⭐ NOUVEAU : Paiement à la livraison */}
              <div className="mt-4">
                <label className="flex items-center gap-3 p-3 border border-border bg-secondary/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.cod_allowed !== false}
                    onChange={(e) => setF("cod_allowed", e.target.checked)}
                    data-testid="pf-cod-allowed"
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-sm inline-flex items-center gap-1.5">
                      <Banknote className="w-4 h-4 text-brand" />
                      Paiement à la livraison autorisé
                    </div>
                    <div className="text-xs text-ink-muted">
                      Le client peut payer ce produit en espèces à la réception.
                      Décochez pour l'exclure du paiement à la livraison.
                    </div>
                  </div>
                </label>
              </div>

              {/* ⭐ NOUVEAU : Texte du bouton (accueil) */}
              <div className="mt-4 max-w-md">
                <Label className="text-xs">
                  Texte du bouton sur l'accueil
                  <span className="text-ink-muted font-normal ml-1">(optionnel)</span>
                </Label>
                <select
                  value={form.cta_label || ""}
                  onChange={(e) => setF("cta_label", e.target.value)}
                  className="w-full border border-border h-10 px-2 bg-white text-sm mt-1"
                  data-testid="pf-cta-label"
                >
                  <option value="">🤖 Auto (recommandé)</option>
                  <option value="add_to_cart">🛒 Ajouter au panier</option>
                  <option value="choose">👀 Choisir</option>
                  <option value="customize">🎨 Personnaliser</option>
                  <option value="order">📝 Commander</option>
                  <option value="view">🔍 Voir le produit</option>
                </select>
                <p className="text-[11px] text-ink-muted mt-1">
                  <strong>Auto</strong> : affiche « Ajouter au panier » si le produit a 1 seule portion et pas de personnalisation,
                  sinon « Choisir » (redirige vers la fiche produit).
                </p>
              </div>
            </section>

            {/* ⭐ PERSONNALISATION === */}
            {form.customizable && (
              <section className="border-t border-border pt-4" data-testid="customization-editor">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs uppercase tracking-wider text-ink-muted">
                    🎨 Champs de personnalisation ({(form.customization_fields || []).length})
                  </h4>
                  <div className="flex gap-1">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowPresets(!showPresets)}
                        className="text-xs border border-border px-2 py-1 hover:bg-secondary inline-flex items-center gap-1"
                      >
                        <Wand2 className="w-3 h-3" /> Preset <ChevronDown className="w-3 h-3" />
                      </button>
                      {showPresets && (
                        <div className="absolute right-0 mt-1 bg-white border border-border shadow-lg z-10 min-w-[200px]">
                          {Object.entries(CUSTOM_PRESETS).map(([k, p]) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => applyCustomPreset(k)}
                              className="block w-full text-left px-3 py-2 text-xs hover:bg-secondary"
                            >
                              {p.label_fr}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={addCustomField}
                      className="text-xs border border-border px-2 py-1 hover:bg-secondary inline-flex items-center gap-1"
                      data-testid="add-custom-field"
                    >
                      <Plus className="w-3 h-3" /> Ajouter
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-ink-muted mb-3">
                  Chaque champ est proposé au client sur la fiche produit. Prix = surcoût cumulé par champ.
                </p>

                {(form.customization_fields || []).length === 0 && (
                  <p className="text-xs text-amber-600 italic">
                    Aucun champ. Cliquez sur « Ajouter » ou utilisez un preset.
                  </p>
                )}

                <div className="space-y-3">
                  {(form.customization_fields || []).map((f, i) => (
                    <div key={i} className="border border-border p-3 bg-secondary/30 space-y-2" data-testid={`custom-field-${i}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] uppercase tracking-wider font-semibold">
                          Champ {i + 1} — {f.label_fr || "(sans titre)"}
                        </span>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => moveCustomField(i, -1)} className="p-1 hover:bg-white" title="Monter"><ArrowUp className="w-3.5 h-3.5" /></button>
                          <button type="button" onClick={() => moveCustomField(i, 1)} className="p-1 hover:bg-white" title="Descendre"><ArrowDown className="w-3.5 h-3.5" /></button>
                          <button type="button" onClick={() => delCustomField(i)} className="p-1 text-red-600 hover:bg-white" title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Clé (identifiant)</Label>
                          <Input value={f.key || ""} onChange={(e) => updCustomField(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} placeholder="message" className="h-9 font-mono" />
                        </div>
                        <div>
                          <Label className="text-xs">Type</Label>
                          <select value={f.type || "text"} onChange={(e) => updCustomField(i, { type: e.target.value })} className="w-full border border-border h-9 px-2 bg-white text-sm">
                            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs">Prix supplément (FCFA)</Label>
                          <Input
                            type="number"
                            step="100"
                            value={f.price_xof || (f.price_eur ? eurToXof(f.price_eur) : "")}
                            onChange={(e) => {
                              const xof = e.target.value;
                              updCustomField(i, {
                                price_xof: xof,
                                price_eur: xofToEur(xof),
                              });
                            }}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Label FR</Label>
                          <Input value={f.label_fr || ""} onChange={(e) => updCustomField(i, { label_fr: e.target.value })} placeholder="Message sur le gâteau" className="h-9" />
                        </div>
                        <div>
                          <Label className="text-xs">Label EN</Label>
                          <Input value={f.label_en || ""} onChange={(e) => updCustomField(i, { label_en: e.target.value })} placeholder="Message on the cake" className="h-9" />
                        </div>
                        <div>
                          <Label className="text-xs">Longueur max</Label>
                          <Input type="number" value={f.max_length || 0} onChange={(e) => updCustomField(i, { max_length: e.target.value })} className="h-9" />
                        </div>
                        <div>
                          <Label className="text-xs">Placeholder FR</Label>
                          <Input value={f.placeholder_fr || ""} onChange={(e) => updCustomField(i, { placeholder_fr: e.target.value })} className="h-9" />
                        </div>
                        <div>
                          <Label className="text-xs">Placeholder EN</Label>
                          <Input value={f.placeholder_en || ""} onChange={(e) => updCustomField(i, { placeholder_en: e.target.value })} className="h-9" />
                        </div>
                        <div className="flex items-end">
                          <label className="flex items-center gap-2 text-xs h-9">
                            <input type="checkbox" checked={!!f.required} onChange={(e) => updCustomField(i, { required: e.target.checked })} />
                            Obligatoire
                          </label>
                        </div>
                      </div>

                      {/* Options (uniquement pour type "select") */}
                      {f.type === "select" && (
                        <div className="border-t border-border pt-2">
                          <div className="flex items-center justify-between mb-1">
                            <Label className="text-xs">Options du menu</Label>
                            <button type="button" onClick={() => addOption(i)} className="text-xs text-brand hover:underline">+ Option</button>
                          </div>
                          {(f.options || []).map((o, j) => (
                            <div key={j} className="grid grid-cols-[1fr_1fr_1fr_32px] gap-1 mb-1">
                              <Input value={o.value || ""} onChange={(e) => updOption(i, j, { value: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="rose" className="h-8 text-xs font-mono" />
                              <Input value={o.label_fr || ""} onChange={(e) => updOption(i, j, { label_fr: e.target.value })} placeholder="Rose" className="h-8 text-xs" />
                              <Input value={o.label_en || ""} onChange={(e) => updOption(i, j, { label_en: e.target.value })} placeholder="Pink" className="h-8 text-xs" />
                              <button type="button" onClick={() => delOption(i, j)} className="h-8 text-red-600 hover:bg-red-50 flex items-center justify-center">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* === VARIANTES === */}
            <section>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h4 className="text-xs uppercase tracking-wider text-ink-muted">
                  Portions / Formats & stock
                </h4>
                <div className="flex gap-1 flex-wrap">
                  <button type="button" onClick={() => addPreset("cake")} className="text-xs border border-border px-2 py-1 hover:bg-secondary">+ Parts gâteau</button>
                  <button type="button" onClick={() => addPreset("cupcake")} className="text-xs border border-border px-2 py-1 hover:bg-secondary">+ Cupcakes</button>
                  <button type="button" onClick={() => addPreset("macarons")} className="text-xs border border-border px-2 py-1 hover:bg-secondary">+ Macarons</button>
                  <button type="button" onClick={() => addPreset("tarte")} className="text-xs border border-border px-2 py-1 hover:bg-secondary">+ Tartes</button>
                  <Button type="button" onClick={() => addVariant()} variant="outline" size="sm" className="rounded-none h-7" data-testid="add-variant-btn">
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              {form.variants.length === 0 && (
                <p className="text-xs text-amber-600">
                  Ajoutez au moins une variante (format / portion) pour rendre le produit achetable.
                </p>
              )}
              {form.variants.map((v, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_80px_90px_32px] gap-2 mb-2 items-center">
                  <Input placeholder="Portion / Format" value={v.size} onChange={(e) => updVariant(i, "size", e.target.value)} data-testid={`variant-size-${i}`} />
                  <Input placeholder="Décoration" value={v.color} onChange={(e) => updVariant(i, "color", e.target.value)} />
                  <Input placeholder="Référence" value={v.sku} onChange={(e) => updVariant(i, "sku", e.target.value)} />
                  <Input placeholder="Stock" type="number" value={v.stock} onChange={(e) => updVariant(i, "stock", e.target.value)} data-testid={`variant-stock-${i}`} />
                  <Input
                    placeholder="+FCFA"
                    type="number"
                    step="100"
                    value={v.extra_price_xof || ""}
                    onChange={(e) => {
                      const xof = e.target.value;
                      updVariant(i, "extra_price_xof", xof);
                      updVariant(i, "extra_price_eur", xofToEur(xof));
                    }}
                    title="Supplément FCFA"
                  />
                  <button type="button" onClick={() => delVariant(i)} className="text-brand">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </section>

            {/* === ACTIONS === */}
            <div className="flex gap-2 sticky bottom-0 bg-white pt-3 border-t border-border">
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-none">
                Annuler
              </Button>
              <Button onClick={save} disabled={saving} data-testid="save-product-btn" className="flex-1 bg-ink hover:bg-ink/90 rounded-none">
                {saving ? "Enregistrement..." : "Enregistrer le produit"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}