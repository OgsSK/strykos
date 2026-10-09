import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { money, fmtDate, mediaSrc, STATUSES, STATUS_LABELS, STATUS_COLORS, CARRIERS } from "@/lib/adminUtils";
import { toast } from "sonner";
import { ArrowLeft, Truck, Mail, RotateCcw, Trash2, Save, ExternalLink } from "lucide-react";

export default function AdminOrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [o, setO] = useState(null);
  const [tracking, setTracking] = useState({ tracking_carrier: "", tracking_number: "", tracking_url: "", mark_shipped: true, notify: true });
  const [notes, setNotes] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/admin/orders/${id}`).then((r) => {
    setO(r.data); setNotes(r.data.admin_notes || "");
    setTracking((t) => ({ ...t, tracking_carrier: r.data.tracking_carrier || "", tracking_number: r.data.tracking_number || "", tracking_url: r.data.tracking_url || "" }));
  }).catch(() => toast.error("Commande introuvable"));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!o) return <div className="text-ink-muted">Chargement...</div>;
  const addr = o.shipping_address || {};

  const run = async (fn, okMsg) => {
    setBusy(true);
    try { const r = await fn(); toast.success(typeof okMsg === "function" ? okMsg(r?.data) : okMsg); load(); }
    catch (e) { toast.error(apiError(e)); }
    setBusy(false);
  };
  const emailInfo = (d) => (d?.email ? ` · e-mail ${d.email.status === "sent" ? "envoye" : d.email.status}` : "");

  const setStatus = (status) => run(() => api.put(`/admin/orders/${o.id}/status`, { status, note: statusNote, notify: true }), (d) => `Statut: ${STATUS_LABELS[status]}${emailInfo(d)}`);
  const saveTracking = () => run(() => api.put(`/admin/orders/${o.id}/tracking`, tracking), (d) => `Suivi enregistre${emailInfo(d)}`);
  const saveNotes = () => run(() => api.put(`/admin/orders/${o.id}/notes`, { admin_notes: notes }), "Notes enregistrees");
  const resend = (template) => run(() => api.post(`/admin/orders/${o.id}/resend-email`, { template }), "E-mail renvoye");
  const refund = () => {
    const amt = window.prompt(`Montant a rembourser en ${o.charge_currency} (laisser vide = remboursement total ${o.charge_total})`, "");
    if (amt === null) return;
    const amount = amt.trim() === "" ? null : parseFloat(amt);
    if (!window.confirm(`Confirmer le remboursement Stripe ${amount == null ? "total" : amount + " " + o.charge_currency} ?`)) return;
    run(() => api.post(`/admin/orders/${o.id}/refund`, { amount, restock: true, notify: true }), "Remboursement effectue");
  };
  const remove = async () => {
    if (!window.confirm(`Supprimer definitivement la commande ${o.order_number} ?`)) return;
    try { await api.delete(`/admin/orders/${o.id}`); toast.success("Commande supprimee"); nav("/admin/orders"); } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div data-testid="admin-order-detail">
      <Link to="/admin/orders" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink mb-3"><ArrowLeft className="w-4 h-4" /> Commandes</Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="font-heading text-2xl font-bold uppercase" data-testid="order-detail-number">{o.order_number}</h1>
          <div className="text-sm text-ink-muted">{fmtDate(o.created_at, true)} · {o.lang?.toUpperCase()} · {o.currency}</div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className={`text-xs px-2 py-1 font-semibold ${STATUS_COLORS[o.status]}`} data-testid="order-detail-status">{STATUS_LABELS[o.status]}</span>
          <span className={`text-xs px-2 py-1 font-semibold ${o.payment_status === "paid" ? "bg-green-100 text-green-800" : o.payment_status === "refunded" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>Paiement: {o.payment_status}</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Items */}
          <div className="bg-white border border-border p-5">
            <h3 className="font-semibold uppercase text-sm mb-3">Articles</h3>
            {(o.items || []).map((it, i) => (
              <div key={i} className="flex gap-3 py-2 border-b border-border last:border-0 text-sm">
                <img src={mediaSrc(it.image)} alt="" className="w-12 h-14 object-cover bg-secondary" />
                <div className="flex-1">
                  <div className="font-medium">{it.name_fr}</div>
                  <div className="text-xs text-ink-muted">Taille {it.size} {it.color && `· ${it.color}`} · x{it.quantity} · {money(it.unit_price, o.currency)} / u</div>
                  {it.customization && <div className="text-xs text-brand">Flocage: {it.customization.name} {it.customization.number}</div>}
                </div>
                <div className="font-semibold">{money(it.line_total, o.currency)}</div>
              </div>
            ))}
            <div className="mt-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-ink-muted">Sous-total</span><span>{money(o.subtotal, o.currency)}</span></div>
              {o.discount > 0 && <div className="flex justify-between text-green-700"><span>Remise {o.promo_code && `(${o.promo_code})`}</span><span>-{money(o.discount, o.currency)}</span></div>}
              <div className="flex justify-between"><span className="text-ink-muted">Livraison · {o.shipping_method?.name_fr}</span><span>{money(o.shipping_cost, o.currency)}</span></div>
              <div className="flex justify-between font-bold text-base pt-2 border-t border-border"><span>Total</span><span>{money(o.total, o.currency)}</span></div>
              {o.charge_currency !== o.currency && <div className="text-xs text-ink-muted">Facture Stripe: {money(o.charge_total, o.charge_currency)}</div>}
            </div>
          </div>

          {/* Tracking */}
          <div className="bg-white border border-border p-5" data-testid="tracking-panel">
            <h3 className="font-semibold uppercase text-sm mb-3 inline-flex items-center gap-2"><Truck className="w-4 h-4" /> Suivi transporteur</h3>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label>Transporteur</Label>
                <Input list="carriers" value={tracking.tracking_carrier} onChange={(e) => setTracking({ ...tracking, tracking_carrier: e.target.value })} data-testid="tracking-carrier" />
                <datalist id="carriers">{CARRIERS.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div><Label>Numero de suivi</Label><Input value={tracking.tracking_number} onChange={(e) => setTracking({ ...tracking, tracking_number: e.target.value })} data-testid="tracking-number" /></div>
              <div><Label>Lien de suivi (https)</Label><Input value={tracking.tracking_url} onChange={(e) => setTracking({ ...tracking, tracking_url: e.target.value })} placeholder="https://..." data-testid="tracking-url" /></div>
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={tracking.mark_shipped} onChange={(e) => setTracking({ ...tracking, mark_shipped: e.target.checked })} /> Passer en "Expediee"</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={tracking.notify} onChange={(e) => setTracking({ ...tracking, notify: e.target.checked })} /> Envoyer l'e-mail au client</label>
            </div>
            <Button onClick={saveTracking} disabled={busy} className="mt-3 bg-ink hover:bg-ink/90 rounded-none" data-testid="save-tracking-btn"><Save className="w-4 h-4 mr-1" /> Enregistrer le suivi</Button>
            {o.tracking_url && <a href={o.tracking_url} target="_blank" rel="noreferrer" className="ml-3 text-sm text-brand inline-flex items-center gap-1">Ouvrir le suivi <ExternalLink className="w-3 h-3" /></a>}
          </div>

          {/* Notes */}
          <div className="bg-white border border-border p-5">
            <h3 className="font-semibold uppercase text-sm mb-3">Notes internes</h3>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="order-notes" />
            <Button onClick={saveNotes} disabled={busy} variant="outline" className="mt-2 rounded-none">Enregistrer les notes</Button>
          </div>

          {/* History */}
          <div className="bg-white border border-border p-5">
            <h3 className="font-semibold uppercase text-sm mb-3">Historique</h3>
            <ol className="text-sm space-y-2">
              {[...(o.status_history || [])].reverse().map((h, i) => (
                <li key={i} className="flex gap-3"><span className="text-xs text-ink-muted w-36 shrink-0">{fmtDate(h.at, true)}</span>
                  <span><span className={`text-[11px] px-1.5 py-0.5 ${STATUS_COLORS[h.status] || ""}`}>{STATUS_LABELS[h.status] || h.status}</span> <span className="text-ink-muted text-xs">par {h.by}</span>{h.note && <div className="text-xs text-ink-soft">{h.note}</div>}</span></li>
              ))}
            </ol>
          </div>
        </div>

        <div className="space-y-4">
          {/* Status */}
          <div className="bg-white border border-border p-5">
            <h3 className="font-semibold uppercase text-sm mb-3">Changer le statut</h3>
            <Input value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Note (optionnel)" className="mb-2" />
            <div className="grid grid-cols-2 gap-1">
              {STATUSES.map((s) => (
                <button key={s} disabled={busy || s === o.status} onClick={() => setStatus(s)} data-testid={`set-status-${s}`}
                  className={`text-xs px-2 py-1.5 border text-left ${s === o.status ? "border-ink bg-ink text-white" : "border-border hover:bg-secondary"}`}>{STATUS_LABELS[s]}</button>
              ))}
            </div>
            <p className="text-[11px] text-ink-muted mt-2">Expediee / Livree / Annulee / Remboursee declenchent un e-mail client.</p>
          </div>

          {/* Customer */}
          <div className="bg-white border border-border p-5 text-sm">
            <h3 className="font-semibold uppercase text-sm mb-3">Client</h3>
            <div className="font-medium">{o.first_name} {o.last_name}</div>
            <a href={`mailto:${o.email}`} className="text-brand block">{o.email}</a>
            <a href={`tel:${o.phone}`} className="block">{o.phone}</a>
            {o.user_id ? <Link to={`/admin/customers/${o.user_id}`} className="text-xs underline text-ink-muted">Voir la fiche client</Link> : <span className="text-xs text-ink-muted">Commande invite</span>}
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-xs uppercase text-ink-muted mb-1">Adresse de livraison</div>
              <div>{addr.address_line}</div><div>{addr.postal_code} {addr.city}, {addr.country}</div>
            </div>
          </div>

          {/* Emails */}
          <div className="bg-white border border-border p-5 text-sm">
            <h3 className="font-semibold uppercase text-sm mb-3 inline-flex items-center gap-2"><Mail className="w-4 h-4" /> E-mails</h3>
            {(o.emails || []).length === 0 && <p className="text-ink-muted text-xs">Aucun e-mail envoye</p>}
            {(o.emails || []).map((e) => (
              <div key={e.id} className="flex justify-between text-xs py-1 border-b border-border last:border-0">
                <span>{e.template}</span><span className={e.status === "sent" ? "text-green-600" : e.status === "failed" ? "text-red-600" : "text-ink-muted"} title={e.error}>{e.status}</span>
              </div>
            ))}
            <div className="flex flex-wrap gap-1 mt-3">
              <button onClick={() => resend("order_confirmed")} disabled={busy} className="text-xs border border-border px-2 py-1 hover:bg-secondary" data-testid="resend-confirmation">Renvoyer confirmation</button>
              <button onClick={() => resend("order_shipped")} disabled={busy} className="text-xs border border-border px-2 py-1 hover:bg-secondary">Renvoyer expedition</button>
            </div>
          </div>

          {/* Payments & danger */}
          <div className="bg-white border border-border p-5 text-sm">
            <h3 className="font-semibold uppercase text-sm mb-3">Paiement</h3>
            {(o.payments || []).map((p) => (
              <div key={p.id} className="text-xs py-1"><span className="capitalize">{p.provider}</span> · {money(p.amount, p.currency)} · <span className="font-semibold">{p.status}</span>{p.payment_intent && <div className="text-ink-muted truncate">{p.payment_intent}</div>}</div>
            ))}
            {o.payment_status === "paid" && (
              <Button onClick={refund} disabled={busy} variant="outline" className="mt-2 w-full rounded-none border-amber-400 text-amber-700 hover:bg-amber-50" data-testid="refund-btn"><RotateCcw className="w-4 h-4 mr-1" /> Rembourser via Stripe</Button>
            )}
            <Button onClick={remove} disabled={busy} variant="outline" className="mt-2 w-full rounded-none border-red-300 text-red-600 hover:bg-red-50" data-testid="delete-order-btn"><Trash2 className="w-4 h-4 mr-1" /> Supprimer la commande</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
