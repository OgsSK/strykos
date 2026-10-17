import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SingleMediaUploader } from "@/components/admin/MediaUploader";
import { Plus, Trash2, ArrowUp, ArrowDown, Film, Truck, ShieldCheck, Store, Headphones, Star, Heart, Clock, Phone, Gift, Package } from "lucide-react";

const EMPTY_SLIDE = { video_url: "", image_url: "", title_fr: "", title_en: "", subtitle_fr: "", subtitle_en: "", cta_fr: "Decouvrir", cta_en: "Shop now", cta_link: "/catalog" };
const SECTION_LABELS = { categories: "Achetez par categorie", new_arrivals: "Nouveautes", promotions: "Promotions", best_sellers: "Meilleures ventes", featured: "Selection CAKESSHOP" };

export function HeroSlidesEditor({ hero, onChange }) {
  const slides = hero?.slides || [];
  const set = (patch) => onChange({ ...hero, ...patch });
  const upd = (i, patch) => set({ slides: slides.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const move = (i, d) => { const arr = [...slides]; const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; set({ slides: arr }); };

  return (
    <div className="space-y-4" data-testid="hero-slides-editor">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-48">
          <Label>Duree par slide (secondes)</Label>
          <Input type="number" min={3} max={30} value={Math.round((hero?.interval_ms || 7000) / 1000)} onChange={(e) => set({ interval_ms: (parseInt(e.target.value) || 7) * 1000 })} data-testid="hero-interval" />
        </div>
        <Button variant="outline" className="rounded-none" onClick={() => set({ slides: [...slides, { ...EMPTY_SLIDE }] })} data-testid="add-slide-btn">
          <Plus className="w-4 h-4 mr-1" /> Ajouter un slide
        </Button>
      </div>

      <p className="text-[11px] text-ink-muted bg-secondary/40 border border-border p-3">
        <strong>Astuce</strong> : si une vidéo est présente, elle s'affiche en fond du cercle du hero (au-dessus de l'image). L'<em>accroche</em> apparaît au-dessus du titre avec un trait décoratif. Le <em>badge</em> s'affiche en bas à gauche de l'image/vidéo (ex : "Édition limitée").
      </p>

      {slides.map((s, i) => (
        <details key={i} className="border border-border bg-secondary/40" data-testid={`hero-slide-${i}`} open={i === 0}>
          <summary className="cursor-pointer p-4 flex items-center justify-between list-none">
            <span className="text-xs uppercase tracking-wider font-semibold inline-flex items-center gap-2">
              <Film className="w-4 h-4 text-brand" /> Slide {i + 1} — {s.title_fr || "(sans titre)"}
            </span>
            <div className="flex gap-1" onClick={(e) => e.preventDefault()}>
              <button type="button" onClick={(e) => { e.preventDefault(); move(i, -1); }} className="p-1 hover:bg-white" title="Monter"><ArrowUp className="w-4 h-4" /></button>
              <button type="button" onClick={(e) => { e.preventDefault(); move(i, 1); }} className="p-1 hover:bg-white" title="Descendre"><ArrowDown className="w-4 h-4" /></button>
              <button type="button" onClick={(e) => { e.preventDefault(); set({ slides: slides.filter((_, idx) => idx !== i) }); }} className="p-1 text-red-600 hover:bg-white" data-testid={`remove-slide-${i}`} title="Supprimer"><Trash2 className="w-4 h-4" /></button>
            </div>
          </summary>
          <div className="p-4 pt-0 grid md:grid-cols-2 gap-4">
            <div>
              <Label>Video (mp4/webm) — optionnelle</Label>
              <SingleMediaUploader value={s.video_url} onChange={(v) => upd(i, { video_url: v })} accept="video/mp4,video/webm,video/quicktime" kind="video" label="une video" testid={`slide-video-${i}`} />
            </div>
            <div>
              <Label>Image (fallback / poster)</Label>
              <SingleMediaUploader value={s.image_url} onChange={(v) => upd(i, { image_url: v })} label="une image" testid={`slide-image-${i}`} />
            </div>

            <div>
              <Label>Accroche FR <span className="text-ink-muted font-normal">(optionnel)</span></Label>
              <Input value={s.overline_fr || ""} onChange={(e) => upd(i, { overline_fr: e.target.value })} placeholder="Gâteaux d'exception" data-testid={`slide-overline-fr-${i}`} />
            </div>
            <div>
              <Label>Accroche EN <span className="text-ink-muted font-normal">(optionnel)</span></Label>
              <Input value={s.overline_en || ""} onChange={(e) => upd(i, { overline_en: e.target.value })} placeholder="Exceptional cakes" />
            </div>

            <div><Label>Titre FR</Label><Input value={s.title_fr} onChange={(e) => upd(i, { title_fr: e.target.value })} data-testid={`slide-title-fr-${i}`} /></div>
            <div><Label>Titre EN</Label><Input value={s.title_en} onChange={(e) => upd(i, { title_en: e.target.value })} /></div>
            <div><Label>Sous-titre FR</Label><Textarea rows={2} value={s.subtitle_fr} onChange={(e) => upd(i, { subtitle_fr: e.target.value })} /></div>
            <div><Label>Sous-titre EN</Label><Textarea rows={2} value={s.subtitle_en} onChange={(e) => upd(i, { subtitle_en: e.target.value })} /></div>
            <div><Label>Bouton FR</Label><Input value={s.cta_fr} onChange={(e) => upd(i, { cta_fr: e.target.value })} /></div>
            <div><Label>Bouton EN</Label><Input value={s.cta_en} onChange={(e) => upd(i, { cta_en: e.target.value })} /></div>
            <div className="md:col-span-2">
              <Label>Lien du bouton</Label>
              <Input value={s.cta_link} onChange={(e) => upd(i, { cta_link: e.target.value })} placeholder="/catalog?category=anniversaire" />
            </div>

            <div>
              <Label>Badge sur l'image/vidéo — FR <span className="text-ink-muted font-normal">(optionnel)</span></Label>
              <Input value={s.badge_text_fr || ""} onChange={(e) => upd(i, { badge_text_fr: e.target.value })} placeholder="Édition limitée" data-testid={`slide-badge-fr-${i}`} />
            </div>
            <div>
              <Label>Badge sur l'image/vidéo — EN <span className="text-ink-muted font-normal">(optionnel)</span></Label>
              <Input value={s.badge_text_en || ""} onChange={(e) => upd(i, { badge_text_en: e.target.value })} placeholder="Limited edition" />
            </div>
          </div>
        </details>
      ))}
      {slides.length === 0 && <p className="text-sm text-amber-600">Aucun slide : la banniere sera masquee.</p>}
    </div>
  );
}

const EMPTY_CARD = { image_url: "", video_url: "", overline_fr: "", overline_en: "", title_fr: "", title_en: "", cta_fr: "Acheter", cta_en: "Shop", cta_link: "/catalog", cta2_fr: "", cta2_en: "", cta2_link: "" };

function CardEditor({ card, onChange, onRemove, testid, index }) {
  const u = (patch) => onChange({ ...card, ...patch });
  return (
    <details className="border border-border bg-white" data-testid={testid} open={index === 0}>
      <summary className="cursor-pointer p-3 flex items-center justify-between list-none">
        <span className="text-[11px] uppercase tracking-wider text-ink-muted">Carte {index + 1} — {card.title_fr || "(sans titre)"}</span>
        <button type="button" onClick={(e) => { e.preventDefault(); onRemove(); }} className="text-red-600 p-1" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
      </summary>
      <div className="p-3 pt-0 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Image</Label><SingleMediaUploader value={card.image_url || ""} onChange={(v) => u({ image_url: v })} label="une image" testid={`${testid}-image`} /></div>
          <div><Label>Video (optionnel)</Label><SingleMediaUploader value={card.video_url || ""} onChange={(v) => u({ video_url: v })} accept="video/mp4,video/webm,video/quicktime" kind="video" label="une video" testid={`${testid}-video`} /></div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Surtitre FR</Label><Input value={card.overline_fr || ""} onChange={(e) => u({ overline_fr: e.target.value })} placeholder="Nouvelle collection" /></div>
          <div><Label>Surtitre EN</Label><Input value={card.overline_en || ""} onChange={(e) => u({ overline_en: e.target.value })} /></div>
          <div><Label>Titre FR</Label><Input value={card.title_fr || ""} onChange={(e) => u({ title_fr: e.target.value })} placeholder="Impossible a arreter" data-testid={`${testid}-title-fr`} /></div>
          <div><Label>Titre EN</Label><Input value={card.title_en || ""} onChange={(e) => u({ title_en: e.target.value })} /></div>
        </div>

        <div className="border-t border-border pt-3 space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div><Label>Bouton 1 — texte FR</Label><Input value={card.cta_fr || ""} onChange={(e) => u({ cta_fr: e.target.value })} /></div>
            <div><Label>Bouton 1 — texte EN</Label><Input value={card.cta_en || ""} onChange={(e) => u({ cta_en: e.target.value })} /></div>
            <div><Label>Bouton 1 — lien</Label><Input value={card.cta_link || ""} onChange={(e) => u({ cta_link: e.target.value })} placeholder="/catalog?is_new=true" /></div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div><Label>Bouton 2 FR (optionnel)</Label><Input value={card.cta2_fr || ""} onChange={(e) => u({ cta2_fr: e.target.value })} placeholder="En savoir plus" /></div>
            <div><Label>Bouton 2 EN (optionnel)</Label><Input value={card.cta2_en || ""} onChange={(e) => u({ cta2_en: e.target.value })} placeholder="Learn more" /></div>
            <div><Label>Bouton 2 — lien</Label><Input value={card.cta2_link || ""} onChange={(e) => u({ cta2_link: e.target.value })} placeholder="/page/about" /></div>
          </div>
        </div>
      </div>
    </details>
  );
}

export function SectionsEditor({ sections, onChange, only = null }) {
  const ALL_KEYS = ["categories", "new_arrivals", "promotions", "best_sellers", "featured"];
  const keys = only ? ALL_KEYS.filter((k) => only.includes(k)) : ALL_KEYS;

  const upd = (k, patch) => onChange({ ...sections, [k]: { ...(sections?.[k] || {}), ...patch } });

  return (
    <div className="space-y-3" data-testid="sections-editor">
      <p className="text-xs text-ink-muted">
        « Achetez par categorie » garde sa banniere video plein ecran. Les autres sections affichent jusqu'a 2 cartes editoriales (style Nike : image ou video, surtitre, titre, boutons) au-dessus des produits.
      </p>
      {keys.map((k) => {
        const v = sections?.[k] || {};
        const cards = v.cards || [];
        const isBanner = k === "categories";
        return (
          <details key={k} className="border border-border bg-secondary/30" data-testid={`section-editor-${k}`}>
            <summary className="cursor-pointer p-4 text-xs uppercase tracking-wider font-semibold list-none">
              {SECTION_LABELS[k]} {isBanner ? "— banniere" : `— ${cards.length} carte(s)`}
            </summary>
            <div className="p-4 pt-0">
              {isBanner ? (
                <div className="grid md:grid-cols-2 gap-4">
                  <div><Label>Video</Label><SingleMediaUploader value={v.video_url || ""} onChange={(u) => upd(k, { video_url: u })} accept="video/mp4,video/webm,video/quicktime" kind="video" label="une video" testid={`section-video-${k}`} /></div>
                  <div><Label>Image (secours / poster)</Label><SingleMediaUploader value={v.image_url || ""} onChange={(u) => upd(k, { image_url: u })} label="une image" testid={`section-image-${k}`} /></div>
                  <div><Label>Accroche FR</Label><Input value={v.tagline_fr || ""} onChange={(e) => upd(k, { tagline_fr: e.target.value })} /></div>
                  <div><Label>Accroche EN</Label><Input value={v.tagline_en || ""} onChange={(e) => upd(k, { tagline_en: e.target.value })} /></div>
                </div>
              ) : (
                <div className="space-y-3">
                  {cards.map((c, i) => (
                    <CardEditor
                      key={i}
                      card={c}
                      index={i}
                      testid={`section-card-${k}-${i}`}
                      onChange={(nc) => upd(k, { cards: cards.map((x, idx) => (idx === i ? nc : x)) })}
                      onRemove={() => upd(k, { cards: cards.filter((_, idx) => idx !== i) })}
                    />
                  ))}
                  {cards.length < 2 && (
                    <Button variant="outline" size="sm" className="rounded-none" onClick={() => upd(k, { cards: [...cards, { ...EMPTY_CARD }] })} data-testid={`add-card-${k}`}>
                      <Plus className="w-4 h-4 mr-1" /> Ajouter une carte
                    </Button>
                  )}
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

const EMPTY_ITEM = { image_url: "", label_fr: "", label_en: "", link: "/catalog" };
const EMPTY_COL = { title_fr: "", title_en: "", links: [{ label_fr: "", label_en: "", link: "/catalog" }] };

export function IconsEditor({ icons, onChange }) {
  const v = icons || { title_fr: "", title_en: "", items: [], columns: [] };
  const set = (patch) => onChange({ ...v, ...patch });
  const items = v.items || [], columns = v.columns || [];
  const updItem = (i, patch) => set({ items: items.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) });
  const moveItem = (i, d) => { const arr = [...items]; const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; set({ items: arr }); };
  const updCol = (i, patch) => set({ columns: columns.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) });

  return (
    <div className="space-y-6" data-testid="icons-editor">
      <p className="text-xs text-ink-muted">
        Section « essentiels » façon Nike : grand titre centré, vignettes rondes (jusqu'à 16, 8 par ligne) puis 4 colonnes de liens.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div><Label>Titre FR</Label><Input value={v.title_fr || ""} onChange={(e) => set({ title_fr: e.target.value })} data-testid="icons-title-fr" /></div>
        <div><Label>Titre EN</Label><Input value={v.title_en || ""} onChange={(e) => set({ title_en: e.target.value })} /></div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <Label>Vignettes ({items.length}/16)</Label>
          {items.length < 16 && (
            <Button variant="outline" size="sm" className="rounded-none" onClick={() => set({ items: [...items, { ...EMPTY_ITEM }] })} data-testid="add-icon-item">
              <Plus className="w-4 h-4 mr-1" /> Vignette
            </Button>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          {items.map((it, i) => (
            <div key={i} className="border border-border bg-white p-3" data-testid={`icon-item-${i}`}>
              <div className="flex items-start gap-3">
                <div className="shrink-0">
                  <SingleMediaUploader
                    compact
                    value={it.image_url || ""}
                    onChange={(u) => updItem(i, { image_url: u })}
                    label="image"
                    testid={`icon-image-${i}`}
                  />
                </div>
                <div className="flex-1 min-w-0 grid grid-cols-1 gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={it.label_fr || ""} onChange={(e) => updItem(i, { label_fr: e.target.value })} placeholder="Libelle FR" className="h-8 text-xs" />
                    <Input value={it.label_en || ""} onChange={(e) => updItem(i, { label_en: e.target.value })} placeholder="Label EN" className="h-8 text-xs" />
                  </div>
                  <Input value={it.link || ""} onChange={(e) => updItem(i, { link: e.target.value })} placeholder="/catalog?category=..." className="h-8 text-xs" />
                </div>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button type="button" onClick={() => moveItem(i, -1)} className="p-1 hover:bg-secondary rounded" title="Monter"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => moveItem(i, 1)} className="p-1 hover:bg-secondary rounded" title="Descendre"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => set({ items: items.filter((_, idx) => idx !== i) })} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <Label>Colonnes de liens ({columns.length}/4)</Label>
          {columns.length < 4 && (
            <Button variant="outline" size="sm" className="rounded-none" onClick={() => set({ columns: [...columns, { ...EMPTY_COL }] })}>
              <Plus className="w-4 h-4 mr-1" /> Colonne
            </Button>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          {columns.map((col, i) => (
            <div key={i} className="border border-border bg-white p-3 space-y-3" data-testid={`icon-column-${i}`}>
              <div className="flex gap-2 items-center">
                <Input value={col.title_fr || ""} onChange={(e) => updCol(i, { title_fr: e.target.value })} placeholder="Titre FR" className="h-8 text-xs flex-1" />
                <Input value={col.title_en || ""} onChange={(e) => updCol(i, { title_en: e.target.value })} placeholder="Title EN" className="h-8 text-xs flex-1" />
                <button onClick={() => set({ columns: columns.filter((_, idx) => idx !== i) })} className="text-red-600 p-1 hover:bg-red-50 shrink-0" title="Supprimer la colonne"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="space-y-2">
                {(col.links || []).map((lk, j) => (
                  <div key={j} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 items-center">
                    <Input value={lk.label_fr || ""} onChange={(e) => updCol(i, { links: col.links.map((x, idx) => (idx === j ? { ...x, label_fr: e.target.value } : x)) })} placeholder="Lien FR" className="h-8 text-xs" />
                    <Input value={lk.label_en || ""} onChange={(e) => updCol(i, { links: col.links.map((x, idx) => (idx === j ? { ...x, label_en: e.target.value } : x)) })} placeholder="Link EN" className="h-8 text-xs" />
                    <Input value={lk.link || ""} onChange={(e) => updCol(i, { links: col.links.map((x, idx) => (idx === j ? { ...x, link: e.target.value } : x)) })} placeholder="/catalog" className="h-8 text-xs" />
                    <button onClick={() => updCol(i, { links: col.links.filter((_, idx) => idx !== j) })} className="text-red-600 p-1 hover:bg-red-50" title="Supprimer le lien"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
              {(col.links || []).length < 6 && (
                <button onClick={() => updCol(i, { links: [...(col.links || []), { label_fr: "", label_en: "", link: "/catalog" }] })} className="text-xs text-brand font-semibold hover:underline">
                  + Ajouter un lien
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ==================== Features Editor (4 avantages) ==================== */
const ICON_OPTIONS = [
  { value: "truck", label: "Camion / Livraison", Icon: Truck },
  { value: "shield", label: "Bouclier / Sécurité", Icon: ShieldCheck },
  { value: "store", label: "Boutique / Retrait", Icon: Store },
  { value: "headphones", label: "Casque / Support", Icon: Headphones },
  { value: "star", label: "Étoile", Icon: Star },
  { value: "heart", label: "Cœur", Icon: Heart },
  { value: "clock", label: "Horloge / Temps", Icon: Clock },
  { value: "phone", label: "Téléphone", Icon: Phone },
  { value: "gift", label: "Cadeau", Icon: Gift },
  { value: "package", label: "Colis", Icon: Package },
];

const EMPTY_FEATURE = { icon: "star", title_fr: "", title_en: "", subtitle_fr: "", subtitle_en: "" };

export function FeaturesEditor({ features, onChange }) {
  const items = features?.items || [];
  const set = (patch) => onChange({ ...features, ...patch });
  const upd = (i, patch) => set({ items: items.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) });
  const move = (i, d) => { const arr = [...items]; const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; set({ items: arr }); };
  const remove = (i) => set({ items: items.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4" data-testid="features-editor">
      <p className="text-xs text-ink-muted">
        Les 4 avantages affichés en bas de la home (livraison, paiement, retrait, support). Recommandé : 4 items maximum pour un bel alignement.
      </p>

      <div className="flex items-center justify-between">
        <Label>Avantages ({items.length})</Label>
        <Button variant="outline" size="sm" className="rounded-none" onClick={() => set({ items: [...items, { ...EMPTY_FEATURE }] })} data-testid="add-feature">
          <Plus className="w-4 h-4 mr-1" /> Ajouter
        </Button>
      </div>

      {items.length === 0 && <p className="text-xs text-ink-muted italic">Aucun avantage. Cliquez sur Ajouter.</p>}

      <div className="space-y-3">
        {items.map((it, i) => (
          <div key={i} className="border border-border bg-white p-3 space-y-3" data-testid={`feature-editor-${i}`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-ink-muted">Avantage {i + 1}</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => move(i, -1)} className="p-1 hover:bg-secondary" title="Monter"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => move(i, 1)} className="p-1 hover:bg-secondary" title="Descendre"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => remove(i)} className="p-1 text-red-600 hover:bg-red-50" title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>

            <div className="grid sm:grid-cols-[180px_1fr_1fr] gap-3">
              <div>
                <Label className="text-xs">Icône</Label>
                <select
                  value={it.icon || "star"}
                  onChange={(e) => upd(i, { icon: e.target.value })}
                  className="w-full border border-border h-9 px-2 bg-white text-sm"
                >
                  {ICON_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Titre FR</Label>
                <Input value={it.title_fr || ""} onChange={(e) => upd(i, { title_fr: e.target.value })} placeholder="Livraison rapide" className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Titre EN</Label>
                <Input value={it.title_en || ""} onChange={(e) => upd(i, { title_en: e.target.value })} placeholder="Fast delivery" className="h-9" />
              </div>
              <div className="sm:col-span-3 grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Sous-titre FR</Label>
                  {/* ⭐ MODIFIÉ : placeholder "À Bamako et environs" → "France, Belgique et Mali" */}
                  <Input value={it.subtitle_fr || ""} onChange={(e) => upd(i, { subtitle_fr: e.target.value })} placeholder="France, Belgique et Mali" className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Sous-titre EN</Label>
                  {/* ⭐ MODIFIÉ : placeholder "In Bamako and nearby" → "France, Belgium and Mali" */}
                  <Input value={it.subtitle_en || ""} onChange={(e) => upd(i, { subtitle_en: e.target.value })} placeholder="France, Belgium and Mali" className="h-9" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==================== Testimonials Editor (avis clients) ==================== */
const EMPTY_TESTIMONIAL = { name: "", rating: 5, avatar: "", text_fr: "", text_en: "" };

export function TestimonialsEditor({ testimonials, onChange }) {
  const v = testimonials || { title_fr: "", title_en: "", items: [] };
  const items = v.items || [];
  const set = (patch) => onChange({ ...v, ...patch });
  const upd = (i, patch) => set({ items: items.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) });
  const remove = (i) => set({ items: items.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4" data-testid="testimonials-editor">
      <p className="text-xs text-ink-muted">
        Avis affichés dans la section « Ils nous font confiance » en bas de la home.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label>Titre FR</Label>
          <Input value={v.title_fr || ""} onChange={(e) => set({ title_fr: e.target.value })} placeholder="Ils nous font confiance" />
        </div>
        <div>
          <Label>Titre EN</Label>
          <Input value={v.title_en || ""} onChange={(e) => set({ title_en: e.target.value })} placeholder="They trust us" />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Label>Avis ({items.length})</Label>
        <Button variant="outline" size="sm" className="rounded-none" onClick={() => set({ items: [...items, { ...EMPTY_TESTIMONIAL }] })} data-testid="add-testimonial">
          <Plus className="w-4 h-4 mr-1" /> Ajouter un avis
        </Button>
      </div>

      {items.length === 0 && <p className="text-xs text-ink-muted italic">Aucun avis. Cliquez sur Ajouter.</p>}

      <div className="space-y-3">
        {items.map((t, i) => (
          <div key={i} className="border border-border bg-white p-3 space-y-3" data-testid={`testimonial-editor-${i}`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-ink-muted">Avis {i + 1}</span>
              <button type="button" onClick={() => remove(i)} className="p-1 text-red-600 hover:bg-red-50" title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>

            <div className="grid sm:grid-cols-[1fr_100px_180px] gap-3">
              <div>
                <Label className="text-xs">Nom du client</Label>
                <Input value={t.name || ""} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Sophie Martin" className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Note (1-5)</Label>
                <Input
                  type="number" min={1} max={5}
                  value={t.rating ?? 5}
                  onChange={(e) => upd(i, { rating: parseInt(e.target.value) || 5 })}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Avatar (URL, optionnel)</Label>
                <Input value={t.avatar || ""} onChange={(e) => upd(i, { avatar: e.target.value })} placeholder="https://..." className="h-9 text-xs" />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Texte FR</Label>
                <Textarea rows={3} value={t.text_fr || ""} onChange={(e) => upd(i, { text_fr: e.target.value })} placeholder="Le gâteau était magnifique..." />
              </div>
              <div>
                <Label className="text-xs">Texte EN</Label>
                <Textarea rows={3} value={t.text_en || ""} onChange={(e) => upd(i, { text_en: e.target.value })} placeholder="The cake was gorgeous..." />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==================== CTA Banner Editor ==================== */
const EMPTY_BANNER = {
  image_url: "", video_url: "",
  overline_fr: "", overline_en: "",
  title_fr: "", title_en: "",
  subtitle_fr: "", subtitle_en: "",
  cta_fr: "", cta_en: "", cta_link: "/catalog?customizable=true",
};

export function CtaBannerEditor({ banner, onChange }) {
  const v = banner || { ...EMPTY_BANNER };
  const u = (patch) => onChange({ ...v, ...patch });
  return (
    <div className="space-y-4" data-testid="cta-banner-editor">
      <p className="text-xs text-ink-muted">
        Bannière pleine largeur. Idéal pour « Commandez votre gâteau personnalisé » ou une promo ponctuelle.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><Label>Image (fond)</Label><SingleMediaUploader value={v.image_url || ""} onChange={(x) => u({ image_url: x })} label="une image" testid="cta-banner-image" /></div>
        <div><Label>Video (optionnel)</Label><SingleMediaUploader value={v.video_url || ""} onChange={(x) => u({ video_url: x })} accept="video/mp4,video/webm" kind="video" label="une video" /></div>
        <div><Label>Accroche FR</Label><Input value={v.overline_fr || ""} onChange={(e) => u({ overline_fr: e.target.value })} placeholder="Sur mesure" /></div>
        <div><Label>Accroche EN</Label><Input value={v.overline_en || ""} onChange={(e) => u({ overline_en: e.target.value })} /></div>
        <div><Label>Titre FR</Label><Input value={v.title_fr || ""} onChange={(e) => u({ title_fr: e.target.value })} placeholder="Commandez votre gâteau personnalisé" /></div>
        <div><Label>Titre EN</Label><Input value={v.title_en || ""} onChange={(e) => u({ title_en: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label>Sous-titre FR</Label><Textarea rows={2} value={v.subtitle_fr || ""} onChange={(e) => u({ subtitle_fr: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label>Sous-titre EN</Label><Textarea rows={2} value={v.subtitle_en || ""} onChange={(e) => u({ subtitle_en: e.target.value })} /></div>
        <div><Label>Bouton FR</Label><Input value={v.cta_fr || ""} onChange={(e) => u({ cta_fr: e.target.value })} placeholder="Commander" /></div>
        <div><Label>Bouton EN</Label><Input value={v.cta_en || ""} onChange={(e) => u({ cta_en: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label>Lien du bouton</Label><Input value={v.cta_link || ""} onChange={(e) => u({ cta_link: e.target.value })} placeholder="/catalog?customizable=true" /></div>
      </div>
    </div>
  );
}

/* ==================== Story Block Editor ==================== */
const EMPTY_STORY = {
  image_url: "", image_position: "left",
  overline_fr: "", overline_en: "",
  title_fr: "", title_en: "",
  text_fr: "", text_en: "",
  cta_fr: "", cta_en: "", cta_link: "/page/about",
};

export function StoryBlockEditor({ story, onChange }) {
  const v = story || { ...EMPTY_STORY };
  const u = (patch) => onChange({ ...v, ...patch });
  return (
    <div className="space-y-4" data-testid="story-block-editor">
      <p className="text-xs text-ink-muted">
        Bloc « Notre histoire » : image + texte côte à côte. Idéal pour raconter votre savoir-faire.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><Label>Image</Label><SingleMediaUploader value={v.image_url || ""} onChange={(x) => u({ image_url: x })} label="une image" testid="story-image" /></div>
        <div>
          <Label>Position de l'image</Label>
          <select value={v.image_position || "left"} onChange={(e) => u({ image_position: e.target.value })} className="w-full border border-border h-9 px-2 bg-white text-sm">
            <option value="left">À gauche</option>
            <option value="right">À droite</option>
          </select>
        </div>
        <div><Label>Accroche FR</Label><Input value={v.overline_fr || ""} onChange={(e) => u({ overline_fr: e.target.value })} placeholder="Notre savoir-faire" /></div>
        <div><Label>Accroche EN</Label><Input value={v.overline_en || ""} onChange={(e) => u({ overline_en: e.target.value })} /></div>
        <div><Label>Titre FR</Label><Input value={v.title_fr || ""} onChange={(e) => u({ title_fr: e.target.value })} placeholder="Une pâtisserie artisanale" /></div>
        <div><Label>Titre EN</Label><Input value={v.title_en || ""} onChange={(e) => u({ title_en: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label>Texte FR</Label><Textarea rows={4} value={v.text_fr || ""} onChange={(e) => u({ text_fr: e.target.value })} placeholder="Depuis 2015, nous créons..." /></div>
        <div className="sm:col-span-2"><Label>Texte EN</Label><Textarea rows={4} value={v.text_en || ""} onChange={(e) => u({ text_en: e.target.value })} /></div>
        <div><Label>Bouton FR (optionnel)</Label><Input value={v.cta_fr || ""} onChange={(e) => u({ cta_fr: e.target.value })} /></div>
        <div><Label>Bouton EN (optionnel)</Label><Input value={v.cta_en || ""} onChange={(e) => u({ cta_en: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label>Lien du bouton</Label><Input value={v.cta_link || ""} onChange={(e) => u({ cta_link: e.target.value })} /></div>
      </div>
    </div>
  );
}

/* ==================== Steps Editor ==================== */
const EMPTY_STEP = { title_fr: "", title_en: "", text_fr: "", text_en: "" };

export function StepsEditor({ steps, onChange }) {
  const v = steps || { title_fr: "", title_en: "", subtitle_fr: "", subtitle_en: "", items: [] };
  const items = v.items || [];
  const set = (patch) => onChange({ ...v, ...patch });
  const upd = (i, patch) => set({ items: items.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) });
  const remove = (i) => set({ items: items.filter((_, idx) => idx !== i) });
  const move = (i, d) => { const a = [...items]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set({ items: a }); };

  return (
    <div className="space-y-4" data-testid="steps-editor">
      <p className="text-xs text-ink-muted">
        Section « Comment ça marche » : 3 étapes numérotées. Recommandé : 3 items.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><Label>Titre section FR</Label><Input value={v.title_fr || ""} onChange={(e) => set({ title_fr: e.target.value })} placeholder="Comment ça marche" /></div>
        <div><Label>Titre section EN</Label><Input value={v.title_en || ""} onChange={(e) => set({ title_en: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label>Sous-titre section FR</Label><Input value={v.subtitle_fr || ""} onChange={(e) => set({ subtitle_fr: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label>Sous-titre section EN</Label><Input value={v.subtitle_en || ""} onChange={(e) => set({ subtitle_en: e.target.value })} /></div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Label>Étapes ({items.length})</Label>
        <Button variant="outline" size="sm" className="rounded-none" onClick={() => set({ items: [...items, { ...EMPTY_STEP }] })}>
          <Plus className="w-4 h-4 mr-1" /> Ajouter
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((it, i) => (
          <div key={i} className="border border-border bg-white p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-ink-muted">Étape {i + 1}</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => move(i, -1)} className="p-1 hover:bg-secondary"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => move(i, 1)} className="p-1 hover:bg-secondary"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => remove(i)} className="p-1 text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label className="text-xs">Titre FR</Label><Input value={it.title_fr || ""} onChange={(e) => upd(i, { title_fr: e.target.value })} placeholder="Choisissez" className="h-9" /></div>
              <div><Label className="text-xs">Titre EN</Label><Input value={it.title_en || ""} onChange={(e) => upd(i, { title_en: e.target.value })} className="h-9" /></div>
              <div><Label className="text-xs">Description FR</Label><Textarea rows={2} value={it.text_fr || ""} onChange={(e) => upd(i, { text_fr: e.target.value })} placeholder="Parcourez notre catalogue..." /></div>
              <div><Label className="text-xs">Description EN</Label><Textarea rows={2} value={it.text_en || ""} onChange={(e) => upd(i, { text_en: e.target.value })} /></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==================== Gallery Editor ==================== */
const EMPTY_GALLERY_ITEM = { image_url: "", caption_fr: "", caption_en: "", link: "" };

export function GalleryEditor({ gallery, onChange }) {
  const v = gallery || { title_fr: "", title_en: "", overline_fr: "", overline_en: "", instagram_url: "", items: [] };
  const items = v.items || [];
  const set = (patch) => onChange({ ...v, ...patch });
  const upd = (i, patch) => set({ items: items.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) });
  const remove = (i) => set({ items: items.filter((_, idx) => idx !== i) });
  const move = (i, d) => { const a = [...items]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set({ items: a }); };

  return (
    <div className="space-y-4" data-testid="gallery-editor">
      <p className="text-xs text-ink-muted">
        Galerie d'images (max 8 affichées en grille). Idéal pour montrer vos créations.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><Label>Accroche FR</Label><Input value={v.overline_fr || ""} onChange={(e) => set({ overline_fr: e.target.value })} placeholder="Nos créations" /></div>
        <div><Label>Accroche EN</Label><Input value={v.overline_en || ""} onChange={(e) => set({ overline_en: e.target.value })} /></div>
        <div><Label>Titre FR</Label><Input value={v.title_fr || ""} onChange={(e) => set({ title_fr: e.target.value })} placeholder="Suivez-nous sur Instagram" /></div>
        <div><Label>Titre EN</Label><Input value={v.title_en || ""} onChange={(e) => set({ title_en: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label>URL Instagram (optionnel)</Label><Input value={v.instagram_url || ""} onChange={(e) => set({ instagram_url: e.target.value })} placeholder="https://instagram.com/..." /></div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Label>Images ({items.length}/8)</Label>
        {items.length < 8 && (
          <Button variant="outline" size="sm" className="rounded-none" onClick={() => set({ items: [...items, { ...EMPTY_GALLERY_ITEM }] })}>
            <Plus className="w-4 h-4 mr-1" /> Ajouter
          </Button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {items.map((it, i) => (
          <div key={i} className="border border-border bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-ink-muted">Image {i + 1}</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => move(i, -1)} className="p-1 hover:bg-secondary"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => move(i, 1)} className="p-1 hover:bg-secondary"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => remove(i)} className="p-1 text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <SingleMediaUploader compact value={it.image_url || ""} onChange={(x) => upd(i, { image_url: x })} label="image" />
            <div className="grid grid-cols-2 gap-2">
              <Input value={it.caption_fr || ""} onChange={(e) => upd(i, { caption_fr: e.target.value })} placeholder="Légende FR" className="h-8 text-xs" />
              <Input value={it.caption_en || ""} onChange={(e) => upd(i, { caption_en: e.target.value })} placeholder="Caption EN" className="h-8 text-xs" />
            </div>
            <Input value={it.link || ""} onChange={(e) => upd(i, { link: e.target.value })} placeholder="Lien (optionnel)" className="h-8 text-xs" />
          </div>
        ))}
      </div>
    </div>
  );
}