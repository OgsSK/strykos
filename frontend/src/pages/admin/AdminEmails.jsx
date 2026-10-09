import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/adminUtils";
import { Mail, CheckCircle2, XCircle, PauseCircle } from "lucide-react";

export default function AdminEmails() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("");
  useEffect(() => { api.get(`/admin/emails${status ? `?status=${status}` : ""}`).then((r) => setData(r.data)).catch(() => {}); }, [status]);
  if (!data) return <div className="text-ink-muted">Chargement...</div>;
  const Icon = { sent: CheckCircle2, failed: XCircle, disabled: PauseCircle };
  const color = { sent: "text-green-600", failed: "text-red-600", disabled: "text-ink-muted" };

  return (
    <div data-testid="admin-emails">
      <h1 className="font-heading text-2xl font-bold uppercase mb-5">E-mails transactionnels</h1>
      <div className="grid sm:grid-cols-3 gap-3 mb-5 text-sm">
        <div className="bg-white border border-border p-4"><div className="text-[11px] uppercase text-ink-muted">Etat</div><div className={`font-bold ${data.enabled ? "text-green-600" : "text-red-600"}`} data-testid="emails-enabled">{data.enabled ? "Actif" : "Desactive"}</div></div>
        <div className="bg-white border border-border p-4"><div className="text-[11px] uppercase text-ink-muted">Expediteur affiche</div><div className="font-bold">{data.from_name}</div><div className="text-xs text-ink-muted">Reponses vers {data.reply_to}</div></div>
        <div className="bg-white border border-border p-4"><div className="text-[11px] uppercase text-ink-muted">Notification admin</div><div className="font-bold">{data.admin_notify || "-"}</div></div>
      </div>
      <p className="text-xs text-ink-muted mb-4">Envoyes automatiquement : confirmation de paiement (client + copie admin), expedition avec suivi, livraison, annulation/remboursement. Langue = celle choisie par le client lors de la commande.</p>
      <div className="flex gap-2 mb-3">
        {["", "sent", "failed", "disabled"].map((s) => <button key={s} onClick={() => setStatus(s)} className={`text-xs px-3 py-1 border ${status === s ? "bg-ink text-white border-ink" : "border-border hover:bg-secondary"}`}>{s || "Tous"}</button>)}
      </div>
      <div className="bg-white border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider"><tr><th className="p-3">Date</th><th className="p-3">Destinataire</th><th className="p-3">Sujet</th><th className="p-3">Modele</th><th className="p-3">Statut</th></tr></thead>
          <tbody>
            {data.logs.map((e) => { const I = Icon[e.status] || Mail; return (
              <tr key={e.id} className="border-t border-border" data-testid={`email-log-${e.id}`}>
                <td className="p-3 text-xs text-ink-muted whitespace-nowrap">{fmtDate(e.created_at, true)}</td>
                <td className="p-3">{e.to_email}</td>
                <td className="p-3">{e.subject}{e.order_id && <Link to={`/admin/orders/${e.order_id}`} className="ml-2 text-xs text-brand underline">commande</Link>}</td>
                <td className="p-3 text-xs">{e.template}</td>
                <td className="p-3"><span className={`inline-flex items-center gap-1 text-xs ${color[e.status]}`} title={e.error}><I className="w-3.5 h-3.5" />{e.status}</span>{e.error && <div className="text-[10px] text-red-600 max-w-xs truncate">{e.error}</div>}</td>
              </tr>
            ); })}
            {data.logs.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-ink-muted">Aucun e-mail</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
