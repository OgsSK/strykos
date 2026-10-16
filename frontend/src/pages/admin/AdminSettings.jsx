import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  HeroSlidesEditor,
  SectionsEditor,
  IconsEditor,
  FeaturesEditor,
  TestimonialsEditor,
  CtaBannerEditor,
  StoryBlockEditor,
  StepsEditor,
  GalleryEditor,
} from "@/components/admin/HomeMediaEditors";
import { SingleMediaUploader } from "@/components/admin/MediaUploader";
import { toast } from "sonner";
import { Plus, Trash2, Calendar, Truck } from "lucide-react";
// ⭐ NOUVEAU : forcer le check de version après chaque save admin
import { forceCheckVersion } from "@/lib/cacheVersion";

// ⭐ Taux fixe FCFA ↔ EUR (parité officielle depuis 1999)
const XOF_RATE = 655.957;
const xofToEur = (xof) => {
  if (xof === "" || xof === null || xof === undefined) return "";
  const n = parseFloat(xof);
  if (isNaN(n)) return "";
  return Math.round((n / XOF_RATE) * 100) / 100;
};
const eurToXof = (eur) => {
  if (eur === "" || eur === null || eur === undefined) return "";
  return Math.round(parseFloat(eur) * XOF_RATE);
};

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
  // ⭐ NOUVEAU : paiement à la livraison
  const [paymentMethods, setPaymentMethods] = useState(null);
  const [pmBusy, setPmBusy] = useState(false);

  useEffect(() => { api.get("/admin/settings").then((r) => {
    setS(r.data);
    setPaymentMethods(r.data?.payment_methods || {
      cod: {
        enabled: false,
        label_fr: "Payer à la livraison",
        label_en: "Pay on delivery",
        instructions_fr: "",
        instructions_en: "",
        countries: ["ML"],
        min_amount_xof: 0,
        max_amount_xof: 500000,
        extra_fee_xof: 0,
        mode: "all",
        refund_methods: ["cash", "mobile_money", "promo"],
        promo_validity_days: 180,
      },
    });
  }).catch(() => {}); }, []);
  if (!s) return <div className="text-ink-muted">Chargement...</div>;

  const upd = (key, patch) => setS({ ...s, [key]: { ...s[key], ...patch } });

  // ⭐ MODIFIÉ : force le check de version après chaque save
  const save = async (key, value) => {
    try {
      await api.put("/admin/settings", { key, value: value ?? s[key] });
      toast.success("Parametres enregistres");
      // ⭐ NOUVEAU : force le check de version immédiatement
      await forceCheckVersion();
    } catch (e) { toast.error(apiError(e)); }
  };

  // ⭐ NOUVEAU : helpers COD
  const updatePaymentMethods = (k, field, value) => {
    setPaymentMethods((prev) => ({
      ...prev,
      [k]: { ...(prev?.[k] || {}), [field]: value },
    }));
  };

  // ⭐ MODIFIÉ : force le check de version après save COD
  const savePaymentMethods = async () => {
    setPmBusy(true);
    try {
      await api.put("/admin/settings", { key: "payment_methods", value: paymentMethods });
      toast.success("Paramètres COD enregistrés");
      // ⭐ NOUVEAU : force le check de version immédiatement
      await forceCheckVersion();
    } catch (e) { toast.error(apiError(e)); }
    setPmBusy(false);
  };

  const site = s.site || {}, hero = s.hero || {}, info = s.info_bar || {}, rates = s.currency?.rates || {}, methods = s.shipping?.methods || [], origins = s.shipping?.origins || [], providers = s.payment_providers || {}, cartReminders = s.cart_reminders || {}, taxonomies = s.taxonomies || {}, features = s.features || { items: [] }, testimonials = s.testimonials || { items: [] };
  const setMethod = (i, patch) => upd("shipping", { methods: methods.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) });
  const setOrigin = (i, patch) => upd("shipping", { origins: origins.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) });

  // ⭐ Ajout de l'onglet COD
  const tabs = [
    ["site", "Coordonnees"],
    ["hero", "Accueil & videos"],
    ["shipping", "Livraison"],
    ["taxonomies", "Taxonomies"],
    ["cart", "Relances panier"],
    ["currency", "Devises"],
    ["payments", "Paiements"],
    ["payment_methods", "Paiement livraison"],
  ];

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
            <div className="sm:col-span-2 border border-border p-4 bg-secondary/30">
              <div className="text-xs uppercase tracking-wider font-semibold text-ink-muted mb-3">
                Nom de la marque (affiché partout sur le site et dans les e-mails)
              </div>
              <div className="mb-4 flex items-center gap-3 border border-border bg-white p-3">
                <span className="text-xs uppercase tracking-wider text-ink-muted">Aperçu :</span>
                <span className="font-heading font-extrabold text-2xl tracking-tight">
                  {site.brand_part1 || "CAKES"}
                  <span className="text-brand">{site.brand_part2 || "SHOP"}</span>
                </span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Nom — partie 1 (principale)</Label>
                  <Input value={site.brand_part1 || ""} onChange={(e) => upd("site", { brand_part1: e.target.value })} placeholder="CAKES" data-testid="site-brand-part1" />
                </div>
                <div>
                  <Label>Nom — partie 2 (colorée)</Label>
                  <Input value={site.brand_part2 || ""} onChange={(e) => upd("site", { brand_part2: e.target.value })} placeholder="SHOP" data-testid="site-brand-part2" />
                </div>
                <div>
                  <Label>Tagline FR</Label>
                  <Input value={site.brand_tagline || ""} onChange={(e) => upd("site", { brand_tagline: e.target.value })} placeholder="Gâteaux artisanaux. Livrés chez vous." />
                </div>
                <div>
                  <Label>Tagline EN</Label>
                  <Input value={site.brand_tagline_en || ""} onChange={(e) => upd("site", { brand_tagline_en: e.target.value })} placeholder="Artisan cakes. Delivered to you." />
                </div>
                <div className="sm:col-span-2">
                  <Label>Nom complet (utilisé dans les e-mails, CGV, mentions légales)</Label>
                  <Input value={site.name || ""} onChange={(e) => upd("site", { name: e.target.value })} placeholder="Cakes Shop" data-testid="site-name" />
                  <p className="text-[11px] text-ink-muted mt-1">
                    Ce nom remplacera automatiquement l'ancien nom dans les CGV / e-mails / mentions légales.
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
            title="Banniere d'accueil - carrousel"
            description="Faites défiler les slides qui s'affichent en haut de la page d'accueil. Cliquez sur un slide pour le déplier et le modifier. Ajoutez une accroche au-dessus du titre et un badge sur l'image pour un rendu premium."
            onSave={() => save("hero")}
            testid="settings-hero"
          >
            <HeroSlidesEditor hero={hero} onChange={(v) => setS({ ...s, hero: v })} />
          </Card>

          <Card
            title="Section « Nos catégories » (tuiles)"
            description="Grille de tuiles carrées affichée sur la home, avec images + liens vers les catégories. Recommandé : 6 items pour un bel alignement 3×2 ou 6×1."
            onSave={() => save("icons")}
            testid="settings-icons"
          >
            <IconsEditor icons={s.icons} onChange={(v) => setS({ ...s, icons: v })} />
          </Card>

          <Card
            title="Cartes éditoriales des sections"
            description="Cartes éditoriales affichées sur la page d'accueil (jusqu'à 4 cartes alternées : image à gauche/texte à droite, puis inverse). Idéal pour la personnalisation, les anniversaires, etc."
            onSave={() => save("sections")}
            testid="settings-sections"
          >
            <SectionsEditor
              sections={s.sections || {}}
              onChange={(v) => setS({ ...s, sections: v })}
              only={["new_arrivals", "promotions", "categories"]}
            />
          </Card>

          <Card
            title="Bannière CTA pleine largeur"
            description="Grande bannière image + texte + bouton, pleine largeur. Idéal pour une promo ou « Commandez votre gâteau personnalisé »."
            onSave={() => save("cta_banner")}
            testid="settings-cta-banner"
          >
            <CtaBannerEditor banner={s.cta_banner} onChange={(v) => setS({ ...s, cta_banner: v })} />
          </Card>

          <Card
            title="Bloc « Notre histoire »"
            description="Image + texte côte à côte. Racontez votre savoir-faire, votre parcours ou votre atelier."
            onSave={() => save("story")}
            testid="settings-story"
          >
            <StoryBlockEditor story={s.story} onChange={(v) => setS({ ...s, story: v })} />
          </Card>

          <Card
            title="Section « Comment ça marche »"
            description="3 étapes numérotées pour expliquer le parcours de commande (choix, personnalisation, livraison)."
            onSave={() => save("steps")}
            testid="settings-steps"
          >
            <StepsEditor steps={s.steps} onChange={(v) => setS({ ...s, steps: v })} />
          </Card>

          <Card
            title="Galerie / Instagram"
            description="Grille d'images (max 8) pour montrer vos créations. Lien Instagram optionnel."
            onSave={() => save("gallery")}
            testid="settings-gallery"
          >
            <GalleryEditor gallery={s.gallery} onChange={(v) => setS({ ...s, gallery: v })} />
          </Card>

          <Card
            title="Les 4 avantages"
            description="Les 4 petits blocs affichés en bas de la home (icône + titre + sous-titre). Ex. Livraison rapide, Paiement sécurisé, etc."
            onSave={() => save("features")}
            testid="settings-features"
          >
            <FeaturesEditor features={features} onChange={(v) => setS({ ...s, features: v })} />
          </Card>

          <Card
            title="Témoignages clients"
            description="Les avis affichés dans la section « Ils nous font confiance » en bas de la home."
            onSave={() => save("testimonials")}
            testid="settings-testimonials"
          >
            <TestimonialsEditor testimonials={testimonials} onChange={(v) => setS({ ...s, testimonials: v })} />
          </Card>

          <Card
            title="Commandes programmées"
            description="Contrôlez le délai minimum, les créneaux, les jours de fermeture et les jours spéciaux (fêtes, événements)."
            onSave={() => save("orders", s.orders || {})}
            testid="settings-orders"
          >
            <div className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Délai minimum de préparation (heures)</Label>
                  <Input
                    type="number" min={1} max={720}
                    value={(s.orders?.min_lead_hours) ?? 48}
                    onChange={(e) => setS({ ...s, orders: { ...(s.orders || {}), min_lead_hours: parseInt(e.target.value) || 48 } })}
                    className="mt-1"
                    data-testid="orders-min-lead-hours"
                  />
                  <p className="text-[11px] text-ink-muted mt-1">Recommandé : 48h</p>
                </div>
                <div>
                  <Label>Réservation maximale (jours)</Label>
                  <Input
                    type="number" min={1} max={730}
                    value={(s.orders?.max_advance_days) ?? 180}
                    onChange={(e) => setS({ ...s, orders: { ...(s.orders || {}), max_advance_days: parseInt(e.target.value) || 180 } })}
                    className="mt-1"
                    data-testid="orders-max-advance-days"
                  />
                  <p className="text-[11px] text-ink-muted mt-1">Recommandé : 180 jours</p>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <Label>Créneaux par défaut</Label>
                  <button type="button"
                    onClick={() => {
                      const slots = [...(s.orders?.time_slots || [])];
                      slots.push({ value: "", label_fr: "", label_en: "" });
                      setS({ ...s, orders: { ...(s.orders || {}), time_slots: slots } });
                    }}
                    className="text-xs border border-border px-2 py-1 hover:bg-secondary inline-flex items-center gap-1"
                    data-testid="add-time-slot">
                    <Plus className="w-3 h-3" /> Ajouter
                  </button>
                </div>
                <div className="space-y-2">
                  {((s.orders?.time_slots) || []).map((slot, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1.5fr_1.5fr_32px] gap-2 items-end" data-testid={`time-slot-${i}`}>
                      <Input value={slot.value || ""} placeholder="matin"
                        onChange={(e) => {
                          const slots = [...(s.orders?.time_slots || [])];
                          slots[i] = { ...slot, value: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") };
                          setS({ ...s, orders: { ...(s.orders || {}), time_slots: slots } });
                        }} className="h-9 font-mono" />
                      <Input value={slot.label_fr || ""} placeholder="Matin (9h-12h)"
                        onChange={(e) => {
                          const slots = [...(s.orders?.time_slots || [])];
                          slots[i] = { ...slot, label_fr: e.target.value };
                          setS({ ...s, orders: { ...(s.orders || {}), time_slots: slots } });
                        }} className="h-9" />
                      <Input value={slot.label_en || ""} placeholder="Morning (9am-12pm)"
                        onChange={(e) => {
                          const slots = [...(s.orders?.time_slots || [])];
                          slots[i] = { ...slot, label_en: e.target.value };
                          setS({ ...s, orders: { ...(s.orders || {}), time_slots: slots } });
                        }} className="h-9" />
                      <button type="button"
                        onClick={() => {
                          const slots = (s.orders?.time_slots || []).filter((_, idx) => idx !== i);
                          setS({ ...s, orders: { ...(s.orders || {}), time_slots: slots } });
                        }}
                        className="h-9 text-red-600 hover:bg-red-50 flex items-center justify-center"
                        data-testid={`remove-time-slot-${i}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {((s.orders?.time_slots) || []).length === 0 && (
                    <p className="text-xs text-ink-muted italic">Aucun créneau. Cliquez sur Ajouter.</p>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <Label>Jours de fermeture hebdomadaire</Label>
                <p className="text-[11px] text-ink-muted mb-3">
                  Cochez les jours de la semaine où vous êtes fermé (impossible de commander).
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { v: 1, l: "Lundi" }, { v: 2, l: "Mardi" }, { v: 3, l: "Mercredi" },
                    { v: 4, l: "Jeudi" }, { v: 5, l: "Vendredi" }, { v: 6, l: "Samedi" }, { v: 0, l: "Dimanche" },
                  ].map((d) => {
                    const closed = (s.orders?.weekly_closed_days || []).includes(d.v);
                    return (
                      <button key={d.v} type="button"
                        onClick={() => {
                          const list = [...(s.orders?.weekly_closed_days || [])];
                          const idx = list.indexOf(d.v);
                          if (idx >= 0) list.splice(idx, 1);
                          else list.push(d.v);
                          setS({ ...s, orders: { ...(s.orders || {}), weekly_closed_days: list } });
                        }}
                        className={`px-3 py-1.5 text-xs font-medium border ${closed ? "bg-red-100 border-red-400 text-red-800" : "border-border hover:bg-secondary"}`}
                        data-testid={`closed-day-${d.v}`}>
                        {d.l}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <Label>Dates fermées (fêtes, événements)</Label>
                  <button type="button"
                    onClick={() => {
                      const list = [...(s.orders?.closed_dates || []), ""];
                      setS({ ...s, orders: { ...(s.orders || {}), closed_dates: list } });
                    }}
                    className="text-xs border border-border px-2 py-1 hover:bg-secondary inline-flex items-center gap-1"
                    data-testid="add-closed-date">
                    <Plus className="w-3 h-3" /> Ajouter
                  </button>
                </div>
                <div className="space-y-2">
                  {((s.orders?.closed_dates) || []).map((dt, i) => (
                    <div key={i} className="grid grid-cols-[1fr_32px] gap-2" data-testid={`closed-date-${i}`}>
                      <Input type="date" value={dt}
                        onChange={(e) => {
                          const list = [...(s.orders?.closed_dates || [])];
                          list[i] = e.target.value;
                          setS({ ...s, orders: { ...(s.orders || {}), closed_dates: list } });
                        }} className="h-9" />
                      <button type="button"
                        onClick={() => {
                          const list = (s.orders?.closed_dates || []).filter((_, idx) => idx !== i);
                          setS({ ...s, orders: { ...(s.orders || {}), closed_dates: list } });
                        }}
                        className="h-9 text-red-600 hover:bg-red-50 flex items-center justify-center">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {((s.orders?.closed_dates) || []).length === 0 && (
                    <p className="text-xs text-ink-muted italic">Aucune date fermée. Cliquez sur Ajouter.</p>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <Label>Périodes de fermeture (vacances)</Label>
                  <button type="button"
                    onClick={() => {
                      const list = [...(s.orders?.closed_ranges || []), { start: "", end: "", reason_fr: "", reason_en: "" }];
                      setS({ ...s, orders: { ...(s.orders || {}), closed_ranges: list } });
                    }}
                    className="text-xs border border-border px-2 py-1 hover:bg-secondary inline-flex items-center gap-1"
                    data-testid="add-closed-range">
                    <Plus className="w-3 h-3" /> Ajouter une période
                  </button>
                </div>
                <div className="space-y-3">
                  {((s.orders?.closed_ranges) || []).map((r, i) => (
                    <div key={i} className="border border-border p-3 grid sm:grid-cols-2 gap-2 bg-secondary/30" data-testid={`closed-range-${i}`}>
                      <div>
                        <Label className="text-xs">Du</Label>
                        <Input type="date" value={r.start || ""}
                          onChange={(e) => {
                            const list = [...(s.orders?.closed_ranges || [])];
                            list[i] = { ...r, start: e.target.value };
                            setS({ ...s, orders: { ...(s.orders || {}), closed_ranges: list } });
                          }} className="h-9" />
                      </div>
                      <div>
                        <Label className="text-xs">Au</Label>
                        <Input type="date" value={r.end || ""}
                          onChange={(e) => {
                            const list = [...(s.orders?.closed_ranges || [])];
                            list[i] = { ...r, end: e.target.value };
                            setS({ ...s, orders: { ...(s.orders || {}), closed_ranges: list } });
                          }} className="h-9" />
                      </div>
                      <div>
                        <Label className="text-xs">Raison FR</Label>
                        <Input value={r.reason_fr || ""} placeholder="Congés annuels"
                          onChange={(e) => {
                            const list = [...(s.orders?.closed_ranges || [])];
                            list[i] = { ...r, reason_fr: e.target.value };
                            setS({ ...s, orders: { ...(s.orders || {}), closed_ranges: list } });
                          }} className="h-9" />
                      </div>
                      <div className="grid grid-cols-[1fr_32px] gap-2 items-end">
                        <div>
                          <Label className="text-xs">Raison EN</Label>
                          <Input value={r.reason_en || ""} placeholder="Summer break"
                            onChange={(e) => {
                              const list = [...(s.orders?.closed_ranges || [])];
                              list[i] = { ...r, reason_en: e.target.value };
                              setS({ ...s, orders: { ...(s.orders || {}), closed_ranges: list } });
                            }} className="h-9" />
                        </div>
                        <button type="button"
                          onClick={() => {
                            const list = (s.orders?.closed_ranges || []).filter((_, idx) => idx !== i);
                            setS({ ...s, orders: { ...(s.orders || {}), closed_ranges: list } });
                          }}
                          className="h-9 text-red-600 hover:bg-red-50 flex items-center justify-center">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {((s.orders?.closed_ranges) || []).length === 0 && (
                    <p className="text-xs text-ink-muted italic">Aucune période. Cliquez sur Ajouter.</p>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <Label>Jours spéciaux (horaires personnalisés)</Label>
                  <button type="button"
                    onClick={() => {
                      const list = [...(s.orders?.special_days || []), {
                        date: "", time_slots: [{ value: "special", label_fr: "", label_en: "" }],
                        reason_fr: "", reason_en: ""
                      }];
                      setS({ ...s, orders: { ...(s.orders || {}), special_days: list } });
                    }}
                    className="text-xs border border-border px-2 py-1 hover:bg-secondary inline-flex items-center gap-1"
                    data-testid="add-special-day">
                    <Plus className="w-3 h-3" /> Ajouter un jour spécial
                  </button>
                </div>
                <p className="text-[11px] text-ink-muted mb-3">
                  Ex : 24 décembre ouvert jusqu'à minuit, Saint-Valentin avec créneaux dédiés, etc.
                </p>
                <div className="space-y-3">
                  {((s.orders?.special_days) || []).map((sp, i) => (
                    <div key={i} className="border border-amber-300 bg-amber-50 p-3 space-y-2" data-testid={`special-day-${i}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase tracking-wider font-semibold">Jour spécial {i + 1}</span>
                        <button type="button"
                          onClick={() => {
                            const list = (s.orders?.special_days || []).filter((_, idx) => idx !== i);
                            setS({ ...s, orders: { ...(s.orders || {}), special_days: list } });
                          }}
                          className="text-red-600 hover:bg-red-50 p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid sm:grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Date</Label>
                          <Input type="date" value={sp.date || ""}
                            onChange={(e) => {
                              const list = [...(s.orders?.special_days || [])];
                              list[i] = { ...sp, date: e.target.value };
                              setS({ ...s, orders: { ...(s.orders || {}), special_days: list } });
                            }} className="h-9" />
                        </div>
                        <div>
                          <Label className="text-xs">Raison FR</Label>
                          <Input value={sp.reason_fr || ""} placeholder="Réveillon de Noël"
                            onChange={(e) => {
                              const list = [...(s.orders?.special_days || [])];
                              list[i] = { ...sp, reason_fr: e.target.value };
                              setS({ ...s, orders: { ...(s.orders || {}), special_days: list } });
                            }} className="h-9" />
                        </div>
                        <div>
                          <Label className="text-xs">Raison EN</Label>
                          <Input value={sp.reason_en || ""} placeholder="Christmas Eve"
                            onChange={(e) => {
                              const list = [...(s.orders?.special_days || [])];
                              list[i] = { ...sp, reason_en: e.target.value };
                              setS({ ...s, orders: { ...(s.orders || {}), special_days: list } });
                            }} className="h-9" />
                        </div>
                      </div>
                      <div className="border-t border-amber-200 pt-2">
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-xs">Créneaux pour ce jour</Label>
                          <button type="button"
                            onClick={() => {
                              const list = [...(s.orders?.special_days || [])];
                              const slots = [...(sp.time_slots || []), { value: "", label_fr: "", label_en: "" }];
                              list[i] = { ...sp, time_slots: slots };
                              setS({ ...s, orders: { ...(s.orders || {}), special_days: list } });
                            }}
                            className="text-xs text-brand hover:underline">+ Créneau</button>
                        </div>
                        {(sp.time_slots || []).map((slot, j) => (
                          <div key={j} className="grid grid-cols-[1fr_1.5fr_1.5fr_32px] gap-2 mb-1">
                            <Input value={slot.value || ""} placeholder="noel"
                              onChange={(e) => {
                                const list = [...(s.orders?.special_days || [])];
                                const slots = [...(sp.time_slots || [])];
                                slots[j] = { ...slot, value: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") };
                                list[i] = { ...sp, time_slots: slots };
                                setS({ ...s, orders: { ...(s.orders || {}), special_days: list } });
                              }} className="h-8 text-xs font-mono" />
                            <Input value={slot.label_fr || ""} placeholder="10h-minuit"
                              onChange={(e) => {
                                const list = [...(s.orders?.special_days || [])];
                                const slots = [...(sp.time_slots || [])];
                                slots[j] = { ...slot, label_fr: e.target.value };
                                list[i] = { ...sp, time_slots: slots };
                                setS({ ...s, orders: { ...(s.orders || {}), special_days: list } });
                              }} className="h-8 text-xs" />
                            <Input value={slot.label_en || ""} placeholder="10am-midnight"
                              onChange={(e) => {
                                const list = [...(s.orders?.special_days || [])];
                                const slots = [...(sp.time_slots || [])];
                                slots[j] = { ...slot, label_en: e.target.value };
                                list[i] = { ...sp, time_slots: slots };
                                setS({ ...s, orders: { ...(s.orders || {}), special_days: list } });
                              }} className="h-8 text-xs" />
                            <button type="button"
                              onClick={() => {
                                const list = [...(s.orders?.special_days || [])];
                                const slots = (sp.time_slots || []).filter((_, idx) => idx !== j);
                                list[i] = { ...sp, time_slots: slots };
                                setS({ ...s, orders: { ...(s.orders || {}), special_days: list } });
                              }}
                              className="h-8 text-red-600 hover:bg-red-50 flex items-center justify-center">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        {(sp.time_slots || []).length === 0 && (
                          <p className="text-[11px] text-red-700 italic">
                            ⚠️ Aucun créneau → ce jour sera considéré comme fermé.
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {((s.orders?.special_days) || []).length === 0 && (
                    <p className="text-xs text-ink-muted italic">Aucun jour spécial. Cliquez sur Ajouter.</p>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <Label className="text-xs">Délai de réclamation (heures)</Label>
                <Input
                  type="number" min={1} max={168}
                  value={(s.orders?.claim_window_hours) ?? 48}
                  onChange={(e) => setS({ ...s, orders: { ...(s.orders || {}), claim_window_hours: parseInt(e.target.value) || 48 } })}
                  className="mt-1 max-w-xs"
                  data-testid="orders-claim-window-hours"
                />
                <p className="text-[11px] text-ink-muted mt-1">
                  Délai après la livraison pour signaler un problème. Recommandé : 48h.
                </p>
              </div>

              <div className="border-t border-border pt-4">
                <Label className="text-xs uppercase tracking-wider text-ink-muted mb-3 block">
                  Limites des médias de réclamation
                </Label>
                <div className="grid sm:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Max photos</Label>
                    <Input
                      type="number" min={1} max={10}
                      value={(s.orders?.claim_media_max_photos) ?? 3}
                      onChange={(e) => setS({ ...s, orders: { ...(s.orders || {}), claim_media_max_photos: parseInt(e.target.value) || 3 } })}
                      className="mt-1"
                      data-testid="orders-claim-media-max-photos"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Max vidéos</Label>
                    <Input
                      type="number" min={0} max={5}
                      value={(s.orders?.claim_media_max_videos) ?? 1}
                      onChange={(e) => setS({ ...s, orders: { ...(s.orders || {}), claim_media_max_videos: parseInt(e.target.value) || 0 } })}
                      className="mt-1"
                      data-testid="orders-claim-media-max-videos"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Taille photo (Mo)</Label>
                    <Input
                      type="number" min={1} max={20}
                      value={(s.orders?.claim_media_max_photo_mb) ?? 5}
                      onChange={(e) => setS({ ...s, orders: { ...(s.orders || {}), claim_media_max_photo_mb: parseInt(e.target.value) || 5 } })}
                      className="mt-1"
                      data-testid="orders-claim-media-max-photo-mb"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Taille vidéo (Mo)</Label>
                    <Input
                      type="number" min={1} max={200}
                      value={(s.orders?.claim_media_max_video_mb) ?? 50}
                      onChange={(e) => setS({ ...s, orders: { ...(s.orders || {}), claim_media_max_video_mb: parseInt(e.target.value) || 50 } })}
                      className="mt-1"
                      data-testid="orders-claim-media-max-video-mb"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-ink-muted mt-1">
                  💡 Recommandé : 3 photos max (5 Mo) · 1 vidéo max (50 Mo ≈ 1 min en 1080p)
                </p>
              </div>
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

                  <div>
                    <Label className="text-xs">Coût FCFA</Label>
                    <Input
                      type="number"
                      step="100"
                      value={m.cost_xof || eurToXof(m.cost_eur) || ""}
                      onChange={(e) => {
                        const xof = e.target.value;
                        setMethod(i, {
                          cost_xof: xof,
                          cost_eur: xofToEur(xof),
                        });
                      }}
                      className="h-9"
                    />
                    {m.cost_eur !== undefined && m.cost_eur !== "" && (
                      <p className="text-[10px] text-ink-muted mt-0.5">
                        ≈ {m.cost_eur} €
                      </p>
                    )}
                  </div>

                  <div><Label className="text-xs">Delai FR / EN</Label><div className="flex gap-1"><Input value={m.delay_fr} onChange={(e) => setMethod(i, { delay_fr: e.target.value })} className="h-9" /><Input value={m.delay_en} onChange={(e) => setMethod(i, { delay_en: e.target.value })} className="h-9" /></div></div>
                  <button onClick={() => upd("shipping", { methods: methods.filter((_, idx) => idx !== i) })} className="h-9 text-red-600 hover:bg-red-50 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <Button variant="outline" className="rounded-none" onClick={() => upd("shipping", { methods: [...methods, { country: "ML", country_name: "Mali", name_fr: "Nouveau mode", name_en: "New method", cost_xof: 5000, cost_eur: xofToEur(5000), delay_fr: "3-6 jours", delay_en: "3-6 days" }] })} data-testid="add-shipping-method">
                <Plus className="w-4 h-4 mr-1" /> Ajouter un mode
              </Button>
              <p className="text-xs text-ink-muted">
                Les pays sans mode défini reçoivent la livraison internationale (env. 10 000 FCFA, 7-14 jours).
              </p>
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
            </div>
          </Card>
        </div>
      )}

      {tab === "taxonomies" && (
        <Card
          title="Taxonomies (occasions, saveurs)"
          description="Les valeurs de ces listes alimentent les filtres du catalogue. Chaque valeur a un identifiant interne (non modifiable) et un libellé FR/EN."
          onSave={() => save("taxonomies", {
            genders: taxonomies.genders || [],
            sports: taxonomies.sports || [],
          })}
          testid="settings-taxonomies"
        >
          <div className="space-y-6">
            {[
              { key: "genders", label: "Occasions" },
              { key: "sports", label: "Saveurs / Régimes" },
            ].map(({ key: kind, label }) => {
              const items = taxonomies[kind] || [];

              const updItem = (i, patch) => {
                const copy = items.map((x, idx) => (idx === i ? { ...x, ...patch } : x));
                upd("taxonomies", { [kind]: copy });
              };
              const delItem = async (i) => {
                const it = items[i];
                try {
                  const { data } = await api.get("/admin/taxonomies/usage");
                  const usage = data[kind]?.[it.value] || 0;
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
                          <Input value={it.value || ""} onChange={(e) => updItem(i, { value: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="anniversaire" className="h-9 font-mono" />
                        </div>
                        <div>
                          <Label className="text-xs">Nom FR</Label>
                          <Input value={it.name_fr || ""} onChange={(e) => updItem(i, { name_fr: e.target.value })} placeholder="Anniversaire" className="h-9" />
                        </div>
                        <div>
                          <Label className="text-xs">Nom EN</Label>
                          <Input value={it.name_en || ""} onChange={(e) => updItem(i, { name_en: e.target.value })} placeholder="Birthday" className="h-9" />
                        </div>
                        <div>
                          <Label className="text-xs">Image</Label>
                          <SingleMediaUploader compact value={it.image_url || ""} onChange={(v) => updItem(i, { image_url: v })} label="une image" testid={`taxonomy-image-${kind}-${i}`} />
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
              <input type="checkbox" checked={cartReminders.enabled !== false} onChange={(e) => upd("cart_reminders", { enabled: e.target.checked })} data-testid="cart-enabled" />
              <span className="font-medium">Activer les relances panier</span>
            </label>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Délai avant le 1er email (heures)</Label>
                <Input type="number" min={1} max={72} value={cartReminders.delay_1_hours ?? 4} onChange={(e) => upd("cart_reminders", { delay_1_hours: parseInt(e.target.value) || 4 })} className="mt-1" data-testid="cart-delay-1" />
                <p className="text-[11px] text-ink-muted mt-1">Recommandé : 4h</p>
              </div>
              <div>
                <Label>Délai avant le 2e email (heures)</Label>
                <Input type="number" min={6} max={168} value={cartReminders.delay_2_hours ?? 24} onChange={(e) => upd("cart_reminders", { delay_2_hours: parseInt(e.target.value) || 24 })} className="mt-1" data-testid="cart-delay-2" />
                <p className="text-[11px] text-ink-muted mt-1">Recommandé : 24h</p>
              </div>
              <div>
                <Label>Nombre minimum d'articles</Label>
                <Input type="number" min={1} max={10} value={cartReminders.min_items ?? 1} onChange={(e) => upd("cart_reminders", { min_items: parseInt(e.target.value) || 1 })} className="mt-1" />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <label className="flex items-center gap-2 text-sm mb-3">
                <input type="checkbox" checked={cartReminders.promo_on_second_email !== false} onChange={(e) => upd("cart_reminders", { promo_on_second_email: e.target.checked })} data-testid="cart-promo-enabled" />
                <span className="font-medium">Offrir un code promo dans le 2e email</span>
              </label>

              {cartReminders.promo_on_second_email !== false && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Code promo</Label>
                    <Input value={cartReminders.promo_code || "REVIENS5"} onChange={(e) => upd("cart_reminders", { promo_code: e.target.value.toUpperCase() })} className="mt-1 font-mono" placeholder="REVIENS5" data-testid="cart-promo-code" />
                    <p className="text-[11px] text-ink-muted mt-1">Sera créé automatiquement s'il n'existe pas</p>
                  </div>
                  <div>
                    <Label>Remise (%)</Label>
                    <Input type="number" min={1} max={50} value={cartReminders.promo_discount_percent ?? 5} onChange={(e) => upd("cart_reminders", { promo_discount_percent: parseInt(e.target.value) || 5 })} className="mt-1" data-testid="cart-promo-percent" />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-secondary/40 border border-border p-3 text-xs text-ink-soft">
              <p><strong>Comment ça marche :</strong> les clients connectés avec un panier non finalisé reçoivent automatiquement :</p>
              <ol className="list-decimal ml-5 mt-1 space-y-0.5">
                <li>Un 1er email de rappel après {cartReminders.delay_1_hours ?? 4}h</li>
                <li>Un 2e email avec code promo après {cartReminders.delay_2_hours ?? 24}h</li>
              </ol>
              <p className="mt-2">Les relances s'arrêtent dès qu'une commande est passée ou si le client s'est désinscrit.</p>
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

      {/* ⭐ NOUVEAU : Onglet Paiement à la livraison */}
      {tab === "payment_methods" && (
        <Card title="Paiement à la livraison (COD)" testid="settings-payment-methods">
          <p className="text-xs text-ink-muted mb-4">
            Permettez aux clients de payer en espèces à la réception de leur commande.
          </p>

          <label className="flex items-center gap-3 p-3 border border-border bg-secondary/30 cursor-pointer">
            <input
              type="checkbox"
              checked={paymentMethods?.cod?.enabled || false}
              onChange={(e) => updatePaymentMethods("cod", "enabled", e.target.checked)}
              className="w-4 h-4"
            />
            <div className="flex-1">
              <div className="font-semibold text-sm">Activer le paiement à la livraison</div>
              <div className="text-xs text-ink-muted">
                Le client peut choisir de payer en espèces à la réception.
              </div>
            </div>
          </label>

          {paymentMethods?.cod?.enabled && (
            <div className="space-y-4 mt-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-ink-muted">Label FR</Label>
                  <Input
                    value={paymentMethods?.cod?.label_fr || ""}
                    onChange={(e) => updatePaymentMethods("cod", "label_fr", e.target.value)}
                    placeholder="Payer à la livraison"
                    className="mt-1 rounded-none"
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-ink-muted">Label EN</Label>
                  <Input
                    value={paymentMethods?.cod?.label_en || ""}
                    onChange={(e) => updatePaymentMethods("cod", "label_en", e.target.value)}
                    placeholder="Pay on delivery"
                    className="mt-1 rounded-none"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wider text-ink-muted">Instructions FR</Label>
                <Textarea
                  rows={2}
                  value={paymentMethods?.cod?.instructions_fr || ""}
                  onChange={(e) => updatePaymentMethods("cod", "instructions_fr", e.target.value)}
                  placeholder="Préparez le montant exact en espèces..."
                  className="mt-1 rounded-none"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-ink-muted">Instructions EN</Label>
                <Textarea
                  rows={2}
                  value={paymentMethods?.cod?.instructions_en || ""}
                  onChange={(e) => updatePaymentMethods("cod", "instructions_en", e.target.value)}
                  placeholder="Prepare the exact amount in cash..."
                  className="mt-1 rounded-none"
                />
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wider text-ink-muted">Pays éligibles (séparés par virgule)</Label>
                <Input
                  value={(paymentMethods?.cod?.countries || []).join(", ")}
                  onChange={(e) =>
                    updatePaymentMethods("cod", "countries",
                      e.target.value.split(",").map(s => s.trim().toUpperCase()).filter(Boolean))
                  }
                  placeholder="ML, SN, CI"
                  className="mt-1 rounded-none"
                />
                <p className="text-[11px] text-ink-muted mt-1">
                  Codes ISO 2 lettres. Ex: ML, BE, FR, SN, CI
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-ink-muted">Montant min (XOF)</Label>
                  <Input
                    type="number"
                    value={paymentMethods?.cod?.min_amount_xof ?? 0}
                    onChange={(e) => updatePaymentMethods("cod", "min_amount_xof", parseInt(e.target.value) || 0)}
                    className="mt-1 rounded-none"
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-ink-muted">Montant max (XOF)</Label>
                  <Input
                    type="number"
                    value={paymentMethods?.cod?.max_amount_xof ?? 500000}
                    onChange={(e) => updatePaymentMethods("cod", "max_amount_xof", parseInt(e.target.value) || 500000)}
                    className="mt-1 rounded-none"
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-ink-muted">Frais COD (XOF)</Label>
                  <Input
                    type="number"
                    value={paymentMethods?.cod?.extra_fee_xof ?? 0}
                    onChange={(e) => updatePaymentMethods("cod", "extra_fee_xof", parseInt(e.target.value) || 0)}
                    className="mt-1 rounded-none"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wider text-ink-muted">Mode de sélection des produits</Label>
                <select
                  value={paymentMethods?.cod?.mode || "all"}
                  onChange={(e) => updatePaymentMethods("cod", "mode", e.target.value)}
                  className="mt-1 w-full border border-border h-10 px-3 bg-white text-sm"
                >
                  <option value="all">Tous les produits éligibles</option>
                  <option value="selected">Uniquement les produits marqués COD</option>
                </select>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wider text-ink-muted">
                  Validité d'un remboursement par code promo (jours)
                </Label>
                <Input
                  type="number"
                  value={paymentMethods?.cod?.promo_validity_days ?? 180}
                  onChange={(e) => updatePaymentMethods("cod", "promo_validity_days", parseInt(e.target.value) || 180)}
                  className="mt-1 rounded-none w-40"
                />
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wider text-ink-muted block mb-2">
                  Méthodes de remboursement autorisées
                </Label>
                <div className="flex flex-wrap gap-3">
                  {[
                    { value: "cash", label: "💵 Espèces" },
                    { value: "mobile_money", label: "📱 Mobile Money" },
                    { value: "promo", label: "🎁 Code promo" },
                    { value: "stripe", label: "💳 Stripe" },
                  ].map((m) => (
                    <label key={m.value} className="flex items-center gap-2 cursor-pointer text-sm border border-border px-3 py-2 hover:bg-secondary">
                      <input
                        type="checkbox"
                        checked={(paymentMethods?.cod?.refund_methods || []).includes(m.value)}
                        onChange={(e) => {
                          const current = paymentMethods?.cod?.refund_methods || [];
                          const next = e.target.checked
                            ? [...new Set([...current, m.value])]
                            : current.filter((x) => x !== m.value);
                          updatePaymentMethods("cod", "refund_methods", next);
                        }}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <Button
                  onClick={savePaymentMethods}
                  disabled={pmBusy}
                  className="bg-brand hover:bg-brand-dark rounded-none uppercase font-bold"
                >
                  {pmBusy ? "..." : "Enregistrer"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}