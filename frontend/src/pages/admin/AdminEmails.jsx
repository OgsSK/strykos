import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/adminUtils";
import { Mail, CheckCircle2, XCircle, PauseCircle, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function AdminEmails() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = () => {
    api.get(`/admin/emails${status ? `?status=${status}` : ""}`).then((r) => setData(r.data)).catch(() => {});
  };

  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteOne = async (id) => {
    if (!window.confirm("Supprimer cet e-mail de l'historique ?")) return;
    try {
      await api.delete(`/admin/emails/${id}`);
      toast.success("E-mail supprimé");
      load();
    } catch { toast.error("Suppression impossible"); }
  };

  const clearAll = async () => {
    setLoading(true);
    try {
      const q = status ? `?status=${status}` : "";
      const { data: res } = await api.delete(`/admin/emails${q}`);
      toast.success(`${res.deleted} e-mail(s) supprimé(s)`);
      setConfirmClear(false);
      load();
    } catch { toast.error("Suppression impossible"); }
    setLoading(false);
  };

  if (!data) return <div className="text-ink-muted">Chargement...</div>;
  const Icon = { sent: CheckCircle2, failed: XCircle, disabled: PauseCircle };
  const color = { sent: "text-green-600", failed: "text-red-600", disabled: "text-ink-muted" };

  return (
    <div data-testid="admin-emails">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <h1 className="font-heading text-2xl font-bold uppercase">E-mails transactionnels</h1>
        <button
          onClick={() => setConfirmClear(true)}
          className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wide px-4 py-2"
          data-testid="emails-clear-btn"
        >
          <Trash2 className="w-4 h-4" /> Vider l'historique
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-5 text-sm">
        <div className="bg-white border border-border p-4">
          <div className="text-[11px] uppercase text-ink-muted">Etat</div>
          <div className={`font-bold ${data.enabled ? "text-green-600" : "text-red-600"}`} data-testid="emails-enabled">
            {data.enabled ? "Actif" : "Desactive"}
          </div>
        </div>
        <div className="bg-white border border-border p-4">
          <div className="text-[11px] uppercase text-ink-muted">Expediteur affiche</div>
          <div className="font-bold">{data.from_name}</div>
          <div className="text-xs text-ink-muted">Reponses vers {data.reply_to}</div>
        </div>
        <div className="bg-white border border-border p-4">
          <div className="text-[11px] uppercase text-ink-muted">Notification admin</div>
          <div className="font-bold">{data.admin_notify || "-"}</div>
        </div>
      </div>

      <p className="text-xs text-ink-muted mb-4">
        Envoyes automatiquement : confirmation de paiement (client + copie admin), expedition avec suivi, livraison, annulation/remboursement.
        Langue = celle choisie par le client lors de la commande.
      </p>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {["", "sent", "failed", "disabled"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`text-xs px-3 py-1 border ${status === s ? "bg-ink text-white border-ink" : "border-border hover:bg-secondary"}`}
          >
            {s || "Tous"}
          </button>
        ))}
        <span className="text-xs text-ink-muted ml-2">{data.logs.length} e-mail(s)</span>
      </div>

      <div className="bg-white border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Destinataire</th>
              <th className="p-3">Sujet</th>
              <th className="p-3">Modele</th>
              <th className="p-3">Statut</th>
              <th className="p-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {data.logs.map((e) => {
              const I = Icon[e.status] || Mail;
              return (
                <tr key={e.id} className="border-t border-border hover:bg-secondary/40" data-testid={`email-log-${e.id}`}>
                  <td className="p-3 text-xs text-ink-muted whitespace-nowrap">{fmtDate(e.created_at, true)}</td>
                  <td className="p-3">{e.to_email}</td>
                  <td className="p-3">
                    {e.subject}
                    {e.order_id && (
                      <Link to={`/admin/orders/${e.order_id}`} className="ml-2 text-xs text-brand underline">commande</Link>
                    )}
                  </td>
                  <td className="p-3 text-xs">{e.template}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 text-xs ${color[e.status]}`} title={e.error}>
                      <I className="w-3.5 h-3.5" />{e.status}
                    </span>
                    {e.error && <div className="text-[10px] text-red-600 max-w-xs truncate">{e.error}</div>}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => deleteOne(e.id)}
                      className="text-ink-muted hover:text-red-600 transition-colors"
                      title="Supprimer"
                      data-testid={`email-delete-${e.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {data.logs.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink-muted">Aucun e-mail</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirmClear && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setConfirmClear(false)}>
          <div className="bg-white max-w-md w-full p-6 border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
              <div>
                <h3 className="font-bold text-lg mb-1">Vider l'historique ?</h3>
                <p className="text-sm text-ink-soft">
                  Tu es sur le point de supprimer <strong>{data.logs.length} e-mail(s)</strong>
                  {status ? ` avec le statut "${status}"` : ""}. Cette action est irréversible.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmClear(false)}
                className="px-4 py-2 border border-border text-xs font-bold uppercase hover:bg-secondary"
                disabled={loading}
              >
                Annuler
              </button>
              <button
                onClick={clearAll}
                disabled={loading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase disabled:opacity-50"
                data-testid="emails-clear-confirm"
              >
                {loading ? "Suppression..." : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}