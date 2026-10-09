import React, { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, X, GripVertical, Film } from "lucide-react";
import { uploadMedia, mediaSrc, BACKEND } from "@/lib/adminUtils";
import { apiError } from "@/lib/api";

/* Multi-image gallery editor with drag re-order + upload. value: array of URLs */
export function ImageGalleryUploader({ value = [], onChange, testid = "gallery" }) {
  const inputRef = useRef();
  const [progress, setProgress] = useState(null);
  const [urlInput, setUrlInput] = useState("");
  const dragIdx = useRef(null);

  const handleFiles = async (files) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return toast.error("Selectionnez des images");
    const added = [];
    for (let i = 0; i < list.length; i++) {
      try {
        setProgress({ i: i + 1, n: list.length, pct: 0 });
        const m = await uploadMedia(list[i], (pct) => setProgress({ i: i + 1, n: list.length, pct }));
        added.push(`${BACKEND}${m.url}`);
      } catch (e) { toast.error(apiError(e)); }
    }
    setProgress(null);
    if (added.length) { onChange([...value, ...added]); toast.success(`${added.length} image(s) ajoutee(s)`); }
  };

  const move = (from, to) => {
    if (from === to || from == null) return;
    const arr = [...value]; const [it] = arr.splice(from, 1); arr.splice(to, 0, it); onChange(arr);
  };

  return (
    <div data-testid={testid}>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {value.map((url, i) => (
          <div key={url + i} draggable onDragStart={() => (dragIdx.current = i)} onDragOver={(e) => e.preventDefault()}
            onDrop={() => { move(dragIdx.current, i); dragIdx.current = null; }}
            className="relative aspect-[4/5] bg-secondary border border-border group cursor-move">
            <img src={mediaSrc(url)} alt="" className="w-full h-full object-cover" />
            {i === 0 && <span className="absolute top-1 left-1 bg-ink text-white text-[10px] px-1.5 py-0.5 uppercase">Principale</span>}
            <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} data-testid={`${testid}-remove-${i}`}
              className="absolute top-1 right-1 bg-white/90 p-1 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
            <GripVertical className="absolute bottom-1 right-1 w-4 h-4 text-white drop-shadow opacity-60" />
          </div>
        ))}
        <button type="button" onClick={() => inputRef.current?.click()} data-testid={`${testid}-upload-btn`}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          className="aspect-[4/5] border-2 border-dashed border-border hover:border-brand flex flex-col items-center justify-center text-xs text-ink-muted gap-1 transition-colors">
          <Upload className="w-5 h-5" />
          {progress ? `${progress.i}/${progress.n} · ${progress.pct}%` : "Ajouter"}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} data-testid={`${testid}-file-input`} />
      <div className="flex gap-2 mt-2">
        <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="ou coller une URL d'image https://..."
          className="flex-1 border border-border h-9 px-2 text-sm" data-testid={`${testid}-url-input`} />
        <button type="button" onClick={() => { if (urlInput.trim()) { onChange([...value, urlInput.trim()]); setUrlInput(""); } }}
          className="h-9 px-3 border border-border text-sm hover:bg-secondary" data-testid={`${testid}-url-add`}>Ajouter l'URL</button>
      </div>
      <p className="text-[11px] text-ink-muted mt-1">Glissez pour reordonner. La premiere image est la vignette. JPG/PNG/WEBP, 15 Mo max.</p>
    </div>
  );
}

/* Single file uploader (image or video). value: URL string */
export function SingleMediaUploader({ value = "", onChange, accept = "image/*", kind = "image", label = "Fichier", testid = "single-media" }) {
  const inputRef = useRef();
  const [pct, setPct] = useState(null);
  const handle = async (file) => {
    if (!file) return;
    try {
      setPct(0);
      const m = await uploadMedia(file, setPct);
      onChange(`${BACKEND}${m.url}`);
      toast.success("Fichier televerse");
    } catch (e) { toast.error(apiError(e)); }
    setPct(null);
  };
  return (
    <div data-testid={testid}>
      <div className="flex items-start gap-3">
        <div className="w-28 h-20 bg-secondary border border-border flex items-center justify-center overflow-hidden shrink-0">
          {value ? (kind === "video" ? <video src={mediaSrc(value)} className="w-full h-full object-cover" muted /> : <img src={mediaSrc(value)} alt="" className="w-full h-full object-cover" />)
            : (kind === "video" ? <Film className="w-6 h-6 text-ink-muted" /> : <Upload className="w-6 h-6 text-ink-muted" />)}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} data-testid={`${testid}-upload-btn`}
              className="h-9 px-3 border border-border text-sm hover:bg-secondary">{pct != null ? `${pct}%` : `Televerser ${label.toLowerCase()}`}</button>
            {value && <button type="button" onClick={() => onChange("")} className="h-9 px-3 text-sm text-brand hover:underline" data-testid={`${testid}-clear`}>Retirer</button>}
          </div>
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="ou URL https://..." className="w-full border border-border h-9 px-2 text-sm" data-testid={`${testid}-url`} />
        </div>
      </div>
      <input ref={inputRef} type="file" accept={accept} hidden onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }} data-testid={`${testid}-file-input`} />
    </div>
  );
}
