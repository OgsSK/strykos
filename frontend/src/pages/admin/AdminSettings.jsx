import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HeroSlidesEditor, SectionsEditor, IconsEditor } from "@/components/admin/HomeMediaEditors";
import { SingleMediaUploader } from "@/components/admin/MediaUploader";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const Card = ({ title, children, onSave, testid, description }) => (
  <div className="bg-white border border-border" data-testid={testid}>
    <div className="p-5 border-b border-border">
      <h3 className="font-semibold uppercase text-sm">{title}</h3>
      {description && <p className="text-xs text-ink-muted mt-1">{description}</p>}
    </div>
    <div className="p-5">
      {children}
      {onSave && (
        <div className="mt-4 pt-4 border-t border-border">
          <Button onClick={onSave} className="bg-ink hover:bg-ink/90 rounded-none" data-testid={`${testid}-save`}>
            Enregistrer
          </Button>
        </div>
      )}
    </div>
  </div>
);

const COUNTRIES = [["ML", "Mali"], ["BE", "Belgique"], ["FR", "France"], ["SN", "Senegal"], ["CI", "Cote d'Ivoire"], ["BF", "Burkina Faso"], ["GN", "Guinee"], ["NE", "Niger"], ["DE", "Allemagne"], ["NL", "Pays-Bas"], ["ES", "Espagne"], ["IT", "Italie"], ["GB", "Royaume-Uni"], ["US", "Etats-Unis"], ["CA", "Canada"], ["MA", "Maroc"]];

export default function AdminSettings() {
  const [s, setS] = useState(null);
  const [tab, setTab] = useState("site");
  useEffect(() => { api.get("/admin/settings").then((r) => setS(r.data)).catch(() => {}); }, []);
  if (!s) return <div className="text-ink-muted">Chargement...</div>;

  const upd = (key, patch) => setS({ ...s, [key]: { ...s[key], ...patch } });
  const save = async (key, value) => {
    try { await api.put("/admin/settings", { key, value: value ?? s[key] }); toast.success("Parametres enregistres"); }
    catch (e) { toast.error(apiError(e)); }
  };
  const site = s.site || {}, hero = s.hero || {}, info = s.info_bar || {}, rates = s.currency?.rates || {}, methods = s.shipping?.methods || [], origins = s.shipping?.origins || [], providers = s.payment_providers || {}, cartReminders = s.cart_reminders || {}, taxonomies = s.taxonomies || {}, editorial = s.sections?.editorial || {};
  const setMethod = (i, patch) => upd("shipping", { methods: methods.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) });
  const setOrigin = (i, patch) => upd("shipping", { origins: origins.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) });
  const tabs = [["site", "Coordonnees"], ["hero", "Accueil & videos"], ["shipping", "Livraison"], ["taxonomies", "Taxonomies"], ["cart", "Relances panier"], ["currency", "Devises"], ["payments", "Paiements"]];

  return (
    <div data-testid="admin-settings" className="max-w-4xl">
      <h1 className="font-heading text-2xl font-bold uppercase mb-5">Parametres</h1>
      <div className="flex flex-wrap gap-1 mb-5 border-b border-border">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`settings-tab-${k}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "site" && (
        <Card title="Coordonnees de la boutique" onSave={() => save("site")} testid="settings-site">
          <div className="grid sm:grid-cols-2 gap-3">
            {/* === Marque (nom affiché partout) === */}
            <div className="sm:col-span-2 border border-border p-4 bg-secondary/30">
              <div className="text-xs uppercase tracking-wider font-semibold text-ink-muted mb-3">
                Nom de la marque (affiché partout sur le site et dans les e-mails)
              </div>

              {/* Aperçu live */}
              <div className="mb-4 flex items-center gap-3 border border-border bg-white p-3">
                <span className="text-xs uppercase tracking-wider text-ink-muted">Aperçu :</span>
                <span className="font-heading font-extrabold text-2xl tracking-tight">
                  {site.brand_part1 || "STRY"}
                  <span className="text-brand">{site.brand_part2 || "KOS"}</span>
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Nom — partie 1 (noire)</Label>
                  <Input
                    value={site.brand_part1 || ""}
                    onChange={(e) => upd("site", { brand_part1: e.target.value })}
                    placeholder="STRY"
                    data-testid="site-brand-part1"
                  />
                </div>
                <div>
                  <Label>Nom — partie 2 (rouge)</Label>
                  <Input
                    value={site.brand_part2 || ""}
                    onChange={(e) => upd("site", { brand_part2: e.target.value })}
                    placeholder="KOS"
                    data-testid="site-brand-part2"
                  />
                </div>
                <div>
                  <Label>Tagline FR</Label>
                  <Input
                    value={site.brand_tagline || ""}
                    onChange={(e) => upd("site", { brand_tagline: e.target.value })}
                    placeholder="Multimarque. Authentique. Livré chez vous."
                  />
                </div>
                <div>
                  <Label>Tagline EN</Label>
                  <Input
                    value={site.brand_tagline_en || ""}
                    onChange={(e) => upd("site", { brand_tagline_en: e.target.value })}
                    placeholder="Multi-brand. Authentic. Delivered to you."
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Nom complet (utilisé dans les e-mails, CGV, mentions légales)</Label>
                  <Input
                    value={site.name || ""}
                    onChange={(e) => upd("site", { name: e.target.value })}
                    placeholder="STRYKOS"
                    data-testid="site-name"
                  />
                  <p className="text-[11px] text-ink-muted mt-1">
                    Le texte "STRYKOS" dans les CGV / e-mails sera automatiquement remplacé par cette valeur.
                  </p>
                </div>
              </div>
            </div>

            <div><Label>E-mail de contact</Label><Input value={site.email || ""} onChange={(e) => upd("site", { email: e.target.value })} data-testid="site-email" /></div>
            <div><Label>Telephone</Label><Input value={site.phone || ""} onChange={(e) => upd("site", { phone: e.target.value })} data-testid="site-phone" /></div>
            <div><Label>WhatsApp (format international sans espaces)</Label><Input value={site.whatsapp || ""} onChange={(e) => upd("site", { whatsapp: e.target.value })} placeholder="+32465743661" /></div>
            <div><Label>Adresse FR</Label><Input value={site.address_fr || ""} onChange={(e) => upd("site", { address_fr: e.target.value })} /></div>
            <div><Label>Adresse EN</Label><Input value={site.address_en || ""} onChange={(e) => upd("site", { address_en: e.target.value })} /></div>
            <div><Label>Horaires FR</Label><Input value={site.hours_fr || ""} onChange={(e) => upd("site", { hours_fr: e.target.value })} /></div>
            <div><Label>Horaires EN</Label><Input value={site.hours_en || ""} onChange={(e) => upd("site", { hours_en: e.target.value })} /></div>
            {["instagram", "facebook", "tiktok"].map((k) => (
              <div key={k}><Label className="capitalize">{k}</Label><Input value={site.socials?.[k] || ""} onChange={(e) => upd("site", { socials: { ...(site.socials || {}), [k]: e.target.value } })} placeholder="https://..." /></div>
            ))}
          </div>
        </Card>
      )}

      {tab === "hero" && (
        <div className="space-y-5">
          <Card
            title="Banniere d'accueil - carrousel video (style Nike)"
            description="Faites defiler les slides qui s'affichent en haut de la page d'accueil. Cliquez sur un slide pour le deplier et le modifier."
            onSave={() => save("hero")}
            testid="settings-hero"
          >
            <HeroSlidesEditor hero={hero} onChange={(v) => setS({ ...s, hero: v })} />
          </Card>

          <Card
            title="Section « Nos essentiels » (vignettes + liens, style Nike)"
            description="Grand titre, vignettes rondes (jusqu'a 16) puis colonnes de liens. Utilisez le bouton compact pour changer une image rapidement."
            onSave={() => save("icons")}
            testid="settings-icons"
          >
            <IconsEditor icons={s.icons} onChange={(v) => setS({ ...s, icons: v })} />
          </Card>

          <Card
            title="Cartes editoriales des sections"
            description="Cartes qui apparaissent au-dessus des produits dans chaque section (Nouveautes, Promotions, etc.). Chaque section a sa propre carte repliable."
            onSave={() => save("sections")}
            testid="settings-sections"
          >
            <SectionsEditor sections={s.sections || {}} onChange={(v) => setS({ ...s, sections: v })} />
          </Card>

          <Card
            title="Section éditoriale (grande image + texte)"
            description="Bloc pleine largeur affiché sur la home entre les Nouveautés et les Promotions. Idéal pour du storytelling ou mettre en avant une collection."
            onSave={() => save("sections", { ...s.sections, editorial })}
            testid="settings-editorial"
          >
            <div className="space-y-4">
              <div>
                <Label>Image de fond</Label>
                <SingleMediaUploader
                  value={editorial.image_url || ""}
                  onChange={(v) => setS({ ...s, sections: { ...s.sections, editorial: { ...editorial, image_url: v } } })}
                  label="une image"
                  testid="editorial-image"
                />
                <p className="text-[11px] text-ink-muted mt-1">
                  Recommandé : image paysage 1200×800 minimum. Format JPG ou WEBP.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Titre FR</Label>
                  <Input
                    value={editorial.title_fr || ""}
                    onChange={(e) => setS({ ...s, sections: { ...s.sections, editorial: { ...editorial, title_fr: e.target.value } } })}
                    placeholder="L'ÉQUIPEMENT DES VRAIS JOUEURS"
                  />
                </div>
                <div>
                  <Label>Titre EN</Label>
                  <Input
                    value={editorial.title_en || ""}
                    onChange={(e) => setS({ ...s, sections: { ...s.sections, editorial: { ...editorial, title_en: e.target.value } } })}
                    placeholder="GEAR FOR REAL PLAYERS"
                  />
                </div>
                <div>
                  <Label>Sous-titre FR</Label>
                  <Textarea
                    rows={2}
                    value={editorial.subtitle_fr || ""}
                    onChange={(e) => setS({ ...s, sections: { ...s.sections, editorial: { ...editorial, subtitle_fr: e.target.value } } })}
                    placeholder="Maillots authentiques, chaussures et équipements des plus grandes marques."
                  />
                </div>
                <div>
                  <Label>Sous-titre EN</Label>
                  <Textarea
                    rows={2}
                    value={editorial.subtitle_en || ""}
                    onChange={(e) => setS({ ...s, sections: { ...s.sections, editorial: { ...editorial, subtitle_en: e.target.value } } })}
                    placeholder="Authentic jerseys, boots and gear from the biggest brands."
                  />
                </div>
                <div>
                  <Label>Bouton FR</Label>
                  <Input
                    value={editorial.cta_fr || ""}
                    onChange={(e) => setS({ ...s, sections: { ...s.sections, editorial: { ...editorial, cta_fr: e.target.value } } })}
                    placeholder="Découvrir le catalogue"
                  />
                </div>
                <div>
                  <Label>Bouton EN</Label>
                  <Input
                    value={editorial.cta_en || ""}
                    onChange={(e) => setS({ ...s, sections: { ...s.sections, editorial: { ...editorial, cta_en: e.target.value } } })}
                    placeholder="Shop now"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Lien du bouton</Label>
                  <Input
                    value={editorial.cta_link || ""}
                    onChange={(e) => setS({ ...s, sections: { ...s.sections, editorial: { ...editorial, cta_link: e.target.value } } })}
                    placeholder="/catalog"
                  />
                </div>
              </div>

              <p className="text-xs text-ink-muted bg-secondary/40 border border-border p-3">
                <strong>Astuce</strong> : si l'image est vide, la section affichera un dégradé noir + brand en attendant. Une fois l'image uploadée, elle s'affichera automatiquement.
              </p>
            </div>
          </Card>

          <Card title="Barre d'information" onSave={() => save("info_bar")} testid="settings-infobar">
            <label className="flex items-center gap-2 text-sm mb-3">
              <input type="checkbox" checked={!!info.enabled} onChange={(e) => upd("info_bar", { enabled: e.target.checked })} /> Activee
            </label>
            {[0, 1].map((i) => (
              <div key={i} className="grid sm:grid-cols-2 gap-3 mb-2">
                <div><Label>Message {i + 1} FR</Label><Input value={info.messages_fr?.[i] || ""} onChange={(e) => { const m = [...(info.messages_fr || ["", ""])]; m[i] = e.target.value; upd("info_bar", { messages_fr: m }); }} /></div>
                <div><Label>Message {i + 1} EN</Label><Input value={info.messages_en?.[i] || ""} onChange={(e) => { const m = [...(info.messages_en || ["", ""])]; m[i] = e.target.value; upd("info_bar", { messages_en: m }); }} /></div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === "shipping" && (
        <div className="space-y-5">
          <Card title="Modes de livraison" onSave={() => save("shipping")} testid="settings-shipping">
            <div className="space-y-3">
              {methods.map((m, i) => (
                <div key={i} className="border border-border p-3 grid grid-cols-2 sm:grid-cols-6 gap-2 items-end" data-testid={`shipping-method-${i}`}>
                  <div><Label className="text-xs">Pays</Label>
                    <select value={m.country} onChange={(e) => setMethod(i, { country: e.target.value, country_name: COUNTRIES.find((c) => c[0] === e.target.value)?.[1] || e.target.value })} className="w-full border border-border h-9 px-1 text-sm bg-white">
                      {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                    </select></div>
                  <div><Label className="text-xs">Nom FR</Label><Input value={m.name_fr} onChange={(e) => setMethod(i, { name_fr: e.target.value })} className="h-9" /></div>
                  <div><Label className="text-xs">Nom EN</Label><Input value={m.name_en} onChange={(e) => setMethod(i, { name_en: e.target.value })} className="h-9" /></div>
                  <div><Label className="text-xs">Cout EUR</Label><Input type="number" step="0.5" value={m.cost_eur} onChange={(e) => setMethod(i, { cost_eur: parseFloat(e.target.value) || 0 })} className="h-9" /></div>
                  <div><Label className="text-xs">Delai FR / EN</Label><div className="flex gap-1"><Input value={m.delay_fr} onChange={(e) => setMethod(i, { delay_fr: e.target.value })} className="h-9" /><Input value={m.delay_en} onChange={(e) => setMethod(i, { delay_en: e.target.value })} className="h-9" /></div></div>
                  <button onClick={() => upd("shipping", { methods: methods.filter((_, idx) => idx !== i) })} className="h-9 text-red-600 hover:bg-red-50 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <Button variant="outline" className="rounded-none" onClick={() => upd("shipping", { methods: [...methods, { country: "ML", country_name: "Mali", name_fr: "Nouveau mode", name_en: "New method", cost_eur: 5, delay_fr: "3-6 jours", delay_en: "3-6 days" }] })} data-testid="add-shipping-method">
                <Plus className="w-4 h-4 mr-1" /> Ajouter un mode
              </Button>
              <p className="text-xs text-ink-muted">Les pays sans mode defini recoivent la livraison internationale (15 EUR, 7-14 jours).</p>
            </div>
          </Card>

          <Card title="Adresses d'expédition (origines)" onSave={() => save("shipping", { methods, origins })} testid="settings-shipping-origins" description="Adresse depuis laquelle les commandes sont expédiées pour chaque pays. L'adresse du pays du client sera pré-remplie automatiquement dans les fiches commande.">
            <div className="space-y-3">
              {origins.map((o, i) => (
                <div key={i} className="border border-border p-3 space-y-3" data-testid={`shipping-origin-${i}`}>
                  <div className="grid sm:grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Pays</Label>
                      <select value={o.country} onChange={(e) => setOrigin(i, { country: e.target.value, country_name: COUNTRIES.find((c) => c[0] === e.target.value)?.[1] || e.target.value })} className="w-full border border-border h-9 px-1 text-sm bg-white">
                        {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Nom du dépôt</Label>
                      <Input value={o.name || ""} onChange={(e) => setOrigin(i, { name: e.target.value })} placeholder="Ex: Depot principal" className="h-9" />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm h-9">
                        <input type="checkbox" checked={!!o.is_default} onChange={(e) => setOrigin(i, { is_default: e.target.checked })} />
                        <span className="text-xs">Par defaut pour ce pays</span>
                      </label>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Adresse complète</Label>
                      <Input value={o.address_line || ""} onChange={(e) => setOrigin(i, { address_line: e.target.value })} placeholder="Rue, numéro" className="h-9" />
                    </div>
                    <div>
                      <Label className="text-xs">Code postal</Label>
                      <Input value={o.postal_code || ""} onChange={(e) => setOrigin(i, { postal_code: e.target.value })} className="h-9" />
                    </div>
                    <div>
                      <Label className="text-xs">Ville</Label>
                      <Input value={o.city || ""} onChange={(e) => setOrigin(i, { city: e.target.value })} className="h-9" />
                    </div>
                    <div>
                      <Label className="text-xs">Téléphone</Label>
                      <Input value={o.phone || ""} onChange={(e) => setOrigin(i, { phone: e.target.value })} className="h-9" />
                    </div>
                    <div>
                      <Label className="text-xs">Email</Label>
                      <Input value={o.email || ""} onChange={(e) => setOrigin(i, { email: e.target.value })} className="h-9" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Transporteurs disponibles (separes par virgule)</Label>
                    <Input
                      value={(o.carriers || []).join(", ")}
                      onChange={(e) => setOrigin(i, { carriers: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      placeholder="bpost, DHL, UPS, Coursier local"
                      className="h-9"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => upd("shipping", { origins: origins.filter((_, idx) => idx !== i) })} className="text-red-600 hover:bg-red-50 text-xs font-semibold inline-flex items-center gap-1 px-2 py-1">
                      <Trash2 className="w-3.5 h-3.5" /> Supprimer cette origine
                    </button>
                  </div>
                </div>
              ))}
              <Button variant="outline" className="rounded-none" onClick={() => upd("shipping", { origins: [...origins, { country: "ML", country_name: "Mali", name: "Nouveau depot", address_line: "", city: "", postal_code: "", phone: "", email: "", is_default: false, carriers: [] }] })} data-testid="add-shipping-origin">
                <Plus className="w-4 h-4 mr-1" /> Ajouter une origine
              </Button>
              <p className="text-xs text-ink-muted">L'origine par défaut d'un pays est utilisée lors de l'expédition d'une commande vers ce pays. Vous pourrez la changer au cas par cas dans chaque commande.</p>
            </div>
          </Card>
        </div>
      )}

      {tab === "taxonomies" && (
        <Card
          title="Taxonomies (genre et sport)"
          description="Les valeurs de ces listes alimentent les filtres du catalogue et les tuiles de la page d'accueil. Chaque valeur a un identifiant interne (non modifiable) et un libellé FR/EN."
          onSave={() => save("taxonomies", { genders: taxonomies.genders || [], sports: taxonomies.sports || [] })}
          testid="settings-taxonomies"
        >
          <div className="space-y-6">
            {["genders", "sports"].map((kind) => {
              const label = kind === "genders" ? "Genres" : "Sports";
              const items = taxonomies[kind] || [];

              const updItem = (i, patch) => {
                const copy = items.map((x, idx) => (idx === i ? { ...x, ...patch } : x));
                upd("taxonomies", { [kind]: copy });
              };
              const delItem = async (i) => {
                const it = items[i];
                // Verifie l'usage
                try {
                  const { data } = await api.get("/admin/taxonomies/usage");
                  const usage = (kind === "genders" ? data.genders : data.sports)?.[it.value] || 0;
                  if (usage > 0) {
                    if (!window.confirm(`${usage} produit(s) utilisent cette valeur. Supprimer quand même ? Les produits garderont la valeur mais elle n'apparaitra plus dans les filtres.`)) return;
                  } else {
                    if (!window.confirm(`Supprimer "${it.name_fr}" ?`)) return;
                  }
                } catch {
                  if (!window.confirm(`Supprimer "${it.name_fr}" ?`)) return;
                }
                upd("taxonomies", { [kind]: items.filter((_, idx) => idx !== i) });
              };
              const addItem = () => {
                const base = { value: "", name_fr: "", name_en: "", image_url: "" };
                upd("taxonomies", { [kind]: [...items, base] });
              };

              return (
                <div key={kind} className="border border-border p-4 bg-white">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold uppercase text-sm">{label} ({items.length})</h4>
                    <Button variant="outline" size="sm" className="rounded-none" onClick={addItem} data-testid={`add-taxonomy-${kind}`}>
                      <Plus className="w-4 h-4 mr-1" /> Ajouter
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {items.map((it, i) => (
                      <div key={i} className="border border-border p-3 grid sm:grid-cols-[1fr_1fr_1fr_1.5fr_32px] gap-2 items-end bg-secondary/30">
                        <div>
                          <Label className="text-xs">Identifiant</Label>
                          <Input value={it.value || ""} onChange={(e) => updItem(i, { value: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="homme" className="h-9 font-mono" />
                        </div>
                        <div>
                          <Label className="text-xs">Nom FR</Label>
                          <Input value={it.name_fr || ""} onChange={(e) => updItem(i, { name_fr: e.target.value })} placeholder="Homme" className="h-9" />
                        </div>
                        <div>
                          <Label className="text-xs">Nom EN</Label>
                          <Input value={it.name_en || ""} onChange={(e) => updItem(i, { name_en: e.target.value })} placeholder="Men" className="h-9" />
                        </div>
                        <div>
                          <Label className="text-xs">Image</Label>
                          <SingleMediaUploader
                            compact
                            value={it.image_url || ""}
                            onChange={(v) => updItem(i, { image_url: v })}
                            label="une image"
                            testid={`taxonomy-image-${kind}-${i}`}
                          />
                        </div>
                        <button type="button" onClick={() => delItem(i)} className="h-9 text-red-600 hover:bg-red-50 flex items-center justify-center" title="Supprimer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {items.length === 0 && <p className="text-xs text-ink-muted italic">Aucune valeur. Cliquez sur Ajouter.</p>}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-ink-muted">
              Astuce : laissez l'image vide pour un style fond noir dégradé, ou collez une URL d'image (Unsplash, votre propre CDN, etc.).
            </p>
          </div>
        </Card>
      )}

      {tab === "cart" && (
        <Card
          title="Relances panier abandonné"
          description="Envoi automatique d'emails aux clients qui n'ont pas finalisé leur commande."
          onSave={() => save("cart_reminders")}
          testid="settings-cart-reminders"
        >
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cartReminders.enabled !== false}
                onChange={(e) => upd("cart_reminders", { enabled: e.target.checked })}
                data-testid="cart-enabled"
              />
              <span className="font-medium">Activer les relances panier</span>
            </label>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Délai avant le 1er email (heures)</Label>
                <Input
                  type="number"
                  min={1}
                  max={72}
                  value={cartReminders.delay_1_hours ?? 4}
                  onChange={(e) => upd("cart_reminders", { delay_1_hours: parseInt(e.target.value) || 4 })}
                  className="mt-1"
                  data-testid="cart-delay-1"
                />
                <p className="text-[11px] text-ink-muted mt-1">Recommandé : 4h</p>
              </div>
              <div>
                <Label>Délai avant le 2e email (heures)</Label>
                <Input
                  type="number"
                  min={6}
                  max={168}
                  value={cartReminders.delay_2_hours ?? 24}
                  onChange={(e) => upd("cart_reminders", { delay_2_hours: parseInt(e.target.value) || 24 })}
                  className="mt-1"
                  data-testid="cart-delay-2"
                />
                <p className="text-[11px] text-ink-muted mt-1">Recommandé : 24h</p>
              </div>
              <div>
                <Label>Nombre minimum d'articles</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={cartReminders.min_items ?? 1}
                  onChange={(e) => upd("cart_reminders", { min_items: parseInt(e.target.value) || 1 })}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <label className="flex items-center gap-2 text-sm mb-3">
                <input
                  type="checkbox"
                  checked={cartReminders.promo_on_second_email !== false}
                  onChange={(e) => upd("cart_reminders", { promo_on_second_email: e.target.checked })}
                  data-testid="cart-promo-enabled"
                />
                <span className="font-medium">Offrir un code promo dans le 2e email</span>
              </label>

              {cartReminders.promo_on_second_email !== false && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Code promo</Label>
                    <Input
                      value={cartReminders.promo_code || "REVIENS5"}
                      onChange={(e) => upd("cart_reminders", { promo_code: e.target.value.toUpperCase() })}
                      className="mt-1 font-mono"
                      placeholder="REVIENS5"
                      data-testid="cart-promo-code"
                    />
                    <p className="text-[11px] text-ink-muted mt-1">Sera créé automatiquement s'il n'existe pas</p>
                  </div>
                  <div>
                    <Label>Remise (%)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={cartReminders.promo_discount_percent ?? 5}
                      onChange={(e) => upd("cart_reminders", { promo_discount_percent: parseInt(e.target.value) || 5 })}
                      className="mt-1"
                      data-testid="cart-promo-percent"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-secondary/40 border border-border p-3 text-xs text-ink-soft">
              <p>
                <strong>Comment ça marche :</strong> les clients connectés avec un panier non finalisé reçoivent automatiquement :
              </p>
              <ol className="list-decimal ml-5 mt-1 space-y-0.5">
                <li>Un 1er email de rappel après {cartReminders.delay_1_hours ?? 4}h</li>
                <li>Un 2e email avec code promo après {cartReminders.delay_2_hours ?? 24}h</li>
              </ol>
              <p className="mt-2">
                Les relances s'arrêtent dès qu'une commande est passée ou si le client s'est désinscrit.
              </p>
            </div>
          </div>
        </Card>
      )}

      {tab === "currency" && (
        <Card title="Taux de conversion (base EUR)" onSave={() => save("currency", { base: "EUR", rates: { EUR: 1, USD: parseFloat(rates.USD) || 1.08, XOF: parseFloat(rates.XOF) || 655.957 }, updated_at: new Date().toISOString() })} testid="settings-currency">
          <div className="grid grid-cols-3 gap-4">
            <div><Label>EUR</Label><Input value={1} disabled className="mt-1 bg-secondary" /></div>
            <div><Label>USD</Label><Input type="number" step="0.01" value={rates.USD} onChange={(e) => upd("currency", { rates: { ...rates, USD: e.target.value } })} className="mt-1" data-testid="rate-usd" /></div>
            <div><Label>XOF</Label><Input type="number" step="0.001" value={rates.XOF} onChange={(e) => upd("currency", { rates: { ...rates, XOF: e.target.value } })} className="mt-1" data-testid="rate-xof" /></div>
          </div>
          <p className="text-xs text-ink-muted mt-2">Derniere mise a jour: {s.currency?.updated_at ? new Date(s.currency.updated_at).toLocaleString("fr-FR") : "-"}. Les prix manuels par produit (USD/XOF) restent prioritaires.</p>
        </Card>
      )}

      {tab === "payments" && (
        <Card title="Moyens de paiement" testid="settings-payments">
          {Object.entries(providers).map(([k, v]) => (
            <div key={k} className="flex justify-between items-center py-3 border-b border-border text-sm">
              <div><span className="capitalize font-semibold">{k}</span><div className="text-xs text-ink-muted">{(v.currencies || []).join(", ")} · {(v.countries || []).join(", ")} · mode {v.mode}</div></div>
              <span className={v.enabled ? "text-green-600 font-semibold" : "text-ink-muted"}>{v.enabled ? "Actif" : "Desactive (integration a venir)"}</span>
            </div>
          ))}
          <p className="text-xs text-ink-muted mt-3">Stripe est le seul fournisseur integre en v1. CinetPay et PawaPay (mobile money) sont prepares dans l'architecture mais necessitent des cles API et une integration dediee avant activation.</p>
        </Card>
      )}
    </div>
  );
}