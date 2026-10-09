import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api, apiError } from "@/lib/api";
import { Stars } from "@/components/Stars";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { BadgeCheck, Camera, X } from "lucide-react";

export default function ProductReviews({ slug }) {
  const { t, lang, user } = useStore();
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ rating: 5, title: "", body: "", images: [] });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  const load = () => api.get(`/products/${slug}/reviews`).then((r) => setData(r.data)).catch(() => {});
  useEffect(() => { load(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const addPhoto = async (file) => {
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try { const { data: d } = await api.post("/reviews/upload", fd, { headers: { "Content-Type": "multipart/form-data" } }); setForm((f) => ({ ...f, images: [...f.images, d.url].slice(0, 4) })); }
    catch (e) { toast.error(apiError(e)); }
  };
  const submit = async () => {
    if (form.body.trim().length < 3) return toast.error(lang === "fr" ? "Ecrivez quelques mots" : "Write a few words");
    setBusy(true);
    try { await api.post(`/products/${slug}/reviews`, form); toast.success(t("reviewThanks")); setOpen(false); setForm({ rating: 5, title: "", body: "", images: [] }); load(); }
    catch (e) { toast.error(apiError(e)); }
    setBusy(false);
  };

  if (!data) return null;
  return (
    <section className="mt-16 border-t border-border pt-10" data-testid="product-reviews">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="font-heading text-2xl font-bold uppercase tracking-tight">{t("reviews")}</h2>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-4xl font-heading font-extrabold" data-testid="reviews-average">{data.count ? data.average.toFixed(1) : "–"}</span>
            <div><Stars value={data.average} size="md" /><div className="text-xs text-ink-muted">{data.count} {t("reviewsCount")}</div></div>
          </div>
        </div>
        {user ? (
          <Button onClick={() => setOpen((o) => !o)} className="bg-ink hover:bg-ink/90 rounded-none uppercase font-bold" data-testid="write-review-btn">{t("writeReview")}</Button>
        ) : (
          <Link to="/login" className="text-sm text-brand font-semibold hover:underline" data-testid="review-login-link">{t("loginToReview")}</Link>
        )}
      </div>

      {data.count > 0 && (
        <div className="grid sm:grid-cols-5 gap-1 max-w-sm mb-8 text-xs">
          {[5, 4, 3, 2, 1].map((n) => (
            <div key={n} className="sm:col-span-5 flex items-center gap-2"><span className="w-6">{n}★</span>
              <div className="flex-1 h-2 bg-secondary"><div className="h-full bg-amber-400" style={{ width: `${(data.distribution[n] / data.count) * 100}%` }} /></div>
              <span className="w-6 text-ink-muted">{data.distribution[n]}</span></div>
          ))}
        </div>
      )}

      {open && (
        <div className="border border-border p-5 mb-8 bg-white" data-testid="review-form">
          <div className="mb-3"><div className="text-xs uppercase tracking-wider text-ink-muted mb-1">{t("yourRating")}</div><Stars value={form.rating} size="lg" onChange={(r) => setForm({ ...form, rating: r })} testid="review-rating" /></div>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("reviewTitle")} className="mb-2" data-testid="review-title" />
          <Textarea rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder={t("reviewBody")} data-testid="review-body" />
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {form.images.map((u, i) => (
              <div key={u} className="relative w-16 h-16"><img src={u} alt="" className="w-full h-full object-cover" /><button onClick={() => setForm({ ...form, images: form.images.filter((_, idx) => idx !== i) })} className="absolute -top-1 -right-1 bg-white border border-border p-0.5"><X className="w-3 h-3" /></button></div>
            ))}
            {form.images.length < 4 && <button type="button" onClick={() => fileRef.current?.click()} className="w-16 h-16 border-2 border-dashed border-border hover:border-brand flex items-center justify-center text-ink-muted" data-testid="review-photo-btn"><Camera className="w-5 h-5" /></button>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-none">{lang === "fr" ? "Annuler" : "Cancel"}</Button>
            <Button onClick={submit} disabled={busy} className="bg-brand hover:bg-brand-dark rounded-none uppercase font-bold" data-testid="submit-review-btn">{t("publishReview")}</Button>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4" data-testid="reviews-list">
        {data.reviews.map((r) => (
          <article key={r.id} className="border border-border p-5" data-testid={`review-${r.id}`}>
            <div className="flex items-center justify-between gap-2">
              <Stars value={r.rating} />
              <span className="text-xs text-ink-muted">{new Date(r.created_at).toLocaleDateString()}</span>
            </div>
            {r.title && <h3 className="font-semibold mt-2">{r.title}</h3>}
            <p className="text-sm text-ink-soft mt-1 whitespace-pre-line">{r.body}</p>
            {r.images?.length > 0 && <div className="flex gap-2 mt-3">{r.images.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="w-16 h-16 object-cover" /></a>)}</div>}
            <div className="mt-3 text-xs text-ink-muted flex items-center gap-2">{r.author_name}{r.verified_purchase && <span className="inline-flex items-center gap-1 text-green-700"><BadgeCheck className="w-3.5 h-3.5" /> {t("verifiedPurchase")}</span>}</div>
          </article>
        ))}
        {data.count === 0 && <p className="text-ink-muted text-sm">{t("noReviews")}</p>}
      </div>
    </section>
  );
}
