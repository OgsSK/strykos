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

export function SectionsEditor({ sections, onChange }) {
  const keys = ["categories", "new_arrivals", "promotions", "best_sellers", "featured"];
  const upd = (k, patch) => onChange({ ...sections, [k]: { ...(sections?.[k] || {}), ...patch } });
  return (
    <div className="space-y-4" data-testid="sections-editor">
      <p className="text-xs text-ink-muted">Chaque section de l'accueil commence par une banniere video (ou image). Laissez vide pour un simple titre.</p>
      {keys.map((k) => {
        const v = sections?.[k] || {};
        return (
          <div key={k} className="border border-border p-4" data-testid={`section-editor-${k}`}>
            <div className="text-xs uppercase tracking-wider font-semibold mb-3">{SECTION_LABELS[k]}</div>
            <div className="grid md:grid-cols-2 gap-4">
              <div><Label>Video</Label><SingleMediaUploader value={v.video_url || ""} onChange={(u) => upd(k, { video_url: u })} accept="video/mp4,video/webm,video/quicktime" kind="video" label="une video" testid={`section-video-${k}`} /></div>
              <div><Label>Image (secours / poster)</Label><SingleMediaUploader value={v.image_url || ""} onChange={(u) => upd(k, { image_url: u })} label="une image" testid={`section-image-${k}`} /></div>
              <div><Label>Accroche FR</Label><Input value={v.tagline_fr || ""} onChange={(e) => upd(k, { tagline_fr: e.target.value })} /></div>
              <div><Label>Accroche EN</Label><Input value={v.tagline_en || ""} onChange={(e) => upd(k, { tagline_en: e.target.value })} /></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
