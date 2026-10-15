import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api, apiError } from "@/lib/api";
import { Stars } from "@/components/Stars";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { BadgeCheck, Camera, X, Pencil, Trash2, Clock, HelpCircle } from "lucide-react";
import { mediaSrc } from "@/lib/adminUtils";

export default function ProductReviews({ slug }) {
  const { t, lang, user, applyBrand } = useStore();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [myReview, setMyReview] = useState(null);
  const [canReview, setCanReview] = useState(false);
  const [noReviewReason, setNoReviewReason] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [form, setForm] = useState({ rating: 5, title: "", body: "", images: [] });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  // --- Filtres / tri / pagination ---
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("recent");
  const [filterRating, setFilterRating] = useState(null);   // 1..5 | null
  const [filterVerified, setFilterVerified] = useState(false);
  const [filterPhotos, setFilterPhotos] = useState(false);
  const [allReviews, setAllReviews] = useState([]);          // liste accumulée
  const [loadingMore, setLoadingMore] = useState(false);

  const PAGE_SIZE = 10;

  const buildQuery = (p) => {
    const params = new URLSearchParams();
    params.set("page", String(p));
    params.set("limit", String(PAGE_SIZE));
    params.set("sort", sort);
    if (filterRating) params.set("rating", String(filterRating));
    if (filterVerified) params.set("verified", "1");
    if (filterPhotos) params.set("with_photos", "1");
    return params.toString();
  };

  const load = () =>
    api.get(`/products/${slug}/reviews?${buildQuery(1)}`)
      .then((r) => {
        setData(r.data);
        setAllReviews(r.data.reviews || []);
        setPage(1);
      })
      .catch(() => {});

  const loadMore = async () => {
    if (!data || page >= (data.pages || 1)) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const { data: r } = await api.get(`/products/${slug}/reviews?${buildQuery(next)}`);
      setAllReviews((prev) => [...prev, ...(r.reviews || [])]);
      setData(r);
      setPage(next);
    } catch (e) {
      toast.error(apiError(e));
    }
    setLoadingMore(false);
  };

  const resetFilters = () => {
    setFilterRating(null);
    setFilterVerified(false);
    setFilterPhotos(false);
    setSort("recent");
  };

  const loadMine = () => {
    if (!user) {
      setMyReview(null);
      setCanReview(false);
      setNoReviewReason(null);
      return;
    }
    api.get(`/products/${slug}/my-review`)
      .then((r) => {
        setMyReview(r.data.review);
        setCanReview(r.data.can_review);
        setNoReviewReason(r.data.reason);
      })
      .catch(() => {
        setMyReview(null);
        setCanReview(false);
        setNoReviewReason(null);
      });
  };

  // Recharge à chaque changement de filtre / tri
  useEffect(() => { load(); }, [slug, sort, filterRating, filterVerified, filterPhotos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadMine(); }, [slug, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ouverture auto du formulaire si ?review=1 dans l'URL et user éligible
  useEffect(() => {
    if (searchParams.get("review") === "1" && user && !myReview && canReview) {
      setOpen(true);
      setTimeout(() => {
        document.querySelector('[data-testid="review-form"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [searchParams, user, myReview, canReview]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => setForm({ rating: 5, title: "", body: "", images: [] });

  const openNewForm = () => {
    resetForm();
    setEditing(false);
    setOpen(true);
  };

  const openEditForm = () => {
    if (!myReview) return;
    setForm({
      rating: myReview.rating,
      title: myReview.title || "",
      body: myReview.body || "",
      images: myReview.images || [],
    });
    setEditing(true);
    setOpen(true);
    setTimeout(() => {
      document.querySelector('[data-testid="review-form"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const cancelForm = () => {
    setOpen(false);
    setEditing(false);
    resetForm();
  };

  const addPhoto = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data: d } = await api.post("/reviews/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm((f) => ({ ...f, images: [...f.images, d.url].slice(0, 4) }));
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const submit = async () => {
    if (form.body.trim().length < 3) {
      return toast.error(lang === "fr" ? "Ecrivez quelques mots" : "Write a few words");
    }
    setBusy(true);
    try {
      await api.post(`/products/${slug}/reviews`, { ...form, lang });
      toast.success(
        editing
          ? (lang === "fr" ? "Avis modifié" : "Review updated")
          : t("reviewThanks")
      );
      setOpen(false);
      setEditing(false);
      resetForm();
      load();
      loadMine();
    } catch (e) {
      toast.error(apiError(e));
    }
    setBusy(false);
  };

  const deleteReview = async (id) => {
    if (!window.confirm(lang === "fr" ? "Supprimer cet avis ?" : "Delete this review?")) return;
    try {
      await api.delete(`/reviews/${id}`);
      toast.success(lang === "fr" ? "Avis supprimé" : "Review deleted");
      load();
      loadMine();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  if (!data) return null;

  const canEdit = myReview?.can_edit !== false;
  const isEdited = myReview?.is_edited;

  return (
    <section className="mt-16 border-t border-border pt-10" data-testid="product-reviews">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="font-heading text-2xl font-bold uppercase tracking-tight">{t("reviews")}</h2>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-4xl font-heading font-extrabold" data-testid="reviews-average">
              {data.count ? data.average.toFixed(1) : "–"}
            </span>
            <div>
              <Stars value={data.average} size="md" />
              <div className="text-xs text-ink-muted">{data.count} {t("reviewsCount")}</div>
            </div>
          </div>
        </div>

        {user ? (
          myReview ? (
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-2">
                <Button
                  onClick={openEditForm}
                  disabled={!canEdit}
                  title={!canEdit ? (lang === "fr" ? "Delai de modification depasse (14 jours)" : "Edit window expired (14 days)") : ""}
                  className="bg-ink hover:bg-ink/90 rounded-none uppercase font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="edit-review-btn"
                >
                  <Pencil className="w-4 h-4 mr-1" /> {lang === "fr" ? "Modifier" : "Edit"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => deleteReview(myReview.id)}
                  className="rounded-none uppercase font-bold text-red-600 border-red-200 hover:bg-red-50"
                  data-testid="delete-review-btn"
                >
                  <Trash2 className="w-4 h-4 mr-1" /> {lang === "fr" ? "Supprimer" : "Delete"}
                </Button>
              </div>
              {!canEdit && (
                <span className="text-[11px] text-ink-muted inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {lang === "fr" ? "Delai de modification depasse" : "Edit window expired"}
                </span>
              )}
            </div>
          ) : canReview ? (
            <Button
              onClick={openNewForm}
              className="bg-ink hover:bg-ink/90 rounded-none uppercase font-bold"
              data-testid="write-review-btn"
            >
              {t("writeReview")}
            </Button>
          ) : (
            <div className="max-w-md text-right">
              <div className="text-xs text-ink-muted leading-relaxed">
                {noReviewReason === "pending_delivery"
                  ? (lang === "fr"
                      ? "Vous pourrez laisser un avis des reception de votre commande."
                      : "You will be able to leave a review once your order is delivered.")
                  : (lang === "fr"
                      ? "Seuls les clients ayant recu ce produit peuvent laisser un avis."
                      : "Only customers who received this product can leave a review.")}
              </div>
              <button
                type="button"
                onClick={() => setShowRules((s) => !s)}
                className="text-xs text-brand font-semibold hover:underline mt-1 inline-flex items-center gap-1"
                data-testid="review-rules-toggle"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                {showRules
                  ? (lang === "fr" ? "Masquer les regles" : "Hide rules")
                  : (lang === "fr" ? "En savoir plus" : "Learn more")}
              </button>
            </div>
          )
        ) : (
          <Link to="/login" className="text-sm text-brand font-semibold hover:underline" data-testid="review-login-link">
            {t("loginToReview")}
          </Link>
        )}
      </div>

      {/* Panneau des règles */}
      {showRules && (
        <div className="border border-border bg-secondary p-5 mb-6" data-testid="review-rules-panel">
          <h3 className="font-heading text-sm font-bold uppercase tracking-wider mb-3">
            {lang === "fr" ? "Regles pour laisser un avis" : "Review rules"}
          </h3>
          <ul className="space-y-2 text-sm text-ink-soft leading-relaxed">
            <li className="flex gap-2">
              <span className="text-brand font-bold shrink-0">1.</span>
              <span>
                {lang === "fr"
                  ? applyBrand("Vous devez avoir passe une commande contenant ce produit sur CAKESSHOP.")
                  : applyBrand("You must have placed an order containing this product on CAKESSHOP.")}
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-brand font-bold shrink-0">2.</span>
              <span>
                {lang === "fr"
                  ? "Votre commande doit avoir ete livree. Le bouton \"Donner mon avis\" apparaitra automatiquement apres la livraison."
                  : "Your order must have been delivered. The \"Write a review\" button will appear automatically after delivery."}
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-brand font-bold shrink-0">3.</span>
              <span>
                {lang === "fr"
                  ? "Vous pouvez modifier votre avis pendant 14 jours apres sa publication. Passe ce delai, seul la suppression reste possible."
                  : "You can edit your review for 14 days after posting. After that, only deletion remains possible."}
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-brand font-bold shrink-0">4.</span>
              <span>
                {lang === "fr"
                  ? "Vous pouvez supprimer votre avis a tout moment."
                  : "You can delete your review at any time."}
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-brand font-bold shrink-0">5.</span>
              <span>
                {lang === "fr"
                  ? "Les avis verifies (achat confirme) portent le badge \"Achat verifie\"."
                  : "Verified reviews (confirmed purchase) carry the \"Verified purchase\" badge."}
              </span>
            </li>
          </ul>
          <button
            type="button"
            onClick={() => setShowRules(false)}
            className="mt-4 text-xs text-ink-muted hover:text-ink underline"
          >
            {lang === "fr" ? "Fermer" : "Close"}
          </button>
        </div>
      )}

      {data.count > 0 && (
        <div className="mb-8">
          {/* Graphique cliquable */}
          <div className="grid sm:grid-cols-5 gap-1 max-w-sm text-xs mb-5">
            {[5, 4, 3, 2, 1].map((n) => {
              const count = data.distribution[n] || 0;
              const pct = data.count ? (count / data.count) * 100 : 0;
              const isActive = filterRating === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setFilterRating(isActive ? null : n)}
                  className={`sm:col-span-5 flex items-center gap-2 p-1 text-left rounded transition-colors ${isActive ? "bg-amber-100" : "hover:bg-secondary"}`}
                  data-testid={`filter-rating-${n}`}
                >
                  <span className={`w-6 ${isActive ? "font-bold text-amber-700" : ""}`}>{n}★</span>
                  <div className="flex-1 h-2 bg-secondary">
                    <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`w-6 ${isActive ? "font-bold text-amber-700" : "text-ink-muted"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Barre de filtres + tri */}
          <div className="flex flex-wrap gap-3 items-center border-t border-border pt-4">
            {/* Tri */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-ink-muted uppercase tracking-wider">{lang === "fr" ? "Trier" : "Sort"}</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="border border-border h-9 px-2 bg-white text-xs"
                data-testid="review-sort"
              >
                <option value="recent">{lang === "fr" ? "Plus récents" : "Most recent"}</option>
                <option value="oldest">{lang === "fr" ? "Plus anciens" : "Oldest"}</option>
                <option value="rating_high">{lang === "fr" ? "Mieux notés" : "Highest rated"}</option>
                <option value="rating_low">{lang === "fr" ? "Moins bien notés" : "Lowest rated"}</option>
              </select>
            </div>

            {/* Filtres checkbox */}
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterVerified}
                onChange={(e) => setFilterVerified(e.target.checked)}
                data-testid="filter-verified"
              />
              <BadgeCheck className="w-3.5 h-3.5 text-green-700" />
              {lang === "fr" ? "Achat vérifié" : "Verified purchase"}
            </label>

            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterPhotos}
                onChange={(e) => setFilterPhotos(e.target.checked)}
                data-testid="filter-photos"
              />
              <Camera className="w-3.5 h-3.5 text-ink-muted" />
              {lang === "fr" ? "Avec photos" : "With photos"}
            </label>

            {/* Lien reset + compteur filtré */}
            {(filterRating || filterVerified || filterPhotos || sort !== "recent") && (
              <div className="flex items-center gap-3 ml-auto">
                <span className="text-xs text-ink-muted">
                  {data.filtered_count} {lang === "fr" ? "résultat(s)" : "result(s)"}
                </span>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs text-brand font-semibold hover:underline inline-flex items-center gap-1"
                  data-testid="reset-filters"
                >
                  <X className="w-3.5 h-3.5" />
                  {lang === "fr" ? "Réinitialiser" : "Reset"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {open && (
        <div className="border border-border p-5 mb-8 bg-white" data-testid="review-form">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold uppercase tracking-wider">
              {editing
                ? (lang === "fr" ? "Modifier mon avis" : "Edit my review")
                : (lang === "fr" ? "Nouvel avis" : "New review")}
            </div>
            {editing && isEdited && (
              <span className="text-[11px] uppercase tracking-wider bg-secondary px-2 py-0.5 text-ink-muted">
                {lang === "fr" ? "Modifie le " : "Edited "}
                {new Date(myReview.edited_at).toLocaleDateString()}
              </span>
            )}
          </div>

          <div className="mb-3">
            <div className="text-xs uppercase tracking-wider text-ink-muted mb-1">{t("yourRating")}</div>
            <Stars value={form.rating} size="lg" onChange={(r) => setForm({ ...form, rating: r })} testid="review-rating" />
          </div>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={t("reviewTitle")}
            className="mb-2"
            data-testid="review-title"
          />
          <Textarea
            rows={4}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder={t("reviewBody")}
            data-testid="review-body"
          />

          <div className="flex flex-wrap items-center gap-2 mt-3">
            {form.images.map((u, i) => (
              <div key={u} className="relative w-16 h-16">
                <img src={mediaSrc(u)} alt="" className="w-16 h-16 object-cover" />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, images: form.images.filter((_, idx) => idx !== i) })}
                  className="absolute -top-1 -right-1 bg-white border border-border p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {form.images.length < 4 && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-16 h-16 border-2 border-dashed border-border hover:border-brand flex items-center justify-center text-ink-muted"
                data-testid="review-photo-btn"
              >
                <Camera className="w-5 h-5" />
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = ""; }}
            />
          </div>

          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={cancelForm} className="rounded-none">
              {lang === "fr" ? "Annuler" : "Cancel"}
            </Button>
            <Button
              onClick={submit}
              disabled={busy}
              className="bg-brand hover:bg-brand-dark rounded-none uppercase font-bold"
              data-testid="submit-review-btn"
            >
              {editing
                ? (lang === "fr" ? "Enregistrer" : "Save")
                : t("publishReview")}
            </Button>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4" data-testid="reviews-list">
        {allReviews.map((r) => {
          const isMine = user && myReview && r.id === myReview.id;
          return (
            <article key={r.id} className={`border p-5 ${isMine ? "border-brand/40 bg-brand/5" : "border-border"}`} data-testid={`review-${r.id}`}>
              <div className="flex items-center justify-between gap-2">
                <Stars value={r.rating} />
                <div className="flex items-center gap-2">
                  {r.is_edited && (
                    <span
                      className="text-[10px] uppercase tracking-wider bg-secondary px-1.5 py-0.5 text-ink-muted inline-flex items-center gap-1"
                      title={r.edited_at ? new Date(r.edited_at).toLocaleString() : ""}
                      data-testid={`review-edited-badge-${r.id}`}
                    >
                      <Pencil className="w-2.5 h-2.5" />
                      {lang === "fr" ? "Modifié" : "Edited"}
                    </span>
                  )}
                  <span className="text-xs text-ink-muted">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              {r.title && <h3 className="font-semibold mt-2">{r.title}</h3>}
              <p className="text-sm text-ink-soft mt-1 whitespace-pre-line">{r.body}</p>
              {r.images?.length > 0 && (
                <div className="flex gap-2 mt-3">
                  {r.images.map((u) => (
                    <a key={u} href={mediaSrc(u)} target="_blank" rel="noreferrer">
                      <img src={mediaSrc(u)} alt="" className="w-16 h-16 object-cover" />
                    </a>
                  ))}
                </div>
              )}
              <div className="mt-3 text-xs text-ink-muted flex items-center gap-2 flex-wrap">
                {r.author_name}
                {isMine && <span className="text-brand font-semibold">(vous)</span>}
                {r.verified_purchase && (
                  <span className="inline-flex items-center gap-1 text-green-700">
                    <BadgeCheck className="w-3.5 h-3.5" /> {t("verifiedPurchase")}
                  </span>
                )}
              </div>
              {r.admin_reply && (
                <div className="mt-3 bg-secondary border-l-2 border-brand p-3 text-sm" data-testid={`review-reply-${r.id}`}>
                  <div className="text-[11px] uppercase tracking-wider font-bold text-brand mb-1">{t("storeReply")}</div>
                  <p className="text-ink-soft whitespace-pre-line">{r.admin_reply}</p>
                </div>
              )}
            </article>
          );
        })}
        {data.count === 0 && <p className="text-ink-muted text-sm">{t("noReviews")}</p>}
        {data.count > 0 && allReviews.length === 0 && (
          <p className="text-ink-muted text-sm col-span-2 text-center py-8">
            {lang === "fr" ? "Aucun avis ne correspond à ces filtres." : "No review matches these filters."}
          </p>
        )}
      </div>

      {/* Bouton "Voir plus" */}
      {data.count > 0 && page < (data.pages || 1) && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="border border-ink px-6 py-3 text-sm font-bold uppercase hover:bg-ink hover:text-white transition-colors disabled:opacity-50"
            data-testid="load-more-reviews"
          >
            {loadingMore
              ? (lang === "fr" ? "Chargement..." : "Loading...")
              : (lang === "fr"
                  ? `Voir plus d'avis (${allReviews.length}/${data.filtered_count})`
                  : `Load more reviews (${allReviews.length}/${data.filtered_count})`)}
          </button>
        </div>
      )}
    </section>
  );
}