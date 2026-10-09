import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { Stars } from "@/components/Stars";
import { fmtDate, mediaSrc } from "@/lib/adminUtils";
import { toast } from "sonner";
import { Trash2, Eye, EyeOff, BadgeCheck, MessageSquare } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default function AdminReviews() {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState("");
  const [replying, setReplying] = useState(null);
  const [replyText, setReplyText] = useState("");
  const saveReply = async (r, text = replyText) => {
    try { await api.put(`/admin/reviews/${r.id}/reply`, { reply: text }); toast.success(text ? "Reponse publiee" : "Reponse supprimee"); setReplying(null); load(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const load = () => api.get(`/admin/reviews${filter ? `?approved=${filter}` : ""}`).then((r) => setList(r.data)).catch(() => {});
  useEffect(() => { load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (r) => {
    try { await api.put(`/admin/reviews/${r.id}/approve`, { approved: !r.approved }); load(); } catch (e) { toast.error(apiError(e)); }
  };
  const remove = async (r) => {
    if (!window.confirm("Supprimer cet avis ?")) return;
    try { await api.delete(`/admin/reviews/${r.id}`); toast.success("Avis supprime"); load(); } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div data-testid="admin-reviews">
      <h1 className="font-heading text-2xl font-bold uppercase mb-5">Avis clients <span className="text-ink-muted text-base font-normal">({list.length})</span></h1>
      <div className="flex gap-2 mb-4">
        {[["", "Tous"], ["true", "Publies"], ["false", "Masques"]].map(([v, l]) => <button key={v} onClick={() => setFilter(v)} className={`text-xs px-3 py-1 border ${filter === v ? "bg-ink text-white border-ink" : "border-border hover:bg-secondary"}`}>{l}</button>)}
      </div>
      <div className="space-y-3">
        {list.map((r) => (
          <div key={r.id} className={`bg-white border p-4 ${r.approved ? "border-border" : "border-amber-300 bg-amber-50/40"}`} data-testid={`admin-review-${r.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><Stars value={r.rating} /><span className="text-xs text-ink-muted">{fmtDate(r.created_at, true)}</span>{r.verified_purchase && <span className="text-[10px] text-green-700 inline-flex items-center gap-1"><BadgeCheck className="w-3 h-3" /> achat verifie</span>}</div>
                {r.title && <div className="font-semibold mt-1">{r.title}</div>}
                <p className="text-sm text-ink-soft mt-1">{r.body}</p>
                {r.images?.length > 0 && <div className="flex gap-2 mt-2">{r.images.map((u) => <img key={u} src={mediaSrc(u)} alt="" className="w-14 h-14 object-cover" />)}</div>}
                <div className="text-xs text-ink-muted mt-2">{r.author_name} · {r.product ? <Link to={`/product/${r.product.slug}`} className="underline hover:text-brand" target="_blank">{r.product.name}</Link> : "produit supprime"}</div>
                {replying === r.id ? (
                  <div className="mt-3" data-testid={`reply-form-${r.id}`}>
                    <Textarea rows={3} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Votre reponse publique au nom de STRYKOS..." data-testid={`reply-text-${r.id}`} />
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" onClick={() => saveReply(r)} className="bg-ink hover:bg-ink/90 rounded-none" data-testid={`reply-save-${r.id}`}>Publier la reponse</Button>
                      {r.admin_reply && <Button size="sm" variant="outline" onClick={() => saveReply(r, "")} className="rounded-none text-red-600">Supprimer</Button>}
                      <Button size="sm" variant="ghost" onClick={() => setReplying(null)} className="rounded-none">Annuler</Button>
                    </div>
                  </div>
                ) : r.admin_reply ? (
                  <div className="mt-3 bg-secondary border-l-2 border-brand p-3 text-sm" data-testid={`admin-reply-${r.id}`}>
                    <div className="text-[11px] uppercase tracking-wider font-bold text-brand mb-1 flex justify-between">Reponse STRYKOS <button onClick={() => { setReplying(r.id); setReplyText(r.admin_reply); }} className="underline font-normal normal-case">modifier</button></div>
                    <p className="text-ink-soft whitespace-pre-line">{r.admin_reply}</p>
                  </div>
                ) : (
                  <button onClick={() => { setReplying(r.id); setReplyText(""); }} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline" data-testid={`reply-btn-${r.id}`}><MessageSquare className="w-3.5 h-3.5" /> Repondre publiquement</button>
                )}
              </div>
              <div className="flex gap-1">
                <button onClick={() => toggle(r)} title={r.approved ? "Masquer" : "Publier"} className="p-1.5 hover:bg-secondary" data-testid={`toggle-review-${r.id}`}>{r.approved ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                <button onClick={() => remove(r)} className="p-1.5 hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-ink-muted text-sm">Aucun avis</p>}
      </div>
    </div>
  );
}
