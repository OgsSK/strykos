import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { money, fmtDate, mediaSrc, STATUSES, STATUS_LABELS, STATUS_COLORS } from "@/lib/adminUtils";
import { toast } from "sonner";
import { ArrowLeft, Truck, Mail, RotateCcw, Trash2, Save, AlertTriangle, CheckCircle2, XCircle, MessageSquare, Send, Image as ImageIcon, Film, Loader2, Copy, RefreshCw, KeyRound } from "lucide-react";

// ⭐ Taux fixe FCFA ↔ EUR (parité officielle depuis 1999)
const XOF_RATE = 655.957;
const xofToEur = (xof) => {
  if (xof === "" || xof === null || xof === undefined) return null;
  const n = parseFloat(xof);
  if (isNaN(n)) return null;
  return Math.round((n / XOF_RATE) * 100) / 100;
};
const eurToXof = (eur) => {
  if (eur === "" || eur === null || eur === undefined) return 0;
  return Math.round(parseFloat(eur) * XOF_RATE);
};

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
  // Réclamations
  const [returnRefuseReason, setReturnRefuseReason] = useState("");
  const [showReturnRefuse, setShowReturnRefuse] = useState(false);
  const [shippingOrigins, setShippingOrigins] = useState([]);
  const [segments, setSegments] = useState([]);
  const [originCountry, setOriginCountry] = useState("");

  // ⭐ Modale unifiée : accepter + rembourser
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimAmount, setClaimAmount] = useState("");
  const [claimMessage, setClaimMessage] = useState("");

  // ⭐ Modale remboursement direct (hors réclamation)
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMessage, setRefundMessage] = useState("");

  // ⭐ NOUVEAU : Réclamation — conversation + demande d'infos
  const [claimMessages, setClaimMessages] = useState([]);
  const [showClaimInfoModal, setShowClaimInfoModal] = useState(false);
  const [claimInfoMessage, setClaimInfoMessage] = useState("");
  const [claimInfoTypes, setClaimInfoTypes] = useState(["photo"]); // ["photo","video"]
  const [claimInfoBusy, setClaimInfoBusy] = useState(false);

  // ⭐ NOUVEAU : OTP livraison
  const [otpBusy, setOtpBusy] = useState(false);
  const [showOtp, setShowOtp] = useState(false);

  // ⭐ MODIFIÉ : charge aussi la conversation
  const load = async () => {
    try {
      const { data } = await api.get(`/admin/orders/${id}`);
      setO(data);
      setNotes(data.admin_notes || "");
      setTracking((t) => ({
        ...t,
        tracking_carrier: data.tracking_carrier || "",
        tracking_number: data.tracking_number || "",
        tracking_url: data.tracking_url || "",
      }));
      // ⭐ Charge la conversation si une réclamation existe
      if (data.return_rma_code) {
        try {
          const { data: msgs } = await api.get(`/admin/orders/${id}/claim/messages`);
          setClaimMessages(msgs || []);
        } catch {
          setClaimMessages([]);
        }
      }
    } catch {
      toast.error("Commande introuvable");
    }
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.get("/settings").then((r) => {
      const origins = (r.data?.shipping?.origins) || [];
      setShippingOrigins(origins);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!o) return;
    setSegments(o.shipping_segments && o.shipping_segments.length > 0
      ? o.shipping_segments
      : [{ carrier: o.tracking_carrier || "", tracking_number: o.tracking_number || "", tracking_url: o.tracking_url || "", status: "pending", note: "" }]
    );
    setOriginCountry(o.shipping_origin_country || "");
  }, [o?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⭐ NOUVEAU : utilitaire OTP — copie
  const copyOtp = () => {
    if (!o?.delivery_otp) return;
    navigator.clipboard.writeText(o.delivery_otp);
    toast.success("Code copié");
  };

  // ⭐ NOUVEAU : utilitaire OTP — régénérer
  const regenerateOtp = async () => {
    if (!window.confirm(`Générer un nouveau code OTP ?\n\nL'ancien code ne fonctionnera plus.`)) return;
    setOtpBusy(true);
    try {
      const { data } = await api.post(`/admin/orders/${o.id}/regenerate-otp`);
      toast.success(`Nouveau code : ${data.otp}`);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
    setOtpBusy(false);
  };

  // ⭐ NOUVEAU : utilitaire OTP — renvoyer l'email
  const resendOtpEmail = async () => {
    setOtpBusy(true);
    try {
      await api.post(`/admin/orders/${o.id}/resend-otp-email`);
      toast.success("Email renvoyé au client");
    } catch (e) {
      toast.error(apiError(e));
    }
    setOtpBusy(false);
  };

  if (!o) return <div className="text-ink-muted">Chargement...</div>;
  const addr = o.shipping_address || {};
  const isCancelRequest = o.status === "cancellation_requested";
  const isReturnRequested = o.status === "return_requested";
  const isReturnApproved = o.status === "return_approved";
  const isReturnReceived = o.status === "return_received";

  // Réclamation active (à traiter)
  const hasActiveClaim = isReturnRequested || isReturnApproved || isReturnReceived;
  // ⭐ Déjà remboursée → rien à faire
  const isAlreadyRefunded = o.payment_status === "refunded" || o.payment_status === "partially_refunded";

  const run = async (fn, okMsg) => {
    setBusy(true);
    try { const r = await fn(); toast.success(typeof okMsg === "function" ? okMsg(r?.data) : okMsg); load(); }
    catch (e) { toast.error(apiError(e)); }
    setBusy(false);
  };
  const emailInfo = (d) => (d?.email ? ` · e-mail ${d.email.status === "sent" ? "envoyé" : d.email.status}` : "");

  const setStatus = (status) => run(() => api.put(`/admin/orders/${o.id}/status`, { status, note: statusNote, notify: true }), (d) => `Statut: ${STATUS_LABELS[status]}${emailInfo(d)}`);
  const saveNotes = () => run(() => api.put(`/admin/orders/${o.id}/notes`, { admin_notes: notes }), "Notes enregistrées");
  const resend = (template) => run(() => api.post(`/admin/orders/${o.id}/resend-email`, { template }), "E-mail renvoyé");

  // ⭐ Ouvrir la modale réclamation
  const openClaimModal = () => {
    setClaimAmount("");
    setClaimMessage("");
    setShowClaimModal(true);
  };

  // ⭐ Confirmer : accepter + rembourser en 1 action
  const confirmClaim = async () => {
    const inputXof = claimAmount.trim() === "" ? null : parseFloat(claimAmount);
    if (inputXof !== null && (isNaN(inputXof) || inputXof <= 0)) {
      toast.error("Montant invalide");
      return;
    }
    const amountEur = inputXof !== null ? Math.round((inputXof / XOF_RATE) * 100) / 100 : null;

    setBusy(true);
    try {
      if (isReturnRequested) {
        await api.post(`/admin/orders/${o.id}/approve-return`);
      }
      await api.post(`/admin/orders/${o.id}/refund-return`, {
        amount: amountEur,
        message: claimMessage,
      });

      const amtXof = amountEur ? Math.round(parseFloat(amountEur) * XOF_RATE) : null;
      toast.success(
        amtXof
          ? `Remboursement partiel de ${amtXof.toLocaleString("fr-FR")} FCFA émis`
          : "Remboursement total émis"
      );
      setShowClaimModal(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
    setBusy(false);
  };

  // ⭐ Remboursement direct (sans réclamation)
  const openRefundModal = () => {
    setRefundAmount("");
    setRefundMessage("");
    setShowRefundModal(true);
  };

  const confirmRefund = () => {
    const inputXof = refundAmount.trim() === "" ? null : parseFloat(refundAmount);
    if (inputXof !== null && (isNaN(inputXof) || inputXof <= 0)) {
      toast.error("Montant invalide");
      return;
    }
    const amountEur = inputXof !== null ? Math.round((inputXof / XOF_RATE) * 100) / 100 : null;

    run(
      () => api.post(`/admin/orders/${o.id}/refund`, {
        amount: amountEur,
        notify: true,
        message: refundMessage,
      }),
      "Remboursement effectué"
    );
    setShowRefundModal(false);
  };

  const remove = async () => {
    if (!window.confirm(`Supprimer définitivement la commande ${o.order_number} ?`)) return;
    try { await api.delete(`/admin/orders/${o.id}`); toast.success("Commande supprimée"); nav("/admin/orders"); } catch (e) { toast.error(apiError(e)); }
  };

  // --- Annulation ---
  const approveCancellation = () => {
    if (!window.confirm(`Valider la demande d'annulation pour ${o.order_number} ?\n\nRemboursement Stripe automatique de ${money(o.charge_total, o.charge_currency)}.`)) return;
    run(() => api.post(`/admin/orders/${o.id}/approve-cancellation`), "Annulation validée · remboursement émis");
  };
  const refuseCancellation = () => {
    if (!showRefuse) return setShowRefuse(true);
    if (!window.confirm(`Refuser la demande d'annulation ?`)) return;
    run(() => api.post(`/admin/orders/${o.id}/refuse-cancellation`, { reason: refuseReason }), "Demande refusée");
    setShowRefuse(false); setRefuseReason("");
  };

  // --- Réclamations ---
  const refuseReturn = () => {
    if (!showReturnRefuse) return setShowReturnRefuse(true);
    if (!window.confirm(`Refuser la réclamation ?`)) return;
    run(() => api.post(`/admin/orders/${o.id}/refuse-return`, { reason: returnRefuseReason }), "Réclamation refusée");
    setShowReturnRefuse(false); setReturnRefuseReason("");
  };

  // ⭐ NOUVEAU : Admin demande des infos complémentaires
  const submitClaimInfo = async () => {
    if (!claimInfoMessage.trim()) {
      toast.error("Écrivez un message au client");
      return;
    }
    if (claimInfoTypes.length === 0) {
      toast.error("Sélectionnez au moins un type de fichier");
      return;
    }
    setClaimInfoBusy(true);
    try {
      await api.post(`/admin/orders/${o.id}/claim/request-info`, {
        message: claimInfoMessage.trim(),
        requested_types: claimInfoTypes,
      });
      toast.success("Demande envoyée au client");
      setShowClaimInfoModal(false);
      setClaimInfoMessage("");
      setClaimInfoTypes(["photo"]);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
    setClaimInfoBusy(false);
  };

  const openClaimInfoModal = () => {
    setClaimInfoMessage("");
    setClaimInfoTypes(["photo"]);
    setShowClaimInfoModal(true);
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
  const removeSegment = (i) => setSegments((s) => s.filter((_, idx) => idx !== i));

  const saveSegments = () => {
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
        "Expédition mise à jour"
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
      (d) => `Expédition mise à jour${emailInfo(d)}`
    );
  };

  return (
    <div data-testid="admin-order-detail">
      <Link to="/admin/orders" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink mb-3">
        <ArrowLeft className="w-4 h-4" /> Commandes
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="font-heading text-2xl font-bold uppercase" data-testid="order-detail-number">{o.order_number}</h1>
          <div className="text-sm text-ink-muted">{fmtDate(o.created_at, true)} · {o.lang?.toUpperCase()} · {o.currency}</div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className={`text-xs px-2 py-1 font-semibold ${STATUS_COLORS[o.status]}`} data-testid="order-detail-status">{STATUS_LABELS[o.status]}</span>
          {/* ⭐ NOUVEAU : badge de mode de livraison */}
          {o.delivered_via === "otp" && (
            <span className="text-xs px-2 py-1 font-semibold bg-purple-100 text-purple-800">
              ✅ Livré par livreur (OTP)
            </span>
          )}
          {o.delivered_via === "admin_manual" && (
            <span className="text-xs px-2 py-1 font-semibold bg-gray-100 text-gray-700">
              👤 Livré manuellement (admin)
            </span>
          )}
          <span className={`text-xs px-2 py-1 font-semibold ${o.payment_status === "paid" ? "bg-green-100 text-green-800" : isAlreadyRefunded ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>Paiement: {o.payment_status}</span>
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
                Le client demande l'annulation{o.cancellation_requested_at && ` (reçue le ${fmtDate(o.cancellation_requested_at, true)})`}.
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
                  placeholder="Ex: La commande est déjà en cours d'expédition..." className="mt-1 rounded-none" />
              </div>
              <div className="flex gap-2">
                <Button onClick={refuseCancellation} disabled={busy}
                  className="bg-red-600 hover:bg-red-700 text-white rounded-none font-bold uppercase text-xs">
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

      {/* ⭐ Bannière : réclamation client — AVEC médias + conversation */}
      {(isReturnRequested || isReturnApproved) && !isAlreadyRefunded && (
        <div className="border-2 border-orange-300 bg-orange-50 p-5 mb-5" data-testid="return-request-panel">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-heading font-bold uppercase text-base mb-1 text-orange-800">
                Réclamation client
                {isReturnApproved && <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5">Acceptée · remboursement à faire</span>}
              </h3>
              <p className="text-sm text-orange-700 mb-2">
                <strong>Code :</strong> <span className="font-mono">{o.return_rma_code}</span>
                {o.return_requested_at && ` · reçue le ${fmtDate(o.return_requested_at, true)}`}
              </p>

              {/* ⭐ Demande d'infos en cours */}
              {o.claim_info_requested_at && (
                <div className="text-sm bg-amber-100 border border-amber-400 rounded p-3 mb-3">
                  <div className="font-bold text-amber-900 mb-1">
                    ⏳ En attente de la réponse du client
                  </div>
                  <p className="text-xs text-amber-800">
                    Demande envoyée le {fmtDate(o.claim_info_requested_at, true)}
                  </p>
                  <div className="mt-2 text-xs bg-white border border-amber-300 rounded p-2 text-ink whitespace-pre-line">
                    {o.claim_info_request_message}
                  </div>
                  <div className="mt-2 text-[11px] text-amber-800">
                    Types demandés : {o.claim_info_request_types?.join(", ") || "—"}
                  </div>
                </div>
              )}

              {/* ⭐ Conversation (messages + médias) */}
              {claimMessages.length > 0 && (
                <div className="mb-3 space-y-2">
                  <div className="text-xs uppercase tracking-wider font-semibold text-ink-muted">
                    💬 Conversation
                  </div>
                  <div className="bg-white border border-orange-200 rounded p-3 max-h-80 overflow-y-auto space-y-3">
                    {claimMessages.map((m, i) => (
                      <div key={i} className={`flex ${m.sender === "admin" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-lg p-3 text-sm ${
                          m.sender === "admin"
                            ? "bg-brand text-white"
                            : "bg-secondary border border-border"
                        }`}>
                          <div className={`text-[10px] mb-1 ${m.sender === "admin" ? "opacity-80" : "text-ink-muted"}`}>
                            {m.sender === "admin" ? "👨‍🍳 Admin" : "👤 Client"}
                            {m.sender_email && ` · ${m.sender_email}`}
                            {" · "}
                            {fmtDate(m.created_at, true)}
                          </div>
                          {m.text && <div className="whitespace-pre-line">{m.text}</div>}
                          {m.media_urls?.length > 0 && (
                            <div className="mt-2 grid grid-cols-3 gap-1">
                              {m.media_urls.slice(0, 6).map((media, j) => (
                                media.type === "image" ? (
                                  <a key={j} href={mediaSrc(media.url)} target="_blank" rel="noreferrer">
                                    <img
                                      src={mediaSrc(media.url)}
                                      alt=""
                                      className="aspect-square rounded object-cover hover:opacity-80 transition-opacity cursor-pointer"
                                    />
                                  </a>
                                ) : (
                                  <video
                                    key={j}
                                    src={mediaSrc(media.url)}
                                    controls
                                    className="aspect-square rounded object-cover"
                                  />
                                )
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ⭐ Fallback : médias orphelins (ancien format) */}
              {claimMessages.length === 0 && (o.claim_media_urls?.length > 0) && (
                <div className="text-sm bg-white border border-orange-200 p-3 mb-3">
                  <div className="text-xs uppercase tracking-wider text-ink-muted mb-2">
                    Médias envoyés par le client
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {o.claim_media_urls.slice(0, 8).map((media, i) => (
                      media.type === "image" ? (
                        <a key={i} href={mediaSrc(media.url)} target="_blank" rel="noreferrer">
                          <img src={mediaSrc(media.url)} alt="" className="aspect-square rounded object-cover hover:opacity-80 cursor-pointer" />
                        </a>
                      ) : (
                        <video key={i} src={mediaSrc(media.url)} controls className="aspect-square rounded object-cover" />
                      )
                    ))}
                  </div>
                </div>
              )}

              {/* Articles concernés */}
              <div className="text-sm bg-white border border-orange-200 p-3">
                <div className="text-xs uppercase tracking-wider text-ink-muted mb-2">Articles concernés :</div>
                <ul className="space-y-1.5">
                  {(o.return_products || []).map((rp, i) => (
                    <li key={i} className="text-sm">
                      <strong>{rp.name_fr}</strong> {rp.size && <span className="text-ink-muted">· {rp.size}</span>} × {rp.quantity}
                      <div className="text-xs text-ink-muted italic">Motif : {rp.reason}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {!showReturnRefuse ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={openClaimModal} disabled={busy}
                className="bg-green-600 hover:bg-green-700 text-white rounded-none font-bold uppercase text-xs inline-flex items-center gap-1.5"
                data-testid="accept-refund-btn">
                <CheckCircle2 className="w-4 h-4" /> Accepter et rembourser
              </Button>
              <Button onClick={openClaimInfoModal} disabled={busy || !!o.claim_info_requested_at} variant="outline"
                className="rounded-none font-bold uppercase text-xs border-blue-300 text-blue-700 hover:bg-blue-50 inline-flex items-center gap-1.5 disabled:opacity-50"
                data-testid="request-info-btn"
                title={o.claim_info_requested_at ? "Une demande est déjà en attente" : ""}>
                <MessageSquare className="w-4 h-4" /> Demander des infos
              </Button>
              <Button onClick={() => setShowReturnRefuse(true)} disabled={busy} variant="outline"
                className="rounded-none font-bold uppercase text-xs border-orange-300 text-orange-700 hover:bg-orange-50 inline-flex items-center gap-1.5"
                data-testid="refuse-return-open-btn">
                <XCircle className="w-4 h-4" /> Refuser la réclamation
              </Button>
            </div>
          ) : (
            <div className="bg-white border border-orange-200 p-4 space-y-3">
              <div>
                <Label className="text-xs uppercase tracking-wider text-ink-muted">Motif du refus (visible par le client)</Label>
                <Textarea rows={3} value={returnRefuseReason} onChange={(e) => setReturnRefuseReason(e.target.value)}
                  placeholder="Ex: Le gâteau correspondait bien à la commande..." className="mt-1 rounded-none" data-testid="return-refuse-reason-input" />
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

      {/* Bannière : réclamation déjà remboursée */}
      {isAlreadyRefunded && o.return_rma_code && (
        <div className="border-2 border-green-300 bg-green-50 p-5 mb-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-700 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-heading font-bold uppercase text-base mb-1 text-green-900">Réclamation traitée et remboursée</h3>
              <p className="text-sm text-green-800">
                <strong>Code :</strong> <span className="font-mono">{o.return_rma_code}</span>
                {o.return_decided_at && ` · traitée le ${fmtDate(o.return_decided_at, true)}`}
              </p>
              {o.refund_message && (
                <div className="text-sm bg-white border border-green-200 p-3 mt-2">
                  <div className="text-xs uppercase tracking-wider text-ink-muted mb-1">Message envoyé au client :</div>
                  <div className="text-ink whitespace-pre-line">{o.refund_message}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Livraison programmée */}
          {o.scheduled_date && (
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-sm">
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0">📅</span>
                <div className="flex-1">
                  <p className="font-semibold text-blue-900 text-sm uppercase tracking-wider">Livraison programmée</p>
                  <p className="text-blue-900 text-base mt-1">
                    <strong>
                      {new Date(o.scheduled_date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </strong>
                    {o.scheduled_time_slot && (<> — <strong>{o.scheduled_time_slot}</strong></>)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ⭐ NOUVEAU : Code OTP de livraison */}
          {(o.status === "shipped" || o.status === "in_transit") && o.delivery_otp && (
            <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded-sm" data-testid="delivery-otp-panel">
              <div className="flex items-start gap-3">
                <KeyRound className="w-5 h-5 text-purple-700 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-purple-900 text-sm uppercase tracking-wider">
                    Code OTP de livraison
                  </p>
                  <p className="text-xs text-purple-700 mt-0.5">
                    À donner par le client au livreur. Le livreur saisit ce code sur <code className="bg-white px-1">/livreur</code> pour valider la livraison.
                  </p>

                  <div className="mt-3 flex items-center gap-2">
                    <div className="bg-white border-2 border-purple-300 px-4 py-2 rounded">
                      <span className="font-mono text-2xl font-bold text-purple-900 tracking-[0.4em]">
                        {showOtp ? (o.delivery_otp || "").replace(/(\d{3})(\d{3})/, "$1 $2") : "••• •••"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowOtp((v) => !v)}
                      className="text-xs text-purple-700 hover:text-purple-900 font-semibold underline"
                    >
                      {showOtp ? "Masquer" : "Afficher"}
                    </button>
                    {showOtp && (
                      <button
                        type="button"
                        onClick={copyOtp}
                        className="p-1.5 hover:bg-white rounded"
                        title="Copier"
                      >
                        <Copy className="w-4 h-4 text-purple-700" />
                      </button>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={regenerateOtp}
                      disabled={otpBusy}
                      className="text-xs inline-flex items-center gap-1.5 border border-purple-300 text-purple-700 hover:bg-white px-3 py-1.5 rounded disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${otpBusy ? "animate-spin" : ""}`} />
                      Régénérer
                    </button>
                    <button
                      onClick={resendOtpEmail}
                      disabled={otpBusy}
                      className="text-xs inline-flex items-center gap-1.5 border border-purple-300 text-purple-700 hover:bg-white px-3 py-1.5 rounded disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Renvoyer au client
                    </button>
                  </div>

                  {o.delivery_otp_expires_at && (
                    <p className="text-[11px] text-purple-600 mt-2">
                      ⏰ Expire le {new Date(o.delivery_otp_expires_at).toLocaleString("fr-FR")}
                      {o.delivery_otp_locked && <span className="ml-2 text-red-700 font-semibold">🔒 Bloqué (trop de tentatives)</span>}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Note du client */}
          {o.customer_note && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-sm">
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0">📝</span>
                <div>
                  <p className="font-semibold text-amber-900 text-sm uppercase tracking-wider">Note du client</p>
                  <p className="text-amber-900 text-sm mt-1 whitespace-pre-line">{o.customer_note}</p>
                </div>
              </div>
            </div>
          )}

          {/* Items */}
          <div className="bg-white border border-border p-5">
            <h3 className="font-semibold uppercase text-sm mb-3">Articles</h3>
            {(o.items || []).map((it, i) => {
              const renderCustom = () => {
                if (!it.customization) return null;
                const fields = it.customization_fields || [];
                if (fields.length > 0) {
                  return (
                    <div className="mt-1 space-y-0.5 text-xs">
                      {fields.map((f) => {
                        const v = it.customization[f.key];
                        if (!v) return null;
                        let display = v;
                        if (f.type === "select") {
                          const opt = (f.options || []).find((o) => o.value === v);
                          if (opt) display = opt.label_fr;
                        }
                        return (
                          <div key={f.key} className="flex items-center gap-1 text-brand">
                            🎨 <span className="text-ink-muted">{f.label_fr} :</span>
                            <strong className="text-ink">{display}</strong>
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                const parts = [];
                if (it.customization.name) parts.push(it.customization.name);
                if (it.customization.number) parts.push(`N°${it.customization.number}`);
                return parts.length > 0 ? <div className="mt-0.5 text-xs text-brand">🎨 {parts.join(" · ")}</div> : null;
              };
              return (
                <div key={i} className="flex gap-3 py-2 border-b border-border last:border-0 text-sm">
                  <img src={mediaSrc(it.image)} alt="" className="w-12 h-14 object-cover bg-secondary" />
                  <div className="flex-1">
                    <div className="font-medium">{it.name_fr}</div>
                    <div className="text-xs text-ink-muted">Taille {it.size} {it.color && `· ${it.color}`} · x{it.quantity} · {money(it.unit_price, o.currency)} / u</div>
                    {renderCustom()}
                  </div>
                  <div className="font-semibold">{money(it.line_total, o.currency)}</div>
                </div>
              );
            })}
            <div className="mt-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-ink-muted">Sous-total</span><span>{money(o.subtotal, o.currency)}</span></div>
              {o.discount > 0 && <div className="flex justify-between text-green-700"><span>Remise {o.promo_code && `(${o.promo_code})`}</span><span>-{money(o.discount, o.currency)}</span></div>}
              <div className="flex justify-between"><span className="text-ink-muted">Livraison · {o.shipping_method?.name_fr}</span><span>{money(o.shipping_cost, o.currency)}</span></div>
              <div className="flex justify-between font-bold text-base pt-2 border-t border-border"><span>Total</span><span>{money(o.total, o.currency)}</span></div>
              {o.charge_currency !== o.currency && <div className="text-xs text-ink-muted">Facture Stripe: {money(o.charge_total, o.charge_currency)}</div>}
            </div>
          </div>

          {/* Expédition */}
          <div className="bg-white border border-border p-5">
            <h3 className="font-semibold uppercase text-sm mb-3 inline-flex items-center gap-2"><Truck className="w-4 h-4" /> Expédition</h3>
            <div className="mb-4">
              <Label className="text-xs uppercase tracking-wider text-ink-muted">Origine d'expédition</Label>
              <select value={originCountry || (currentOrigin?.country || "")}
                onChange={(e) => setOriginCountry(e.target.value)}
                className="mt-1 w-full sm:w-64 border border-border h-10 px-3 bg-white text-sm">
                <option value="">-- Choisir --</option>
                {shippingOrigins.map((org, i) => (
                  <option key={i} value={org.country}>{org.name || org.country} ({org.country}){org.is_default ? " · défaut" : ""}</option>
                ))}
              </select>
              {currentOrigin && (
                <div className="text-xs text-ink-soft mt-2 bg-secondary p-3">
                  <div className="font-medium">{currentOrigin.name}</div>
                  <div>{currentOrigin.address_line}</div>
                  <div>{currentOrigin.postal_code} {currentOrigin.city}</div>
                </div>
              )}
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-xs uppercase tracking-wider text-ink-muted">Segments ({segments.length}/3)</Label>
                {segments.length < 3 && (
                  <button type="button" onClick={addSegment} className="text-xs text-brand font-semibold hover:underline">+ Ajouter</button>
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
                      </span>
                      {segments.length > 1 && (
                        <button type="button" onClick={() => removeSegment(i)} className="text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                    <div className="grid sm:grid-cols-3 gap-2">
                      <div><Label className="text-xs">Transporteur</Label><Input value={seg.carrier || ""} onChange={(e) => updateSegment(i, { carrier: e.target.value })} className="h-9" /></div>
                      <div><Label className="text-xs">N° suivi</Label><Input value={seg.tracking_number || ""} onChange={(e) => updateSegment(i, { tracking_number: e.target.value })} className="h-9 font-mono" /></div>
                      <div><Label className="text-xs">Lien</Label><Input value={seg.tracking_url || ""} onChange={(e) => updateSegment(i, { tracking_url: e.target.value })} className="h-9 text-xs" /></div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      <span className="text-[11px] text-ink-muted">Statut :</span>
                      {[{ v: "pending", l: "En attente" }, { v: "in_transit", l: "En transit" }, { v: "delivered", l: "Livré" }].map((opt) => (
                        <button key={opt.v} type="button" disabled={seg.status === opt.v} onClick={() => updateSegment(i, { status: opt.v })}
                          className={`text-[11px] px-2 py-1 border ${seg.status === opt.v ? "bg-ink text-white border-ink" : "border-border hover:bg-secondary"}`}>
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Button onClick={saveSegments} disabled={busy} className="bg-ink hover:bg-ink/90 rounded-none">
                  <Save className="w-4 h-4 mr-1" /> Enregistrer l'expédition
                </Button>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white border border-border p-5">
            <h3 className="font-semibold uppercase text-sm mb-3">Notes internes</h3>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button onClick={saveNotes} disabled={busy} variant="outline" className="mt-2 rounded-none">Enregistrer</Button>
          </div>

          {/* History */}
          <div className="bg-white border border-border p-5">
            <h3 className="font-semibold uppercase text-sm mb-3">Historique</h3>
            <ol className="text-sm space-y-2">
              {[...(o.status_history || [])].reverse().map((h, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-xs text-ink-muted w-36 shrink-0">{fmtDate(h.at, true)}</span>
                  <span>
                    <span className={`text-[11px] px-1.5 py-0.5 ${STATUS_COLORS[h.status] || ""}`}>{STATUS_LABELS[h.status] || h.status}</span>
                    <span className="text-ink-muted text-xs"> par {h.by}</span>
                    {h.note && <div className="text-xs text-ink-soft">{h.note}</div>}
                  </span>
                </li>
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
                <button key={s} disabled={busy || s === o.status} onClick={() => setStatus(s)}
                  className={`text-xs px-2 py-1.5 border text-left ${s === o.status ? "border-ink bg-ink text-white" : "border-border hover:bg-secondary"}`}>
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Customer */}
          <div className="bg-white border border-border p-5 text-sm">
            <h3 className="font-semibold uppercase text-sm mb-3">Client</h3>
            <div className="font-medium">{o.first_name} {o.last_name}</div>
            <a href={`mailto:${o.email}`} className="text-brand block">{o.email}</a>
            <a href={`tel:${o.phone}`} className="block">{o.phone}</a>
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-xs uppercase text-ink-muted mb-1">Adresse</div>
              <div>{addr.address_line}</div>
              <div>{addr.postal_code} {addr.city}, {addr.country}</div>
            </div>
          </div>

          {/* Emails */}
          <div className="bg-white border border-border p-5 text-sm">
            <h3 className="font-semibold uppercase text-sm mb-3 inline-flex items-center gap-2"><Mail className="w-4 h-4" /> E-mails</h3>
            {(o.emails || []).map((e) => (
              <div key={e.id} className="flex justify-between text-xs py-1 border-b border-border last:border-0">
                <span>{e.template}</span>
                <span className={e.status === "sent" ? "text-green-600" : e.status === "failed" ? "text-red-600" : "text-ink-muted"}>{e.status}</span>
              </div>
            ))}
            <div className="flex flex-wrap gap-1 mt-3">
              <button onClick={() => resend("order_confirmed")} disabled={busy} className="text-xs border border-border px-2 py-1 hover:bg-secondary">Renvoyer confirmation</button>
              <button onClick={() => resend("order_shipped")} disabled={busy} className="text-xs border border-border px-2 py-1 hover:bg-secondary">Renvoyer expédition</button>
            </div>
          </div>

          {/* ⭐ Payments — affichage détaillé remboursement */}
          <div className="bg-white border border-border p-5 text-sm">
            <h3 className="font-semibold uppercase text-sm mb-3">Paiement</h3>
            {(o.payments || []).map((p) => {
              const refundedCents = p.raw_event?.amount;
              const refundedEur = refundedCents ? refundedCents / 100 : null;

              return (
                <div key={p.id} className="text-xs py-2 border-b border-border last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="capitalize font-medium">{p.provider}</span>
                    <span className={`px-2 py-0.5 font-semibold ${
                      p.status === "succeeded" ? "bg-green-100 text-green-700" :
                      p.status === "partially_refunded" ? "bg-amber-100 text-amber-800" :
                      p.status === "refunded" ? "bg-red-100 text-red-800" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {p.status === "partially_refunded" ? "Partiel" :
                       p.status === "refunded" ? "Remboursé" :
                       p.status === "succeeded" ? "Payé" : p.status}
                    </span>
                  </div>
                  <div className="text-ink-muted mt-1">
                    Montant original : <strong>{money(p.amount, p.currency)}</strong>
                  </div>
                  {refundedEur !== null && (
                    <div className="text-ink-muted">
                      Remboursé : <strong className="text-brand">{refundedEur.toFixed(2)} {p.currency}</strong>
                    </div>
                  )}
                  {p.payment_intent && (
                    <div className="text-ink-muted truncate mt-1">{p.payment_intent}</div>
                  )}
                </div>
              );
            })}

            {o.payment_status === "paid" && !hasActiveClaim && (
              <Button onClick={openRefundModal} disabled={busy} variant="outline"
                className="mt-2 w-full rounded-none border-amber-400 text-amber-700 hover:bg-amber-50">
                <RotateCcw className="w-4 h-4 mr-1" /> Rembourser via Stripe
              </Button>
            )}

            {hasActiveClaim && (
              <p className="text-xs text-orange-700 mt-2 italic p-2 bg-orange-50 border border-orange-200">
                ⚠️ Réclamation en cours. Utilisez le bouton dans la bannière en haut.
              </p>
            )}

            <Button onClick={remove} disabled={busy} variant="outline"
              className="mt-2 w-full rounded-none border-red-300 text-red-600 hover:bg-red-50">
              <Trash2 className="w-4 h-4 mr-1" /> Supprimer
            </Button>
          </div>
        </div>
      </div>

      {/* ⭐ Modale réclamation : montant FCFA + message */}
      {showClaimModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowClaimModal(false)}>
          <div className="bg-white max-w-lg w-full p-6 border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
              <div className="flex-1">
                <h3 className="font-bold text-lg mb-1">Accepter et rembourser</h3>
                <p className="text-xs text-ink-soft">
                  Réclamation <strong>{o.return_rma_code}</strong> · Total payé : {eurToXof(o.charge_total).toLocaleString("fr-FR")} FCFA
                </p>
              </div>
            </div>

            <Label className="text-xs uppercase tracking-wider text-ink-muted">
              Montant à rembourser (FCFA)
            </Label>
            <Input
              type="number"
              step="100"
              value={claimAmount}
              onChange={(e) => setClaimAmount(e.target.value)}
              placeholder={`Vide = remboursement total (${eurToXof(o.charge_total).toLocaleString("fr-FR")} FCFA)`}
              className="mt-1 rounded-none"
              data-testid="claim-amount-input"
            />
            <p className="text-[11px] text-ink-muted mt-1">
              💡 Saisissez le montant en FCFA. Laissez vide pour un remboursement total, ou saisissez un montant pour un remboursement partiel (ex : frais de livraison non remboursés). Converti automatiquement en EUR pour Stripe.
            </p>

            <Label className="text-xs uppercase tracking-wider text-ink-muted mt-4 block">
              💬 Message au client (optionnel)
            </Label>
            <Textarea
              rows={5}
              value={claimMessage}
              onChange={(e) => setClaimMessage(e.target.value)}
              placeholder="Ex : Nous sommes sincèrement désolés pour ce désagrément. Nous vous remboursons l'intégralité de votre commande..."
              className="mt-1 rounded-none"
              maxLength={1000}
              data-testid="claim-message-input"
            />
            <p className="text-[11px] text-ink-muted mt-1">
              Ce message sera inclus dans l'e-mail envoyé au client. {claimMessage.length}/1000
            </p>

            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setShowClaimModal(false)}
                className="px-4 py-2 border border-border text-xs font-bold uppercase hover:bg-secondary">
                Annuler
              </button>
              <button onClick={confirmClaim} disabled={busy}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold uppercase disabled:opacity-50"
                data-testid="confirm-claim-btn">
                {busy ? "..." : "Accepter et rembourser"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⭐ Modale remboursement direct (FCFA → EUR conversion) */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowRefundModal(false)}>
          <div className="bg-white max-w-lg w-full p-6 border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <RotateCcw className="w-6 h-6 text-amber-600 shrink-0" />
              <div className="flex-1">
                <h3 className="font-bold text-lg mb-1">Rembourser la commande</h3>
                <p className="text-xs text-ink-soft">
                  Commande <strong>{o.order_number}</strong> · Total : {eurToXof(o.charge_total).toLocaleString("fr-FR")} FCFA
                </p>
              </div>
            </div>

            <Label className="text-xs uppercase tracking-wider text-ink-muted">Montant (FCFA)</Label>
            <Input
              type="number"
              step="100"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              placeholder={`Vide = total (${eurToXof(o.charge_total).toLocaleString("fr-FR")} FCFA)`}
              className="mt-1 rounded-none"
            />
            <p className="text-[11px] text-ink-muted mt-1">
              💡 Saisissez en FCFA. Converti automatiquement en EUR pour Stripe.
            </p>

            <Label className="text-xs uppercase tracking-wider text-ink-muted mt-4 block">💬 Message (optionnel)</Label>
            <Textarea rows={4} value={refundMessage} onChange={(e) => setRefundMessage(e.target.value)}
              placeholder="Message au client..." className="mt-1 rounded-none" maxLength={1000} />

            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setShowRefundModal(false)} className="px-4 py-2 border border-border text-xs font-bold uppercase hover:bg-secondary">Annuler</button>
              <button onClick={confirmRefund} disabled={busy} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold uppercase disabled:opacity-50">
                {busy ? "..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⭐ Modale : Demander des infos au client */}
      {showClaimInfoModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowClaimInfoModal(false)}>
          <div className="bg-white max-w-lg w-full p-6 border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <MessageSquare className="w-6 h-6 text-blue-600 shrink-0" />
              <div className="flex-1">
                <h3 className="font-bold text-lg mb-1">Demander des informations</h3>
                <p className="text-xs text-ink-soft">
                  Commande <strong>{o.order_number}</strong> · Le client recevra un email avec votre demande.
                </p>
              </div>
            </div>

            <Label className="text-xs uppercase tracking-wider text-ink-muted">Message au client *</Label>
            <Textarea
              rows={4}
              value={claimInfoMessage}
              onChange={(e) => setClaimInfoMessage(e.target.value)}
              placeholder="Ex : Pourriez-vous nous envoyer une photo de l'emballage extérieur ? Cela nous aidera à mieux comprendre le problème."
              className="mt-1 rounded-none"
              maxLength={1000}
              data-testid="claim-info-message"
            />
            <p className="text-[11px] text-ink-muted mt-1">{claimInfoMessage.length}/1000</p>

            <Label className="text-xs uppercase tracking-wider text-ink-muted mt-4 block">
              Types de fichiers à demander
            </Label>
            <div className="flex gap-3 mt-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={claimInfoTypes.includes("photo")}
                  onChange={(e) => {
                    if (e.target.checked) setClaimInfoTypes([...new Set([...claimInfoTypes, "photo"])]);
                    else setClaimInfoTypes(claimInfoTypes.filter((t) => t !== "photo"));
                  }}
                />
                <ImageIcon className="w-4 h-4" /> Photos
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={claimInfoTypes.includes("video")}
                  onChange={(e) => {
                    if (e.target.checked) setClaimInfoTypes([...new Set([...claimInfoTypes, "video"])]);
                    else setClaimInfoTypes(claimInfoTypes.filter((t) => t !== "video"));
                  }}
                />
                <Film className="w-4 h-4" /> Vidéos
              </label>
            </div>

            <div className="bg-blue-50 border border-blue-200 p-3 mt-4 text-xs text-blue-900">
              💡 Le client pourra répondre directement depuis son compte avec les fichiers demandés.
            </div>

            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => setShowClaimInfoModal(false)}
                className="px-4 py-2 border border-border text-xs font-bold uppercase hover:bg-secondary"
                disabled={claimInfoBusy}
              >
                Annuler
              </button>
              <button
                onClick={submitClaimInfo}
                disabled={claimInfoBusy}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase disabled:opacity-50 inline-flex items-center gap-1.5"
                data-testid="confirm-claim-info"
              >
                {claimInfoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {claimInfoBusy ? "Envoi..." : "Envoyer la demande"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}