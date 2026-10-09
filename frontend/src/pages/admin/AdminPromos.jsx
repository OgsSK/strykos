import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate } from "@/lib/adminUtils";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";

const EMPTY = { code: "", description: "", discount_type: "percent", value: 10, min_subtotal_eur: 0, free_shipping: false, first_order_only: false, usage_limit: "", starts_at: "", expires_at: "", active: true };
const toLocalInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

export default function AdminPromos() {
  const [params, setParams] = useSearchParams();
  const [promos, setPromos] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const load = () => api.get("/admin/promos").then((r) => setPromos(r.data)).catch(() => {});
  useEffect(() => { load(); if (params.get("new")) { setForm(EMPTY); setEditing(null); setOpen(true); setParams({}); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.code.trim()) return toast.error("Code requis");
    const payload = {
      ...form, code: form.code.trim().toUpperCase(), value: parseFloat(form.value) || 0, min_subtotal_eur: parseFloat(form.min_subtotal_eur) || 0,
      usage_limit: form.usage_limit === "" ? null : parseInt(form.usage_limit),
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    };
    try {
      if (editing) await api.put(`/admin/promos/${editing}`, payload); else await api.post("/admin/promos", payload);
      toast.success("Code enregistre"); setOpen(false); load();
    } catch (e) { toast.error(apiError(e)); }
  };
  const toggle = async (p) => {
    try { await api.put(`/admin/promos/${p.id}`, { ...p, active: !p.active }); load(); } catch (e) { toast.error(apiError(e)); }
  };
  const remove = async (p) => {
    if (!window.confirm(`Supprimer le code ${p.code} ?`)) return;
    try { await api.delete(`/admin/promos/${p.id}`); toast.success("Supprime"); load(); } catch (e) { toast.error(apiError(e)); }
  };
  const isExpired = (p) => p.expires_at && new Date(p.expires_at) < new Date();

  return (
    <div data-testid="admin-promos">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-heading text-2xl font-bold uppercase">Codes promo</h1>
        <Button onClick={() => { setEditing(null); setForm(EMPTY); setOpen(true); }} className="bg-brand hover:bg-brand-dark rounded-none" data-testid="new-promo-btn"><Plus className="w-4 h-4 mr-1" /> Nouveau code</Button>
      </div>
      <div className="bg-white border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider"><tr><th className="p-3">Code</th><th className="p-3">Remise</th><th className="p-3">Conditions</th><th className="p-3">Utilisations</th><th className="p-3">Validite</th><th className="p-3">Etat</th><th className="p-3"></th></tr></thead>
          <tbody>
            {promos.map((p) => (
              <tr key={p.id} className="border-t border-border" data-testid={`promo-row-${p.code}`}>
                <td className="p-3"><div className="font-mono font-bold inline-flex items-center gap-1"><Tag className="w-3 h-3 text-brand" />{p.code}</div><div className="text-xs text-ink-muted">{p.description}</div></td>
                <td className="p-3 font-semibold">{p.discount_type === "percent" ? `${p.value}%` : `${p.value.toFixed(2)} €`}{p.free_shipping && <div className="text-xs text-green-700">+ livraison offerte</div>}</td>
                <td className="p-3 text-xs">{p.min_subtotal_eur > 0 && <div>Min. {p.min_subtotal_eur} €</div>}{p.first_order_only && <div>1ere commande</div>}</td>
                <td className="p-3">{p.used_count}{p.usage_limit != null && ` / ${p.usage_limit}`}</td>
                <td className="p-3 text-xs">{p.starts_at && <div>Du {fmtDate(p.starts_at)}</div>}{p.expires_at ? <div className={isExpired(p) ? "text-red-600" : ""}>Jusqu'au {fmtDate(p.expires_at)}</div> : <span className="text-ink-muted">Sans limite</span>}</td>
                <td className="p-3"><button onClick={() => toggle(p)} className={`text-xs px-2 py-0.5 ${p.active && !isExpired(p) ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`} data-testid={`toggle-promo-${p.code}`}>{isExpired(p) ? "Expire" : p.active ? "Actif" : "Inactif"}</button></td>
                <td className="p-3"><div className="flex gap-1 justify-end">
                  <button onClick={() => { setEditing(p.id); setForm({ ...p, usage_limit: p.usage_limit ?? "", starts_at: toLocalInput(p.starts_at), expires_at: toLocalInput(p.expires_at) }); setOpen(true); }} className="p-1.5 hover:bg-secondary"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(p)} className="p-1.5 hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div></td>
              </tr>
            ))}
            {promos.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-ink-muted">Aucun code promo</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Modifier" : "Nouveau"} code promo</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Code *</Label><Input value={form.code} onChange={(e) => setF("code", e.target.value.toUpperCase())} className="font-mono" data-testid="promo-code-input" /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={(e) => setF("description", e.target.value)} /></div>
            <div>
              <Label>Type</Label>
              <select value={form.discount_type} onChange={(e) => setF("discount_type", e.target.value)} className="w-full border border-border h-10 px-2 bg-white" data-testid="promo-type">
                <option value="percent">Pourcentage (%)</option><option value="fixed">Montant fixe (EUR)</option>
              </select>
            </div>
            <div><Label>Valeur {form.discount_type === "percent" ? "(%)" : "(EUR)"}</Label><Input type="number" step="0.01" value={form.value} onChange={(e) => setF("value", e.target.value)} data-testid="promo-value" /></div>
            <div><Label>Montant minimum (EUR)</Label><Input type="number" step="0.01" value={form.min_subtotal_eur} onChange={(e) => setF("min_subtotal_eur", e.target.value)} /></div>
            <div><Label>Limite d'utilisation</Label><Input type="number" value={form.usage_limit} onChange={(e) => setF("usage_limit", e.target.value)} placeholder="illimite" /></div>
            <div><Label>Debut</Label><Input type="datetime-local" value={form.starts_at} onChange={(e) => setF("starts_at", e.target.value)} /></div>
            <div><Label>Expiration</Label><Input type="datetime-local" value={form.expires_at} onChange={(e) => setF("expires_at", e.target.value)} /></div>
            <div className="col-span-2 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.free_shipping} onChange={(e) => setF("free_shipping", e.target.checked)} /> Livraison offerte</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.first_order_only} onChange={(e) => setF("first_order_only", e.target.checked)} /> 1ere commande uniquement</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={(e) => setF("active", e.target.checked)} /> Actif</label>
            </div>
            <Button onClick={save} className="col-span-2 bg-ink hover:bg-ink/90 rounded-none" data-testid="save-promo-btn">Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
