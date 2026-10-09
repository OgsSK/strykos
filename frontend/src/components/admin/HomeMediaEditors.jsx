import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SingleMediaUploader } from "@/components/admin/MediaUploader";
import { Plus, Trash2, ArrowUp, ArrowDown, Film } from "lucide-react";

const EMPTY_SLIDE = { video_url: "", image_url: "", title_fr: "", title_en: "", subtitle_fr: "", subtitle_en: "", cta_fr: "Decouvrir", cta_en: "Shop now", cta_link: "/catalog" };
const SECTION_LABELS = { categories: "Achetez par categorie", new_arrivals: "Nouveautes", promotions: "Promotions", best_sellers: "Meilleures ventes", featured: "Selection STRYKOS" };

export function HeroSlidesEditor({ hero, onChange }) {
  const slides = hero?.slides || [];
  const set = (patch) => onChange({ ...hero, ...patch });
  const upd = (i, patch) => set({ slides: slides.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const move = (i, d) => { const arr = [...slides]; const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; set({ slides: arr }); };
  return (
    <div className="space-y-4" data-testid="hero-slides-editor">
      <div className="flex items-end gap-4">
        <div className="w-48"><Label>Duree par slide (secondes)</Label><Input type="number" min={3} max={30} value={Math.round((hero?.interval_ms || 7000) / 1000)} onChange={(e) => set({ interval_ms: (parseInt(e.target.value) || 7) * 1000 })} data-testid="hero-interval" /></div>
        <Button variant="outline" className="rounded-none" onClick={() => set({ slides: [...slides, { ...EMPTY_SLIDE }] })} data-testid="add-slide-btn"><Plus className="w-4 h-4 mr-1" /> Ajouter un slide</Button>
      </div>
      {slides.map((s, i) => (
        <div key={i} className="border border-border p-4 bg-secondary/40" data-testid={`hero-slide-${i}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider font-semibold inline-flex items-center gap-2"><Film className="w-4 h-4 text-brand" /> Slide {i + 1}</span>
            <div className="flex gap-1">
              <button onClick={() => move(i, -1)} className="p-1 hover:bg-white"><ArrowUp className="w-4 h-4" /></button>
              <button onClick={() => move(i, 1)} className="p-1 hover:bg-white"><ArrowDown className="w-4 h-4" /></button>
              <button onClick={() => set({ slides: slides.filter((_, idx) => idx !== i) })} className="p-1 text-red-600 hover:bg-white" data-testid={`remove-slide-${i}`}><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div><Label>Video (mp4/webm)</Label><SingleMediaUploader value={s.video_url} onChange={(v) => upd(i, { video_url: v })} accept="video/mp4,video/webm,video/quicktime" kind="video" label="une video" testid={`slide-video-${i}`} /></div>
            <div><Label>Image de secours / poster</Label><SingleMediaUploader value={s.image_url} onChange={(v) => upd(i, { image_url: v })} label="une image" testid={`slide-image-${i}`} /></div>
            <div><Label>Titre FR</Label><Input value={s.title_fr} onChange={(e) => upd(i, { title_fr: e.target.value })} data-testid={`slide-title-fr-${i}`} /></div>
            <div><Label>Titre EN</Label><Input value={s.title_en} onChange={(e) => upd(i, { title_en: e.target.value })} /></div>
            <div><Label>Sous-titre FR</Label><Textarea rows={2} value={s.subtitle_fr} onChange={(e) => upd(i, { subtitle_fr: e.target.value })} /></div>
            <div><Label>Sous-titre EN</Label><Textarea rows={2} value={s.subtitle_en} onChange={(e) => upd(i, { subtitle_en: e.target.value })} /></div>
            <div><Label>Bouton FR</Label><Input value={s.cta_fr} onChange={(e) => upd(i, { cta_fr: e.target.value })} /></div>
            <div><Label>Bouton EN</Label><Input value={s.cta_en} onChange={(e) => upd(i, { cta_en: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Lien du bouton</Label><Input value={s.cta_link} onChange={(e) => upd(i, { cta_link: e.target.value })} placeholder="/catalog?category=maillots" /></div>
          </div>
        </div>
      ))}
      {slides.length === 0 && <p className="text-sm text-amber-600">Aucun slide : la banniere sera masquee.</p>}
    </div>
  );
}

const EMPTY_CARD = { image_url: "", video_url: "", overline_fr: "", overline_en: "", title_fr: "", title_en: "", cta_fr: "Acheter", cta_en: "Shop", cta_link: "/catalog", cta2_fr: "", cta2_en: "", cta2_link: "" };

function CardEditor({ card, onChange, onRemove, testid }) {
  const u = (patch) => onChange({ ...card, ...patch });
  return (
    <div className="border border-border p-3 bg-white" data-testid={testid}>
      <div className="flex justify-between items-center mb-2"><span className="text-[11px] uppercase tracking-wider text-ink-muted">Carte</span><button onClick={onRemove} className="text-red-600 p-1"><Trash2 className="w-4 h-4" /></button></div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><Label>Image</Label><SingleMediaUploader value={card.image_url || ""} onChange={(v) => u({ image_url: v })} label="une image" testid={`${testid}-image`} /></div>
        <div><Label>Video (optionnel)</Label><SingleMediaUploader value={card.video_url || ""} onChange={(v) => u({ video_url: v })} accept="video/mp4,video/webm,video/quicktime" kind="video" label="une video" testid={`${testid}-video`} /></div>
        <div><Label>Surtitre FR</Label><Input value={card.overline_fr || ""} onChange={(e) => u({ overline_fr: e.target.value })} placeholder="Nouvelle collection" /></div>
        <div><Label>Surtitre EN</Label><Input value={card.overline_en || ""} onChange={(e) => u({ overline_en: e.target.value })} /></div>
        <div><Label>Titre FR</Label><Input value={card.title_fr || ""} onChange={(e) => u({ title_fr: e.target.value })} placeholder="Impossible a arreter" data-testid={`${testid}-title-fr`} /></div>
        <div><Label>Titre EN</Label><Input value={card.title_en || ""} onChange={(e) => u({ title_en: e.target.value })} /></div>
        <div><Label>Bouton 1 FR / EN</Label><div className="flex gap-1"><Input value={card.cta_fr || ""} onChange={(e) => u({ cta_fr: e.target.value })} /><Input value={card.cta_en || ""} onChange={(e) => u({ cta_en: e.target.value })} /></div></div>
        <div><Label>Lien bouton 1</Label><Input value={card.cta_link || ""} onChange={(e) => u({ cta_link: e.target.value })} placeholder="/catalog?is_new=true" /></div>
        <div><Label>Bouton 2 FR / EN (optionnel)</Label><div className="flex gap-1"><Input value={card.cta2_fr || ""} onChange={(e) => u({ cta2_fr: e.target.value })} placeholder="En savoir plus" /><Input value={card.cta2_en || ""} onChange={(e) => u({ cta2_en: e.target.value })} placeholder="Learn more" /></div></div>
        <div><Label>Lien bouton 2</Label><Input value={card.cta2_link || ""} onChange={(e) => u({ cta2_link: e.target.value })} placeholder="/page/about" /></div>
      </div>
    </div>
  );
}

export function SectionsEditor({ sections, onChange }) {
  const keys = ["categories", "new_arrivals", "promotions", "best_sellers", "featured"];
  const upd = (k, patch) => onChange({ ...sections, [k]: { ...(sections?.[k] || {}), ...patch } });
  return (
    <div className="space-y-4" data-testid="sections-editor">
      <p className="text-xs text-ink-muted">« Achetez par categorie » garde sa banniere video plein ecran. Les autres sections affichent jusqu'a 2 cartes editoriales (style Nike : image ou video, surtitre, titre, boutons) au-dessus des produits. Sans carte, seule la ligne de titre apparait.</p>
      {keys.map((k) => {
        const v = sections?.[k] || {};
        const cards = v.cards || [];
        const isBanner = k === "categories";
        return (
          <div key={k} className="border border-border p-4 bg-secondary/30" data-testid={`section-editor-${k}`}>
            <div className="text-xs uppercase tracking-wider font-semibold mb-3">{SECTION_LABELS[k]}</div>
            {isBanner ? (
              <div className="grid md:grid-cols-2 gap-4">
                <div><Label>Video</Label><SingleMediaUploader value={v.video_url || ""} onChange={(u) => upd(k, { video_url: u })} accept="video/mp4,video/webm,video/quicktime" kind="video" label="une video" testid={`section-video-${k}`} /></div>
                <div><Label>Image (secours / poster)</Label><SingleMediaUploader value={v.image_url || ""} onChange={(u) => upd(k, { image_url: u })} label="une image" testid={`section-image-${k}`} /></div>
                <div><Label>Accroche FR</Label><Input value={v.tagline_fr || ""} onChange={(e) => upd(k, { tagline_fr: e.target.value })} /></div>
                <div><Label>Accroche EN</Label><Input value={v.tagline_en || ""} onChange={(e) => upd(k, { tagline_en: e.target.value })} /></div>
              </div>
            ) : (
              <div className="space-y-3">
                {cards.map((c, i) => <CardEditor key={i} card={c} testid={`section-card-${k}-${i}`} onChange={(nc) => upd(k, { cards: cards.map((x, idx) => (idx === i ? nc : x)) })} onRemove={() => upd(k, { cards: cards.filter((_, idx) => idx !== i) })} />)}
                {cards.length < 2 && <Button variant="outline" size="sm" className="rounded-none" onClick={() => upd(k, { cards: [...cards, { ...EMPTY_CARD }] })} data-testid={`add-card-${k}`}><Plus className="w-4 h-4 mr-1" /> Ajouter une carte</Button>}
              </div>
            )}
          </div>
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
    <div className="space-y-5" data-testid="icons-editor">
      <p className="text-xs text-ink-muted">Section « essentiels » façon Nike : grand titre centré, vignettes rondes (jusqu'à 16, 8 par ligne) puis 4 colonnes de liens.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><Label>Titre FR</Label><Input value={v.title_fr || ""} onChange={(e) => set({ title_fr: e.target.value })} data-testid="icons-title-fr" /></div>
        <div><Label>Titre EN</Label><Input value={v.title_en || ""} onChange={(e) => set({ title_en: e.target.value })} /></div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2"><Label>Vignettes ({items.length}/16)</Label>{items.length < 16 && <Button variant="outline" size="sm" className="rounded-none" onClick={() => set({ items: [...items, { ...EMPTY_ITEM }] })} data-testid="add-icon-item"><Plus className="w-4 h-4 mr-1" /> Vignette</Button>}</div>
        <div className="grid md:grid-cols-2 gap-2">
          {items.map((it, i) => (
            <div key={i} className="border border-border bg-white p-2 flex gap-2 items-start" data-testid={`icon-item-${i}`}>
              <div className="w-24 shrink-0"><SingleMediaUploader value={it.image_url || ""} onChange={(u) => updItem(i, { image_url: u })} label="image" testid={`icon-image-${i}`} /></div>
              <div className="flex-1 grid grid-cols-2 gap-1">
                <Input value={it.label_fr || ""} onChange={(e) => updItem(i, { label_fr: e.target.value })} placeholder="Libelle FR" className="h-8 text-xs" />
                <Input value={it.label_en || ""} onChange={(e) => updItem(i, { label_en: e.target.value })} placeholder="Label EN" className="h-8 text-xs" />
                <Input value={it.link || ""} onChange={(e) => updItem(i, { link: e.target.value })} placeholder="/catalog?category=..." className="h-8 text-xs col-span-2" />
              </div>
              <div className="flex flex-col"><button onClick={() => moveItem(i, -1)} className="p-0.5"><ArrowUp className="w-3.5 h-3.5" /></button><button onClick={() => moveItem(i, 1)} className="p-0.5"><ArrowDown className="w-3.5 h-3.5" /></button><button onClick={() => set({ items: items.filter((_, idx) => idx !== i) })} className="p-0.5 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button></div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2"><Label>Colonnes de liens ({columns.length}/4)</Label>{columns.length < 4 && <Button variant="outline" size="sm" className="rounded-none" onClick={() => set({ columns: [...columns, { ...EMPTY_COL }] })}><Plus className="w-4 h-4 mr-1" /> Colonne</Button>}</div>
        <div className="grid md:grid-cols-2 gap-3">
          {columns.map((col, i) => (
            <div key={i} className="border border-border bg-white p-3 space-y-2" data-testid={`icon-column-${i}`}>
              <div className="flex gap-1"><Input value={col.title_fr || ""} onChange={(e) => updCol(i, { title_fr: e.target.value })} placeholder="Titre FR" className="h-8 text-xs" /><Input value={col.title_en || ""} onChange={(e) => updCol(i, { title_en: e.target.value })} placeholder="Title EN" className="h-8 text-xs" /><button onClick={() => set({ columns: columns.filter((_, idx) => idx !== i) })} className="text-red-600 px-1"><Trash2 className="w-4 h-4" /></button></div>
              {(col.links || []).map((lk, j) => (
                <div key={j} className="flex gap-1">
                  <Input value={lk.label_fr || ""} onChange={(e) => updCol(i, { links: col.links.map((x, idx) => (idx === j ? { ...x, label_fr: e.target.value } : x)) })} placeholder="Lien FR" className="h-8 text-xs" />
                  <Input value={lk.label_en || ""} onChange={(e) => updCol(i, { links: col.links.map((x, idx) => (idx === j ? { ...x, label_en: e.target.value } : x)) })} placeholder="Link EN" className="h-8 text-xs" />
                  <Input value={lk.link || ""} onChange={(e) => updCol(i, { links: col.links.map((x, idx) => (idx === j ? { ...x, link: e.target.value } : x)) })} placeholder="/catalog" className="h-8 text-xs" />
                  <button onClick={() => updCol(i, { links: col.links.filter((_, idx) => idx !== j) })} className="text-red-600 px-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {(col.links || []).length < 6 && <button onClick={() => updCol(i, { links: [...(col.links || []), { label_fr: "", label_en: "", link: "/catalog" }] })} className="text-xs text-brand font-semibold">+ lien</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
