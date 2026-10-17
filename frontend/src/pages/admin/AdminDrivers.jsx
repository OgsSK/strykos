import React, { useEffect, useState, useCallback } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Mail, Truck, Trash2, AlertCircle, RefreshCw, UserX, CheckCircle2, Clock } from "lucide-react";

const EMPTY = { first_name: "", last_name: "", email: "", phone: "", notes: "" };

// ⭐ Skeleton de chargement
const SkeletonRow = () => (
  <tr className="border-t border-border animate-pulse">
    {Array.from({ length: 5 }).map((_, i) => (
      <td key={i} className="p-3">
        <div className="h-4 bg-secondary rounded w-3/4" />
      </td>
    ))}
  </tr>
);

export default function AdminDrivers() {
  const [drivers, setDrivers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  // ⭐ États UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // ⭐ load avec AbortController
  const load = useCallback(async (isRefresh = false) => {
    const controller = new AbortController();
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const { data } = await api.get("/admin/drivers", { signal: controller.signal });
      setDrivers(data || []);
      setLastUpdated(new Date());
    } catch (e) {
      if (e.name === "CanceledError" || e.name === "AbortError" || e.code === "ERR_CANCELED") return;
      setError(e?.response?.data?.detail || e.message || "Erreur de chargement");
      toast.error("Impossible de charger les livreurs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let cleanup;
    load().then((c) => { cleanup = c; });
    return () => cleanup?.();
  }, [load]);

  // ⭐ Refresh manuel
  const refresh = async () => {
    await load(true);
    toast.success("Livreurs actualisés");
  };

  const openNew = () => { setForm(EMPTY); setOpen(true); };
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.first_name || !form.email) {
      toast.error("Prénom et email requis");
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin/drivers/invite", form);
      toast.success("Invitation envoyée !");
      setOpen(false);
      await load(true);
    } catch (e) {
      toast.error(apiError(e));
    }
    setSaving(false);
  };

  const resend = async (d) => {
    if (!window.confirm(`Renvoyer l'invitation à ${d.first_name} ${d.last_name} ?`)) return;
    try {
      await api.post(`/admin/drivers/${d.id}/resend-invite`);
      toast.success("Invitation renvoyée");
      await load(true);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const deactivate = async (d) => {
    if (!window.confirm(`Désactiver ${d.first_name} ${d.last_name} ?\n\nIl ne pourra plus se connecter.`)) return;
    try {
      await api.post(`/admin/drivers/${d.id}/deactivate`);
      toast.success("Livreur désactivé");
      await load(true);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (d) => {
    if (!window.confirm(`Supprimer définitivement ${d.first_name} ${d.last_name} ?\n\nLes commandes livrées resteront dans l'historique.`)) return;
    try {
      await api.delete(`/admin/drivers/${d.id}`);
      toast.success("Livreur supprimé");
      await load(true);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  // ⭐ Skeleton initial
  if (loading && drivers.length === 0) {
    return (
      <div data-testid="admin-drivers-loading">
        <div className="flex items-center justify-between mb-5">
          <h1 className="font-heading text-2xl font-bold uppercase">Livreurs</h1>
        </div>
        <div className="bg-white border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="p-3">Livreur</th>
                <th className="p-3 hidden md:table-cell">Contact</th>
                <th className="p-3">Livraisons</th>
                <th className="p-3">Statut</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ⭐ Erreur avec retry
  if (error && drivers.length === 0) {
    return (
      <div data-testid="admin-drivers-error" className="bg-red-50 border border-red-200 p-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold text-red-800 mb-1">Erreur de chargement</div>
          <div className="text-sm text-red-700 mb-3">{error}</div>
          <button
            onClick={() => load()}
            className="inline-flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase px-3 py-2"
          >
            <RefreshCw className="w-3 h-3" /> Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="admin-drivers">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-heading text-2xl font-bold uppercase">
            Livreurs <span className="text-ink-muted text-base font-normal">({drivers.length})</span>
          </h1>
          {lastUpdated && (
            <p className="text-[11px] text-ink-muted mt-1">
              Actualisé à {lastUpdated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1 border border-border px-3 py-2 text-sm font-semibold hover:border-ink disabled:opacity-50 transition-colors"
            title="Recharger"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "..." : "Rafraîchir"}
          </button>
          <Button onClick={openNew} className="bg-brand hover:bg-brand-dark rounded-none">
            <Plus className="w-4 h-4 mr-1" /> Inviter un livreur
          </Button>
        </div>
      </div>

      <p className="text-xs text-ink-muted mb-4">
        💡 Chaque livreur reçoit une invitation par email. Il crée son mot de passe et accède à son interface dédiée sur <code className="bg-secondary px-1">/livreur</code>.
      </p>

      <div className="bg-white border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3">Livreur</th>
              <th className="p-3 hidden md:table-cell">Contact</th>
              <th className="p-3">Livraisons</th>
              <th className="p-3">Statut</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id} className="border-t border-border hover:bg-secondary/50">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
                      <Truck className="w-4 h-4 text-brand" />
                    </div>
                    <div>
                      <div className="font-medium">{d.first_name} {d.last_name}</div>
                      <div className="text-xs text-ink-muted">Inscrit le {new Date(d.created_at).toLocaleDateString("fr-FR")}</div>
                    </div>
                  </div>
                </td>
                <td className="p-3 hidden md:table-cell text-sm text-ink-soft">
                  <div>{d.email}</div>
                  {d.phone && <div className="text-xs text-ink-muted">{d.phone}</div>}
                </td>
                <td className="p-3">
                  <span className="font-semibold">{d.deliveries_count || 0}</span>
                </td>
                <td className="p-3">
                  {d.invite_pending ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-100 text-amber-800">
                      <Clock className="w-3 h-3" /> En attente
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-100 text-green-800">
                      <CheckCircle2 className="w-3 h-3" /> Actif
                    </span>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex gap-1 justify-end">
                    {d.invite_pending && (
                      <button
                        onClick={() => resend(d)}
                        title="Renvoyer l'invitation"
                        className="p-1.5 hover:bg-secondary"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => deactivate(d)}
                      title="Désactiver"
                      className="p-1.5 hover:bg-amber-50 text-amber-600"
                    >
                      <UserX className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => remove(d)}
                      title="Supprimer"
                      className="p-1.5 hover:bg-red-50 text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {drivers.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-muted">
                  Aucun livreur. Cliquez sur « Inviter un livreur » pour commencer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modale d'invitation */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Inviter un livreur</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Prénom *</Label>
                <Input value={form.first_name} onChange={(e) => setF("first_name", e.target.value)} placeholder="Moussa" />
              </div>
              <div>
                <Label>Nom</Label>
                <Input value={form.last_name} onChange={(e) => setF("last_name", e.target.value)} placeholder="Diallo" />
              </div>
            </div>

            <div>
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setF("email", e.target.value)} placeholder="moussa@exemple.com" />
            </div>

            <div>
              <Label>Téléphone</Label>
              <Input value={form.phone} onChange={(e) => setF("phone", e.target.value)} placeholder="+223 XX XX XX XX" />
            </div>

            <div>
              <Label>Notes internes (optionnel)</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setF("notes", e.target.value)}
                placeholder="Zone Bamako centre, disponible 8h-18h…"
              />
              <p className="text-[11px] text-ink-muted mt-1">Ces notes ne sont visibles que par vous.</p>
            </div>

            <div className="bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
              <strong>📧 Invitation par email</strong><br />
              Le livreur recevra un email avec un lien pour créer son mot de passe. Ce lien est valable <strong>7 jours</strong>.
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-none">
                Annuler
              </Button>
              <Button onClick={save} disabled={saving} className="bg-brand hover:bg-brand-dark rounded-none">
                {saving ? "Envoi…" : <><Mail className="w-4 h-4 mr-1" /> Envoyer l'invitation</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}