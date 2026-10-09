import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HeroSlidesEditor, SectionsEditor } from "@/components/admin/HomeMediaEditors";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const Card = ({ title, children, onSave, testid }) => (
  <div className="bg-white border border-border p-6" data-testid={testid}>
    <h3 className="font-semibold uppercase text-sm mb-4">{title}</h3>
    {children}
    {onSave && <Button onClick={onSave} className="mt-4 bg-ink hover:bg-ink/90 rounded-none" data-testid={`${testid}-save`}>Enregistrer</Button>}
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
  const site = s.site || {}, hero = s.hero || {}, info = s.info_bar || {}, rates = s.currency?.rates || {}, methods = s.shipping?.methods || [], providers = s.payment_providers || {};
  const setMethod = (i, patch) => upd("shipping", { methods: methods.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) });
  const tabs = [["site", "Coordonnees"], ["hero", "Accueil & videos"], ["shipping", "Livraison"], ["currency", "Devises"], ["payments", "Paiements"]];

  return (
    <div data-testid="admin-settings" className="max-w-4xl">
      <h1 className="font-heading text-2xl font-bold uppercase mb-5">Parametres</h1>
      <div className="flex flex-wrap gap-1 mb-5 border-b border-border">
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} data-testid={`settings-tab-${k}`} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink"}`}>{l}</button>)}
      </div>

      {tab === "site" && (
        <Card title="Coordonnees de la boutique" onSave={() => save("site")} testid="settings-site">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>Nom</Label><Input value={site.name || ""} onChange={(e) => upd("site", { name: e.target.value })} /></div>
            <div><Label>E-mail de contact</Label><Input value={site.email || ""} onChange={(e) => upd("site", { email: e.target.value })} data-testid="site-email" /></div>
            <div><Label>Telephone</Label><Input value={site.phone || ""} onChange={(e) => upd("site", { phone: e.target.value })} data-testid="site-phone" /></div>
            <div><Label>WhatsApp (format international sans espaces)</Label><Input value={site.whatsapp || ""} onChange={(e) => upd("site", { whatsapp: e.target.value })} placeholder="+32465743001" /></div>
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
        <div className="space-y-4">
          <Card title="Banniere d'accueil - carrousel video (style Nike)" onSave={() => save("hero")} testid="settings-hero">
            <HeroSlidesEditor hero={hero} onChange={(v) => setS({ ...s, hero: v })} />
          </Card>
          <Card title="Bannieres video des sections" onSave={() => save("sections")} testid="settings-sections">
            <SectionsEditor sections={s.sections || {}} onChange={(v) => setS({ ...s, sections: v })} />
          </Card>
          <Card title="Barre d'information" onSave={() => save("info_bar")} testid="settings-infobar">
            <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" checked={!!info.enabled} onChange={(e) => upd("info_bar", { enabled: e.target.checked })} /> Activee</label>
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
            <Button variant="outline" className="rounded-none" onClick={() => upd("shipping", { methods: [...methods, { country: "ML", country_name: "Mali", name_fr: "Nouveau mode", name_en: "New method", cost_eur: 5, delay_fr: "3-6 jours", delay_en: "3-6 days" }] })} data-testid="add-shipping-method"><Plus className="w-4 h-4 mr-1" /> Ajouter un mode</Button>
            <p className="text-xs text-ink-muted">Les pays sans mode defini recoivent la livraison internationale (15 EUR, 7-14 jours).</p>
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
          <p className="text-xs text-ink-muted mt-3">Stripe est le seul fournisseur integre en v1. CinetPay et PawaPay (mobile money Mali) sont prepares dans l'architecture mais necessitent des cles API et une integration dediee avant activation.</p>
        </Card>
      )}
    </div>
  );
}
