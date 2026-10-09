import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [rates, setRates] = useState({ EUR: 1, USD: 1.08, XOF: 655.957 });
  const [info, setInfo] = useState({ enabled: true, messages_fr: ["", ""], messages_en: ["", ""] });

  useEffect(() => {
    api.get("/admin/settings").then((r) => {
      setSettings(r.data);
      if (r.data.currency?.rates) setRates(r.data.currency.rates);
      if (r.data.info_bar) setInfo(r.data.info_bar);
    }).catch(() => {});
  }, []);

  const saveRates = async () => {
    try {
      await api.put("/admin/settings", { key: "currency", value: { base: "EUR", rates: { EUR: 1, USD: parseFloat(rates.USD), XOF: parseFloat(rates.XOF) }, updated_at: new Date().toISOString() } });
      toast.success("Taux mis a jour");
    } catch (e) { toast.error(apiError(e)); }
  };
  const saveInfo = async () => {
    try { await api.put("/admin/settings", { key: "info_bar", value: info }); toast.success("Barre d'info mise a jour"); }
    catch (e) { toast.error(apiError(e)); }
  };

  if (!settings) return <div className="text-ink-muted">Chargement...</div>;

  return (
    <div data-testid="admin-settings" className="max-w-2xl">
      <h1 className="font-heading text-2xl font-bold uppercase mb-6">Parametres</h1>

      <div className="bg-white border border-border p-6 mb-6">
        <h3 className="font-semibold uppercase text-sm mb-4">Taux de conversion (base EUR)</h3>
        <div className="grid grid-cols-3 gap-4">
          <div><Label>EUR</Label><Input value={1} disabled className="mt-1 bg-secondary" /></div>
          <div><Label>USD</Label><Input type="number" step="0.01" value={rates.USD} onChange={(e) => setRates({ ...rates, USD: e.target.value })} className="mt-1" data-testid="rate-usd" /></div>
          <div><Label>XOF</Label><Input type="number" step="0.001" value={rates.XOF} onChange={(e) => setRates({ ...rates, XOF: e.target.value })} className="mt-1" data-testid="rate-xof" /></div>
        </div>
        <p className="text-xs text-ink-muted mt-2">Derniere mise a jour: {settings.currency?.updated_at ? new Date(settings.currency.updated_at).toLocaleString() : "-"}</p>
        <Button onClick={saveRates} className="mt-4 bg-ink hover:bg-ink/90 rounded-none" data-testid="save-rates-btn">Enregistrer</Button>
      </div>

      <div className="bg-white border border-border p-6 mb-6">
        <h3 className="font-semibold uppercase text-sm mb-4">Barre d'information</h3>
        <label className="flex items-center gap-2 text-sm mb-3">
          <input type="checkbox" checked={info.enabled} onChange={(e) => setInfo({ ...info, enabled: e.target.checked })} /> Activee
        </label>
        <Label>Message FR</Label>
        <Input value={info.messages_fr?.[0] || ""} onChange={(e) => setInfo({ ...info, messages_fr: [e.target.value, info.messages_fr?.[1] || ""] })} className="mt-1 mb-3" />
        <Label>Message EN</Label>
        <Input value={info.messages_en?.[0] || ""} onChange={(e) => setInfo({ ...info, messages_en: [e.target.value, info.messages_en?.[1] || ""] })} className="mt-1" />
        <Button onClick={saveInfo} className="mt-4 bg-ink hover:bg-ink/90 rounded-none">Enregistrer</Button>
      </div>

      <div className="bg-white border border-border p-6">
        <h3 className="font-semibold uppercase text-sm mb-4">Moyens de paiement</h3>
        {Object.entries(settings.payment_providers || {}).map(([k, v]) => (
          <div key={k} className="flex justify-between py-2 border-b border-border text-sm">
            <span className="capitalize">{k}</span>
            <span className={v.enabled ? "text-green-600" : "text-ink-muted"}>{v.enabled ? "Actif" : "Desactive (a venir)"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
