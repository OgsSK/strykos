import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { money, fmtDate, mediaSrc, STATUSES, STATUS_LABELS, STATUS_COLORS } from "@/lib/adminUtils";
import { toast } from "sonner";
import { ArrowLeft, Truck, Mail, RotateCcw, Trash2, Save, ExternalLink, AlertTriangle, CheckCircle2, XCircle, PackageCheck, Send } from "lucide-react";

export default function AdminOrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [o, setO] = useState(null);
  const [tracking, setTracking] = useState({ tracking_carrier: "", tracking_number: "", tracking_url: "", mark_shipped: true, notify: true });
  const [notes, setNotes] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [refuseReason, setRefuseReason] = useState("");
  const [showRefuse, setShowRefuse] = useState(false);
  // Retours
  const [returnRefuseReason, setReturnRefuseReason] = useState("");
  const [showReturnRefuse, setShowReturnRefuse] = useState(false);
  const [shippingOrigins, setShippingOrigins] = useState([]);
  const [segments, setSegments] = useState([]);
  const [originCountry, setOriginCountry] = useState("");

  const load = () => api.get(`/admin/orders/${id}`).then((r) => {
    setO(r.data); setNotes(r.data.admin_notes || "");
    setTracking((t) => ({ ...t, tracking_carrier: r.data.tracking_carrier || "", tracking_number: r.data.tracking_number || "", tracking_url: r.data.tracking_url || "" }));
  }).catch(() => toast.error("Commande introuvable"));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Charge les origines d'expedition depuis settings
  useEffect(() => {
    api.get("/settings").then((r) => {
      const origins = (r.data?.shipping?.origins) || [];
      setShippingOrigins(origins);
    }).catch(() => {});
  }, []);

  // Sync segments/origin quand o change
  useEffect(() => {
    if (!o) return;
    setSegments(o.shipping_segments && o.shipping_segments.length > 0
      ? o.shipping_segments
      : [{ carrier: o.tracking_carrier || "", tracking_number: o.tracking_number || "", tracking_url: o.tracking_url || "", status: "pending", note: "" }]
    );
    setOriginCountry(o.shipping_origin_country || "");
  }, [o?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!o) return <div className="text-ink-muted">Chargement...</div>;
  const addr = o.shipping_address || {};
  const isCancelRequest = o.status === "cancellation_requested";
  const isReturnRequested = o.status === "return_requested";
  const isReturnApproved = o.status === "return_approved";
  const isReturnShipped = o.status === "return_shipped";
  const isReturnReceived = o.status === "return_received";
  const returnType = o.return_type || "refund";
  const isExchange = returnType === "exchange";

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
    const amt = window.prompt(`Montant a rembourser en ${o.charge_currency} (laisser vide = total ${o.charge_total})`, "");
    if (amt === null) return;
    const amount = amt.trim() === "" ? null : parseFloat(amt);
    if (!window.confirm(`Confirmer le remboursement Stripe ${amount == null ? "total" : amount + " " + o.charge_currency} ?`)) return;
    run(() => api.post(`/admin/orders/${o.id}/refund`, { amount, restock: true, notify: true }), "Remboursement effectue");
  };
  const remove = async () => {
    if (!window.confirm(`Supprimer definitivement la commande ${o.order_number} ?`)) return;
    try { await api.delete(`/admin/orders/${o.id}`); toast.success("Commande supprimee"); nav("/admin/orders"); } catch (e) { toast.error(apiError(e)); }
  };

  // --- Annulation ---
  const approveCancellation = () => {
    if (!window.confirm(`Valider la demande d'annulation pour ${o.order_number} ?\n\nRemboursement Stripe automatique de ${money(o.charge_total, o.charge_currency)}.`)) return;
    run(() => api.post(`/admin/orders/${o.id}/approve-cancellation`), "Annulation validee · remboursement emis");
  };
  const refuseCancellation = () => {
    if (!showRefuse) return setShowRefuse(true);
    if (!window.confirm(`Refuser la demande d'annulation ?`)) return;
    run(() => api.post(`/admin/orders/${o.id}/refuse-cancellation`, { reason: refuseReason }), "Demande refusee");
    setShowRefuse(false); setRefuseReason("");
  };

  // --- Retours ---
  const approveReturn = () => {
    if (!window.confirm(`Valider la demande de retour pour ${o.order_number} ?\n\nLe client recevra les instructions d'expedition.`)) return;
    run(() => api.post(`/admin/orders/${o.id}/approve-return`), "Retour approuve");
  };
  const refuseReturn = () => {
    if (!showReturnRefuse) return setShowReturnRefuse(true);
    if (!window.confirm(`Refuser la demande de retour ?`)) return;
    run(() => api.post(`/admin/orders/${o.id}/refuse-return`, { reason: returnRefuseReason }), "Retour refuse");
    setShowReturnRefuse(false); setReturnRefuseReason("");
  };
  const markReturnReceived = () => {
    if (!window.confirm(`Confirmer la reception du colis retour ?\n\nLe client sera notifie.`)) return;
    run(() => api.post(`/admin/orders/${o.id}/mark-return-received`), "Colis retour marque recu");
  };
  const refundReturn = () => {
    const label = isExchange ? "l'echange" : "le remboursement";
    if (!window.confirm(`Confirmer ${label} apres controle du retour ?`)) return;
    run(() => api.post(`/admin/orders/${o.id}/refund-return`), isExchange ? "Echange valide" : "Remboursement emis");
  };

  // --- Expédition : segments ---
  const originFor = (countryCode) => {
    const code = (countryCode || "").toUpperCase();
    return shippingOrigins.find((x) => x.country === code && x.is_default)
        || shippingOrigins.find((x) => x.country === code)
        || null;
  };

  const currentOrigin = originFor(originCountry || addr.country);

  const updateSegment = (i, patch) => {
    setSegments((s) => s.map((seg, idx) => (idx === i ? { ...seg, ...patch } : seg)));
  };
  const addSegment = () => {
    if (segments.length >= 3) return;
    setSegments((s) => [...s, { carrier: "", tracking_number: "", tracking_url: "", status: "pending", note: "" }]);
  };
  const removeSegment = (i) => {
    setSegments((s) => s.filter((_, idx) => idx !== i));
  };

  const saveSegments = () => {
    // On envoie seulement les segments non vides
    const clean = segments
      .map((s) => ({
        carrier: (s.carrier || "").trim(),
        tracking_number: (s.tracking_number || "").trim(),
        tracking_url: (s.tracking_url || "").trim(),
        status: s.status || "pending",
        note: (s.note || "").trim(),
      }))
      .filter((s) => s.carrier || s.tracking_number);

    if (clean.length === 0) {
      return run(
        () => api.put(`/admin/orders/${o.id}/tracking`, {
          tracking_carrier: "", tracking_number: "", tracking_url: "",
          mark_shipped: false, notify: false,
          shipping_origin_country: originCountry || "",
          segments: [],
        }),
        "Expédition mise a jour"
      );
    }

    run(
      () => api.put(`/admin/orders/${o.id}/tracking`, {
        tracking_carrier: clean[0].carrier,
        tracking_number: clean[0].tracking_number,
        tracking_url: clean[0].tracking_url,
        mark_shipped: o.status === "paid" || o.status === "preparing",
        notify: true,
        shipping_origin_country: originCountry || "",
        segments: clean,
      }),
      (d) => `Expédition mise a jour${emailInfo(d)}`
    );
  };

  const setSegmentStatus = (i, status) => {
    run(
      () => api.put(`/admin/orders/${o.id}/segments/${i}/status`, {
        index: i,
        status,
        note: "",
        notify: true,
      }),
      `Segment ${i + 1} : ${status}`
    );
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

      {/* Bannière : demande d'annulation */}
      {isCancelRequest && (
        <div className="border-2 border-red-300 bg-red-50 p-5 mb-5" data-testid="cancellation-request-panel">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-heading font-bold uppercase text-base mb-1 text-red-800">Demande d'annulation client</h3>
              <p className="text-sm text-red-700 mb-2">
                Le client demande l'annulation{o.cancellation_requested_at && ` (recue le ${fmtDate(o.cancellation_requested_at, true)})`}.
              </p>
              {o.cancellation_reason && (
                <div className="text-sm bg-white border border-red-200 p-3 mt-2">
                  <div className="text-xs uppercase tracking-wider text-ink-muted mb-1">Raison du client :</div>
                  <div className="text-ink">{o.cancellation_reason}</div>
                </div>
              )}
            </div>
          </div>
          {!showRefuse ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={approveCancellation} disabled={busy}
                className="bg-green-600 hover:bg-green-700 text-white rounded-none font-bold uppercase text-xs inline-flex items-center gap-1.5"
                data-testid="approve-cancellation-btn">
                <CheckCircle2 className="w-4 h-4" /> Valider et rembourser ({money(o.charge_total, o.charge_currency)})
              </Button>
              <Button onClick={() => setShowRefuse(true)} disabled={busy} variant="outline"
                className="rounded-none font-bold uppercase text-xs border-red-300 text-red-600 hover:bg-red-50 inline-flex items-center gap-1.5"
                data-testid="refuse-cancellation-open-btn">
                <XCircle className="w-4 h-4" /> Refuser la demande
              </Button>
            </div>
          ) : (
            <div className="bg-white border border-red-200 p-4 space-y-3">
              <div>
                <Label className="text-xs uppercase tracking-wider text-ink-muted">Motif du refus (visible par le client)</Label>
                <Textarea rows={3} value={refuseReason} onChange={(e) => setRefuseReason(e.target.value)}
                  placeholder="Ex: La commande est deja en cours d'expedition..." className="mt-1 rounded-none" data-testid="refuse-reason-input" />
              </div>
              <div className="flex gap-2">
                <Button onClick={refuseCancellation} disabled={busy}
                  className="bg-red-600 hover:bg-red-700 text-white rounded-none font-bold uppercase text-xs"
                  data-testid="refuse-cancellation-confirm-btn">
                  {busy ? "..." : "Confirmer le refus"}
                </Button>
                <Button onClick={() => { setShowRefuse(false); setRefuseReason(""); }} disabled={busy} variant="outline" className="rounded-none text-xs">
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bannière : demande de retour */}
      {isReturnRequested && (
        <div className="border-2 border-orange-300 bg-orange-50 p-5 mb-5" data-testid="return-request-panel">
          <div className="flex items-start gap-3 mb-4">
            <RotateCcw className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-heading font-bold uppercase text-base mb-1 text-orange-800">Demande de retour client</h3>
              <p className="text-sm text-orange-700 mb-2">
                <strong>RMA :</strong> <span className="font-mono">{o.return_rma_code}</span>
                {o.return_requested_at && ` · recue le ${fmtDate(o.return_requested_at, true)}`}
              </p>
              <p className="text-sm text-orange-700 mb-2">
                <strong>Type :</strong> {isExchange ? "Échange" : "Remboursement"}
              </p>
              {o.return_reason && (
                <div className="text-sm bg-white border border-orange-200 p-3 mt-2 mb-2">
                  <div className="text-xs uppercase tracking-wider text-ink-muted mb-1">Message du client :</div>
                  <div className="text-ink">{o.return_reason}</div>
                </div>
              )}
              <div className="text-sm bg-white border border-orange-200 p-3">
                <div className="text-xs uppercase tracking-wider text-ink-muted mb-2">Articles à retourner :</div>
                <ul className="space-y-1.5">
                  {(o.return_products || []).map((rp, i) => (
                    <li key={i} className="text-sm">
                      <strong>{rp.name_fr}</strong> {rp.size && <span className="text-ink-muted">· Taille {rp.size}</span>} × {rp.quantity}
                      <div className="text-xs text-ink-muted italic">Motif : {rp.reason}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          {!showReturnRefuse ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={approveReturn} disabled={busy}
                className="bg-green-600 hover:bg-green-700 text-white rounded-none font-bold uppercase text-xs inline-flex items-center gap-1.5"
                data-testid="approve-return-btn">
                <CheckCircle2 className="w-4 h-4" /> Valider le retour
              </Button>
              <Button onClick={() => setShowReturnRefuse(true)} disabled={busy} variant="outline"
                className="rounded-none font-bold uppercase text-xs border-orange-300 text-orange-700 hover:bg-orange-50 inline-flex items-center gap-1.5"
                data-testid="refuse-return-open-btn">
                <XCircle className="w-4 h-4" /> Refuser le retour
              </Button>
            </div>
          ) : (
            <div className="bg-white border border-orange-200 p-4 space-y-3">
              <div>
                <Label className="text-xs uppercase tracking-wider text-ink-muted">Motif du refus (visible par le client)</Label>
                <Textarea rows={3} value={returnRefuseReason} onChange={(e) => setReturnRefuseReason(e.target.value)}
                  placeholder="Ex: Article personnalisé, emballage manquant, article porté..." className="mt-1 rounded-none" data-testid="return-refuse-reason-input" />
              </div>
              <div className="flex gap-2">
                <Button onClick={refuseReturn} disabled={busy}
                  className="bg-orange-600 hover:bg-orange-700 text-white rounded-none font-bold uppercase text-xs"
                  data-testid="refuse-return-confirm-btn">
                  {busy ? "..." : "Confirmer le refus"}
                </Button>
                <Button onClick={() => { setShowReturnRefuse(false); setReturnRefuseReason(""); }} disabled={busy} variant="outline" className="rounded-none text-xs">
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bannière : retour approuvé / expédié — en attente de réception */}
      {(isReturnApproved || isReturnShipped) && (
        <div className="border-2 border-orange-300 bg-orange-50 p-5 mb-5" data-testid="return-in-progress-panel">
          <div className="flex items-start gap-3 mb-4">
            <Truck className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-heading font-bold uppercase text-base mb-1 text-orange-800">
                {isReturnApproved ? "Retour approuvé — en attente d'expédition" : "Colis retour en transit"}
              </h3>
              <p className="text-sm text-orange-700 mb-2">
                <strong>RMA :</strong> <span className="font-mono">{o.return_rma_code}</span>
              </p>
              {o.return_tracking_number ? (
                <p className="text-sm text-orange-700">
                  <strong>Numéro de suivi :</strong> <span className="font-mono">{o.return_tracking_number}</span>
                </p>
              ) : (
                <p className="text-sm text-orange-700 italic">Le client n'a pas encore indiqué de numéro de suivi.</p>
              )}
            </div>
          </div>
          <Button onClick={markReturnReceived} disabled={busy}
            className="bg-ink hover:bg-ink/90 text-white rounded-none font-bold uppercase text-xs inline-flex items-center gap-1.5"
            data-testid="mark-return-received-btn">
            <PackageCheck className="w-4 h-4" /> Marquer le colis comme reçu
          </Button>
        </div>
      )}

      {/* Bannière : retour reçu — contrôle en cours */}
      {isReturnReceived && (
        <div className="border-2 border-orange-400 bg-orange-100 p-5 mb-5" data-testid="return-received-panel">
          <div className="flex items-start gap-3 mb-4">
            <PackageCheck className="w-6 h-6 text-orange-700 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-heading font-bold uppercase text-base mb-1 text-orange-900">Colis retour reçu — contrôle en cours</h3>
              <p className="text-sm text-orange-800 mb-2">
                <strong>RMA :</strong> <span className="font-mono">{o.return_rma_code}</span>
                {o.return_received_at && ` · reçu le ${fmtDate(o.return_received_at, true)}`}
              </p>
              <div className="text-sm bg-white border border-orange-300 p-3">
                <div className="text-xs uppercase tracking-wider text-ink-muted mb-2">Articles à contrôler :</div>
                <ul className="space-y-1.5">
                  {(o.return_products || []).map((rp, i) => (
                    <li key={i} className="text-sm">
                      <strong>{rp.name_fr}</strong> {rp.size && <span className="text-ink-muted">· Taille {rp.size}</span>} × {rp.quantity}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={refundReturn} disabled={busy}
              className="bg-green-600 hover:bg-green-700 text-white rounded-none font-bold uppercase text-xs inline-flex items-center gap-1.5"
              data-testid="refund-return-btn">
              {isExchange ? <Send className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
              {isExchange ? "Valider l'échange" : `Émettre le remboursement (${money(o.charge_total, o.charge_currency)})`}
            </Button>
            <Button onClick={() => { setShowReturnRefuse(true); }} disabled={busy} variant="outline"
              className="rounded-none font-bold uppercase text-xs border-orange-300 text-orange-700 hover:bg-orange-50 inline-flex items-center gap-1.5"
              data-testid="refuse-after-receipt-btn">
              <XCircle className="w-4 h-4" /> Refuser après contrôle
            </Button>
          </div>
        </div>
      )}

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

          {/* Expédition - Origine + Segments */}
          <div className="bg-white border border-border p-5" data-testid="shipping-panel">
            <h3 className="font-semibold uppercase text-sm mb-3 inline-flex items-center gap-2"><Truck className="w-4 h-4" /> Expédition</h3>

            {/* Origine */}
            <div className="mb-4">
              <Label className="text-xs uppercase tracking-wider text-ink-muted">Origine d'expédition</Label>
              <select
                value={originCountry || (currentOrigin?.country || "")}
                onChange={(e) => setOriginCountry(e.target.value)}
                className="mt-1 w-full sm:w-64 border border-border h-10 px-3 bg-white text-sm"
                data-testid="shipping-origin-select"
              >
                <option value="">-- Choisir --</option>
                {shippingOrigins.map((org, i) => (
                  <option key={i} value={org.country}>
                    {org.name || org.country} ({org.country}){org.is_default ? " · défaut" : ""}
                  </option>
                ))}
              </select>
              {currentOrigin && (
                <div className="text-xs text-ink-soft mt-2 bg-secondary p-3">
                  <div className="font-medium">{currentOrigin.name}</div>
                  <div>{currentOrigin.address_line}</div>
                  <div>{currentOrigin.postal_code} {currentOrigin.city}</div>
                  {currentOrigin.phone && <div>Tél : {currentOrigin.phone}</div>}
                </div>
              )}
              {shippingOrigins.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Aucune origine configurée. Va dans <strong>Paramètres → Livraison</strong> pour en ajouter.
                </p>
              )}
            </div>

            {/* Segments */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-xs uppercase tracking-wider text-ink-muted">
                  Segments d'expédition ({segments.length}/3)
                </Label>
                {segments.length < 3 && (
                  <button type="button" onClick={addSegment}
                    className="text-xs text-brand font-semibold hover:underline inline-flex items-center gap-1"
                    data-testid="add-segment-btn">
                    + Ajouter un segment
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {segments.map((seg, i) => (
                  <div key={i} className="border border-border p-3 bg-secondary/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] uppercase tracking-wider font-semibold">
                        Segment {i + 1}
                        {seg.status === "delivered" && <span className="ml-2 text-green-700">· livré</span>}
                        {seg.status === "in_transit" && <span className="ml-2 text-cyan-700">· en transit</span>}
                        {seg.status === "failed" && <span className="ml-2 text-red-700">· échec</span>}
                      </span>
                      {segments.length > 1 && (
                        <button type="button" onClick={() => removeSegment(i)}
                          className="text-red-600 hover:bg-red-50 p-1 text-xs">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid sm:grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Transporteur</Label>
                        <Input
                          list="carrier-suggestions"
                          value={seg.carrier || ""}
                          onChange={(e) => updateSegment(i, { carrier: e.target.value })}
                          placeholder="bpost, DHL, Coursier..."
                          className="h-9"
                          data-testid={`segment-carrier-${i}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">N° de suivi (optionnel)</Label>
                        <Input
                          value={seg.tracking_number || ""}
                          onChange={(e) => updateSegment(i, { tracking_number: e.target.value })}
                          placeholder="Laisser vide si pas de suivi"
                          className="h-9 font-mono"
                          data-testid={`segment-tracking-${i}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Lien de suivi</Label>
                        <Input
                          value={seg.tracking_url || ""}
                          onChange={(e) => updateSegment(i, { tracking_url: e.target.value })}
                          placeholder="Auto-généré si connu"
                          className="h-9 text-xs"
                          data-testid={`segment-url-${i}`}
                        />
                      </div>
                    </div>

                    {/* Statut rapide */}
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      <span className="text-[11px] text-ink-muted">Statut :</span>
                      {[
                        { v: "pending", l: "En attente" },
                        { v: "in_transit", l: "En transit" },
                        { v: "delivered", l: "Livré" },
                        { v: "failed", l: "Échec" },
                      ].map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          disabled={seg.status === opt.v}
                          onClick={() => {
                            updateSegment(i, { status: opt.v });
                          }}
                          className={`text-[11px] px-2 py-1 border ${seg.status === opt.v ? "bg-ink text-white border-ink" : "border-border hover:bg-secondary"}`}
                        >
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <datalist id="carrier-suggestions">
                {(currentOrigin?.carriers || []).map((c) => <option key={c} value={c} />)}
              </datalist>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={saveSegments} disabled={busy} className="bg-ink hover:bg-ink/90 rounded-none" data-testid="save-shipping-btn">
                  <Save className="w-4 h-4 mr-1" /> Enregistrer l'expédition
                </Button>
                {o.status === "paid" || o.status === "preparing" ? (
                  <span className="text-xs text-ink-muted self-center">
                    En enregistrant, la commande passera à <strong>Expédiée</strong> et le client sera notifié.
                  </span>
                ) : null}
              </div>
            </div>
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
            <p className="text-[11px] text-ink-muted mt-2">Utilisez les boutons des bannières orange/rouge en haut pour les flux de retour et d'annulation.</p>
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
            {o.payment_status === "paid" && !isReturnReceived && (
              <Button onClick={refund} disabled={busy} variant="outline" className="mt-2 w-full rounded-none border-amber-400 text-amber-700 hover:bg-amber-50" data-testid="refund-btn"><RotateCcw className="w-4 h-4 mr-1" /> Rembourser via Stripe</Button>
            )}
            <Button onClick={remove} disabled={busy} variant="outline" className="mt-2 w-full rounded-none border-red-300 text-red-600 hover:bg-red-50" data-testid="delete-order-btn"><Trash2 className="w-4 h-4 mr-1" /> Supprimer la commande</Button>
          </div>
        </div>
      </div>
    </div>
  );
}