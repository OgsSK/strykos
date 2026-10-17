import React, { useEffect, useState, useCallback } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate, downloadCsv } from "@/lib/adminUtils";
import { toast } from "sonner";
import { Plus, Trash2, Send, Download, Search, Mail, Pencil, FlaskConical, RefreshCw, AlertCircle } from "lucide-react";

const EMPTY = { name: "", subject_fr: "", subject_en: "", body_fr: "", body_en: "", product_slugs: [], cta_link: "/catalog?is_new=true", cta_fr: "Decouvrir", cta_en: "Shop now" };

// ⭐ Intervalle de polling des campagnes en envoi
const POLL_INTERVAL_MS = 10_000;

// ⭐ Skeleton rows (réutilisé dans les 2 sous-pages)
const SkeletonTable = ({ rows = 4, cols = 6 }) => (
  <>
    {Array.from({ length: rows }).map((_, i) => (
      <tr key={i} className="border-t border-border animate-pulse">
        {Array.from({ length: cols }).map((_, j) => (
          <td key={j} className="p-3">
            <div className="h-4 bg-secondary rounded w-3/4" />
          </td>
        ))}
      </tr>
    ))}
  </>
);


// ============================================================
// SUBSCRIBERS — pagination + recherche serveur + refresh
// ============================================================
function Subscribers() {
  const [data, setData] = useState({ total_active: 0, subscribers: [] });
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [newEmail, setNewEmail] = useState("");

  // ⭐ États UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // ⭐ Pagination "Charger plus"
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // ⭐ load avec pagination
  const load = useCallback(async (lim = 20, opts = {}) => {
    const { isRefresh = false, silent = false } = opts;
    if (isRefresh) setRefreshing(true);
    else if (!silent) setLoading(true);
    setError(null);

    const sp = new URLSearchParams();
    if (appliedQ) sp.set("q", appliedQ);
    sp.set("limit", lim);
    sp.set("offset", 0);

    const controller = new AbortController();
    try {
      const { data: res } = await api.get(
        `/admin/newsletter/subscribers?${sp.toString()}`,
        { signal: controller.signal }
      );
      const items = res.items || res.subscribers || [];
      setData({
        total_active: res.total_active || 0,
        subscribers: items,
      });
      setTotal(res.total || 0);
      setHasMore(items.length >= lim && items.length < (res.total || 0));
    } catch (e) {
      if (e.name === "CanceledError" || e.name === "AbortError" || e.code === "ERR_CANCELED") return;
      setError(e?.response?.data?.detail || e.message || "Erreur de chargement");
      if (!silent) toast.error("Impossible de charger les abonnés");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
    return () => controller.abort();
  }, [appliedQ]);

  // ⭐ Rechargement quand la recherche validée change
  useEffect(() => {
    setLimit(20);
    let cleanup;
    load(20).then((c) => { cleanup = c; });
    return () => cleanup?.();
  }, [load]);

  // ⭐ Charger plus
  const loadMore = () => {
    setLoadingMore(true);
    const newLimit = limit + 20;
    setLimit(newLimit);
    load(newLimit, { silent: true });
  };

  const refresh = async () => {
    await load(limit, { isRefresh: true });
    toast.success("Abonnés actualisés");
  };

  const submitSearch = (e) => {
    e.preventDefault();
    setAppliedQ(q.trim());
  };

  const clearSearch = () => {
    setQ("");
    setAppliedQ("");
  };

  const toggle = async (s) => {
    try { await api.put(`/admin/newsletter/subscribers/${s.id}`, { active: !s.active }); load(limit, { silent: true }); }
    catch (e) { toast.error(apiError(e)); }
  };
  const remove = async (s) => {
    if (!window.confirm(`Supprimer ${s.email} ?`)) return;
    try { await api.delete(`/admin/newsletter/subscribers/${s.id}`); load(limit, { silent: true }); }
    catch (e) { toast.error(apiError(e)); }
  };
  const add = async (e) => {
    e.preventDefault(); if (!newEmail) return;
    try {
      await api.post("/admin/newsletter/subscribers", { email: newEmail, lang: "fr" });
      setNewEmail(""); toast.success("Abonne ajoute"); load(limit, { silent: true });
    } catch (err) { toast.error(apiError(err)); }
  };

  // ⭐ Skeleton initial
  if (loading && data.subscribers.length === 0) {
    return (
      <div data-testid="newsletter-subscribers-loading">
        <div className="bg-white border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
              <tr><th className="p-3">E-mail</th><th className="p-3">Langue</th><th className="p-3">Source</th><th className="p-3">Inscrit</th><th className="p-3">Etat</th><th className="p-3"></th></tr>
            </thead>
            <tbody><SkeletonTable rows={5} cols={6} /></tbody>
          </table>
        </div>
      </div>
    );
  }

  // ⭐ Erreur avec retry
  if (error && data.subscribers.length === 0) {
    return (
      <div data-testid="newsletter-subscribers-error" className="bg-red-50 border border-red-200 p-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold text-red-800 mb-1">Erreur de chargement</div>
          <div className="text-sm text-red-700 mb-3">{error}</div>
          <button onClick={() => load(20)} className="inline-flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase px-3 py-2">
            <RefreshCw className="w-3 h-3" /> Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="newsletter-subscribers">
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <form onSubmit={submitSearch} className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2 top-3 text-ink-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un e-mail (Entrée)" className="pl-8" data-testid="subscribers-search" />
        </form>
        {appliedQ && (
          <button onClick={clearSearch} className="text-xs text-ink-muted hover:text-brand border border-border px-3 py-1">
            Effacer
          </button>
        )}
        <form onSubmit={add} className="flex gap-1">
          <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Ajouter un e-mail" data-testid="subscriber-add-email" />
          <Button type="submit" variant="outline" className="rounded-none" data-testid="subscriber-add-btn"><Plus className="w-4 h-4" /></Button>
        </form>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1 border border-border px-3 py-2 text-sm font-semibold hover:border-ink disabled:opacity-50"
          title="Rafraîchir"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
        <button
          onClick={() => downloadCsv("/admin/newsletter/subscribers.csv", "strykos-newsletter.csv").catch(() => toast.error("Export impossible"))}
          className="inline-flex items-center gap-1 border border-ink px-3 py-2 text-sm font-semibold hover:bg-ink hover:text-white"
          data-testid="export-subscribers-csv"
        >
          <Download className="w-4 h-4" /> CSV
        </button>
      </div>

      <p className="text-sm mb-3">
        <span className="font-bold" data-testid="subscribers-active-count">{data.total_active}</span> abonne(s) actif(s)
        {data.subscribers.length > 0 && (
          <span className="text-ink-muted ml-2">
            · {data.subscribers.length}{hasMore ? "+" : ""}{total > 0 && !hasMore ? ` / ${total}` : ""} affiché(s)
          </span>
        )}
      </p>

      {appliedQ && (
        <div className="mb-3 border border-ink/20 bg-secondary/60 px-4 py-2 text-xs">
          <strong>Recherche : </strong>« {appliedQ} » · {total} résultat{total > 1 ? "s" : ""}
        </div>
      )}

      <div className="bg-white border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
            <tr><th className="p-3">E-mail</th><th className="p-3">Langue</th><th className="p-3">Source</th><th className="p-3">Inscrit</th><th className="p-3">Etat</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {data.subscribers.map((s) => (
              <tr key={s.id} className="border-t border-border" data-testid={`subscriber-row-${s.email}`}>
                <td className="p-3">{s.email}</td>
                <td className="p-3 uppercase text-xs">{s.lang}</td>
                <td className="p-3 text-xs">{s.source}</td>
                <td className="p-3 text-xs text-ink-muted">{fmtDate(s.created_at)}</td>
                <td className="p-3">
                  <button
                    onClick={() => toggle(s)}
                    className={`text-xs px-2 py-0.5 ${s.active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}
                    data-testid={`toggle-subscriber-${s.email}`}
                  >
                    {s.active ? "Actif" : "Desabonne"}
                  </button>
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => remove(s)} className="p-1.5 hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {data.subscribers.length === 0 && !loading && (
              <tr><td colSpan={6} className="p-6 text-center text-ink-muted">
                {appliedQ ? "Aucun abonné ne correspond à cette recherche" : "Aucun abonne"}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ⭐ Bouton "Charger plus" */}
      {hasMore && (
        <div className="text-center mt-4 p-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="bg-ink text-white px-6 py-2 text-xs font-bold uppercase hover:bg-ink/90 disabled:opacity-50 transition-colors"
            data-testid="load-more-subscribers"
          >
            {loadingMore ? "Chargement…" : `Charger plus d'abonnés (${data.subscribers.length} / ${total})`}
          </button>
        </div>
      )}
      {!hasMore && data.subscribers.length >= 20 && (
        <div className="text-center mt-4 p-4 text-xs text-ink-muted">
          Tous les abonnés sont chargés ({data.subscribers.length})
        </div>
      )}
    </div>
  );
}


// ============================================================
// CAMPAIGNS — fix bug produits + polling conditionnel
// ============================================================
function Campaigns() {
  const [list, setList] = useState([]);
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  // ⭐ États UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // ⭐ load avec AbortController + useCallback
  const load = useCallback(async (opts = {}) => {
    const { isRefresh = false, silent = false } = opts;
    if (isRefresh) setRefreshing(true);
    else if (!silent) setLoading(true);
    setError(null);

    const controller = new AbortController();
    try {
      const { data } = await api.get("/admin/newsletter/campaigns", { signal: controller.signal });
      setList(data || []);
    } catch (e) {
      if (e.name === "CanceledError" || e.name === "AbortError" || e.code === "ERR_CANCELED") return;
      setError(e?.response?.data?.detail || e.message || "Erreur de chargement");
      if (!silent) toast.error("Impossible de charger les campagnes");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    return () => controller.abort();
  }, []);

  // ⭐ Chargement initial + produits
  useEffect(() => {
    let cleanup;
    load().then((c) => { cleanup = c; });

    // ⭐ FIX BUG : /admin/products retourne { items, total, ... } (pas un array)
    api.get("/admin/products?limit=200")
      .then((r) => {
        const items = Array.isArray(r.data) ? r.data : (r.data?.items || []);
        setProducts(items.filter((p) => p.published));
      })
      .catch(() => {});

    return () => cleanup?.();
  }, [load]);

  // ⭐ Polling CONDITIONNEL : seulement si au moins 1 campagne est en envoi
  const hasSendingCampaigns = list.some((c) => c.status === "sending");
  useEffect(() => {
    if (!hasSendingCampaigns) return;
    const id = setInterval(() => load({ silent: true }), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasSendingCampaigns, load]);

  const refresh = async () => {
    await load({ isRefresh: true });
    toast.success("Campagnes actualisées");
  };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.subject_fr || !form.body_fr) return toast.error("Sujet et texte FR requis");
    setBusy(true);
    try {
      if (editing) await api.put(`/admin/newsletter/campaigns/${editing}`, form);
      else await api.post("/admin/newsletter/campaigns", form);
      toast.success("Campagne enregistree");
      setOpen(false);
      await load({ silent: true });
    }
    catch (e) { toast.error(apiError(e)); }
    setBusy(false);
  };

  const send = async (c) => {
    if (!window.confirm(`Envoyer "${c.subject_fr}" a tous les abonnes actifs ? Cette action est irreversible.`)) return;
    try {
      const { data } = await api.post(`/admin/newsletter/campaigns/${c.id}/send`);
      toast.success(`Envoi lance vers ${data.recipients} abonne(s)`);
      await load({ silent: true }); // Le polling prendra le relais
    } catch (e) { toast.error(apiError(e)); }
  };

  const test = async (c) => {
    try {
      const { data } = await api.post(`/admin/newsletter/campaigns/${c.id}/test`);
      toast.success(`E-mail test envoye a ${data.to}`);
    } catch (e) { toast.error(apiError(e)); }
  };

  const remove = async (c) => {
    if (!window.confirm("Supprimer cette campagne ?")) return;
    try { await api.delete(`/admin/newsletter/campaigns/${c.id}`); await load({ silent: true }); }
    catch (e) { toast.error(apiError(e)); }
  };

  const toggleProduct = (slug) =>
    setF("product_slugs", form.product_slugs.includes(slug)
      ? form.product_slugs.filter((s) => s !== slug)
      : [...form.product_slugs, slug].slice(0, 6));

  const statusColor = {
    draft: "bg-gray-200 text-gray-700",
    sending: "bg-amber-100 text-amber-800",
    sent: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  // ⭐ Skeleton initial
  if (loading && list.length === 0) {
    return (
      <div data-testid="newsletter-campaigns-loading">
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white border border-border p-4 animate-pulse">
              <div className="h-4 w-64 bg-secondary rounded mb-2" />
              <div className="h-3 w-48 bg-secondary rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ⭐ Erreur avec retry
  if (error && list.length === 0) {
    return (
      <div data-testid="newsletter-campaigns-error" className="bg-red-50 border border-red-200 p-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold text-red-800 mb-1">Erreur de chargement</div>
          <div className="text-sm text-red-700 mb-3">{error}</div>
          <button onClick={() => load()} className="inline-flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase px-3 py-2">
            <RefreshCw className="w-3 h-3" /> Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="newsletter-campaigns">
      <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
        <div className="flex-1">
          <p className="text-xs text-ink-muted max-w-xl">
            Annoncez les nouveaux maillots : rédigez en FR (et EN), choisissez jusqu'a 6 produits a mettre en avant, testez puis envoyez. Chaque e-mail contient un lien de desabonnement.
          </p>
          {hasSendingCampaigns && (
            <p className="text-[11px] text-amber-700 mt-2 inline-flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" /> Envoi en cours — actualisation auto toutes les {POLL_INTERVAL_MS / 1000}s
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1 border border-border px-3 py-2 text-sm font-semibold hover:border-ink disabled:opacity-50"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <Button onClick={() => { setEditing(null); setForm(EMPTY); setOpen(true); }} className="bg-brand hover:bg-brand-dark rounded-none" data-testid="new-campaign-btn">
            <Plus className="w-4 h-4 mr-1" /> Nouvelle campagne
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {list.map((c) => (
          <div key={c.id} className="bg-white border border-border p-4 flex flex-wrap items-center justify-between gap-3" data-testid={`campaign-row-${c.id}`}>
            <div className="min-w-0">
              <div className="font-semibold">{c.subject_fr}</div>
              <div className="text-xs text-ink-muted">
                {c.name && `${c.name} · `}{fmtDate(c.created_at, true)} · {c.product_slugs.length} produit(s)
                {c.status !== "draft" && ` · ${c.sent_count}/${c.total_recipients} envoyes${c.failed_count ? `, ${c.failed_count} echecs` : ""}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 font-semibold ${statusColor[c.status]}`} data-testid={`campaign-status-${c.id}`}>{c.status}</span>
              <button onClick={() => test(c)} title="Envoyer un test a l'admin" className="p-1.5 hover:bg-secondary" data-testid={`campaign-test-${c.id}`}>
                <FlaskConical className="w-4 h-4" />
              </button>
              {c.status === "draft" && (
                <>
                  <button onClick={() => { setEditing(c.id); setForm({ ...EMPTY, ...c }); setOpen(true); }} className="p-1.5 hover:bg-secondary">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => send(c)} className="inline-flex items-center gap-1 bg-ink text-white px-3 py-1.5 text-xs font-bold uppercase hover:bg-black" data-testid={`campaign-send-${c.id}`}>
                    <Send className="w-3 h-3" /> Envoyer
                  </button>
                </>
              )}
              <button onClick={() => remove(c)} className="p-1.5 hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
        {list.length === 0 && !loading && (
          <p className="text-ink-muted text-sm">Aucune campagne. Cliquez sur "Nouvelle campagne" pour commencer.</p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>{editing ? "Modifier" : "Nouvelle"} campagne</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom interne</Label><Input value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder="Drop maillots saison 26/27" /></div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>Sujet FR *</Label><Input value={form.subject_fr} onChange={(e) => setF("subject_fr", e.target.value)} data-testid="campaign-subject-fr" /></div>
              <div><Label>Sujet EN</Label><Input value={form.subject_en} onChange={(e) => setF("subject_en", e.target.value)} /></div>
              <div><Label>Texte FR *</Label><Textarea rows={5} value={form.body_fr} onChange={(e) => setF("body_fr", e.target.value)} data-testid="campaign-body-fr" /></div>
              <div><Label>Texte EN</Label><Textarea rows={5} value={form.body_en} onChange={(e) => setF("body_en", e.target.value)} /></div>
              <div><Label>Bouton FR</Label><Input value={form.cta_fr} onChange={(e) => setF("cta_fr", e.target.value)} /></div>
              <div><Label>Bouton EN</Label><Input value={form.cta_en} onChange={(e) => setF("cta_en", e.target.value)} /></div>
              <div className="sm:col-span-2"><Label>Lien du bouton</Label><Input value={form.cta_link} onChange={(e) => setF("cta_link", e.target.value)} placeholder="/catalog?is_new=true" /></div>
            </div>
            <div>
              <Label>Produits mis en avant ({form.product_slugs.length}/6)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-48 overflow-auto border border-border p-2 mt-1">
                {products.map((p) => (
                  <label key={p.id} className={`flex items-center gap-2 text-xs p-1 cursor-pointer ${form.product_slugs.includes(p.slug) ? "bg-brand/10" : "hover:bg-secondary"}`}>
                    <input type="checkbox" checked={form.product_slugs.includes(p.slug)} onChange={() => toggleProduct(p.slug)} />
                    <img src={p.images?.[0]} alt="" className="w-6 h-7 object-cover" />
                    <span className="truncate">{p.name_fr}</span>
                  </label>
                ))}
                {products.length === 0 && <p className="text-xs text-ink-muted italic col-span-full">Aucun produit publié disponible</p>}
              </div>
            </div>
            <Button onClick={save} disabled={busy} className="w-full bg-ink hover:bg-ink/90 rounded-none" data-testid="save-campaign-btn">
              {busy ? "Enregistrement..." : "Enregistrer le brouillon"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ============================================================
// MAIN
// ============================================================
export default function AdminNewsletter() {
  const [tab, setTab] = useState("campaigns");
  return (
    <div data-testid="admin-newsletter">
      <h1 className="font-heading text-2xl font-bold uppercase mb-5 inline-flex items-center gap-2">
        <Mail className="w-6 h-6 text-brand" /> Newsletter
      </h1>
      <div className="flex gap-1 mb-5 border-b border-border">
        {[["campaigns", "Campagnes"], ["subscribers", "Abonnes"]].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            data-testid={`newsletter-tab-${k}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "campaigns" ? <Campaigns /> : <Subscribers />}
    </div>
  );
}