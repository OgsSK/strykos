import React, { useRef, useState } from "react";
import { api } from "@/lib/api";
import { mediaSrc } from "@/lib/adminUtils";
import { toast } from "sonner";
import { X, Upload, Image as ImageIcon, Film, Loader2 } from "lucide-react";

/**
 * Upload de médias (photos + vidéos) pour les réclamations.
 * - Max configurables via props
 * - Upload vers /media/upload (auth requis)
 * - Retourne via onChange : [{ type: "image"|"video", url: "/api/media/..." }]
 * - ⭐ NOUVEAU : requestedTypes = ["photo","video"] filtre l'UI
 */
export default function ClaimMediaUploader({
  value = [],
  onChange,
  maxPhotos = 3,
  maxVideos = 1,
  maxPhotoMb = 5,
  maxVideoMb = 50,   // ⭐ 20 → 50
  requestedTypes = ["photo", "video"],   // ⭐ NOUVEAU
  disabled = false,
}) {
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const [busy, setBusy] = useState(null); // "photo" | "video" | null

  // ⭐ NOUVEAU : filtre selon ce que l'admin a demandé
  const allowPhoto = requestedTypes.includes("photo");
  const allowVideo = requestedTypes.includes("video");

  const photos = value.filter((m) => m.type === "image");
  const videos = value.filter((m) => m.type === "video");

  const upload = async (file, type) => {
    const isImage = type === "image";
    const limitMb = isImage ? maxPhotoMb : maxVideoMb;
    const limitBytes = limitMb * 1024 * 1024;

    if (file.size > limitBytes) {
      toast.error(`Fichier trop lourd (max ${limitMb} Mo)`);
      return;
    }

    setBusy(type);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("purpose", "claim");
      const { data } = await api.post("/media/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data?.url) {
        onChange([...value, { type: data.type || type, url: data.url }]);
        toast.success(isImage ? "Photo ajoutée" : "Vidéo ajoutée");
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload impossible");
    }
    setBusy(null);
  };

  const handleFiles = async (files, type) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    for (const file of list) {
      const currentCount = type === "image" ? photos.length : videos.length;
      const max = type === "image" ? maxPhotos : maxVideos;
      if (currentCount >= max) {
        toast.error(`Limite atteinte (${max})`);
        break;
      }
      await upload(file, type);
    }
  };

  const remove = (idx) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-4">
      {/* PHOTOS — affiché uniquement si l'admin a demandé des photos */}
      {allowPhoto && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              📸 Photos ({photos.length}/{maxPhotos})
            </span>
            {photos.length < maxPhotos && (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={disabled || busy === "photo"}
                className="text-xs text-brand font-semibold hover:underline inline-flex items-center gap-1 disabled:opacity-50"
              >
                {busy === "photo" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                Ajouter
              </button>
            )}
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files, "image")}
          />
          <div className="grid grid-cols-4 gap-2">
            {photos.map((m, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-secondary border border-border">
                <img src={mediaSrc(m.url)} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => remove(value.indexOf(m))}
                  className="absolute top-1 right-1 w-5 h-5 bg-white/90 rounded-full flex items-center justify-center hover:bg-white"
                >
                  <X className="w-3 h-3 text-ink" />
                </button>
              </div>
            ))}
            {photos.length < maxPhotos && (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={disabled || busy === "photo"}
                className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-brand flex flex-col items-center justify-center gap-1 text-ink-muted hover:text-brand transition-colors disabled:opacity-50"
              >
                {busy === "photo" ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <ImageIcon className="w-5 h-5" />
                    <span className="text-[9px] uppercase tracking-wider">Photo</span>
                  </>
                )}
              </button>
            )}
          </div>
          <p className="text-[10px] text-ink-muted mt-1">
            JPG/PNG/WEBP/HEIC · max {maxPhotoMb} Mo par photo
          </p>
        </div>
      )}

      {/* VIDÉO — affiché uniquement si l'admin a demandé une vidéo ET si maxVideos > 0 */}
      {allowVideo && maxVideos > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              🎥 Vidéo ({videos.length}/{maxVideos})
            </span>
            {videos.length < maxVideos && (
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={disabled || busy === "video"}
                className="text-xs text-brand font-semibold hover:underline inline-flex items-center gap-1 disabled:opacity-50"
              >
                {busy === "video" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                Ajouter
              </button>
            )}
          </div>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files, "video")}
          />
          <div className="grid grid-cols-2 gap-2">
            {videos.map((m, i) => (
              <div key={i} className="relative aspect-video rounded-lg overflow-hidden bg-black border border-border">
                <video src={mediaSrc(m.url)} controls className="w-full h-full object-contain" />
                <button
                  type="button"
                  onClick={() => remove(value.indexOf(m))}
                  className="absolute top-1 right-1 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center hover:bg-white z-10"
                >
                  <X className="w-3.5 h-3.5 text-ink" />
                </button>
              </div>
            ))}
            {videos.length < maxVideos && (
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={disabled || busy === "video"}
                className="aspect-video rounded-lg border-2 border-dashed border-border hover:border-brand flex flex-col items-center justify-center gap-1 text-ink-muted hover:text-brand transition-colors disabled:opacity-50"
              >
                {busy === "video" ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <Film className="w-6 h-6" />
                    <span className="text-[10px] uppercase tracking-wider">Vidéo</span>
                  </>
                )}
              </button>
            )}
          </div>
          <p className="text-[10px] text-ink-muted mt-1">
            MP4/MOV/WEBM · max {maxVideoMb} Mo par vidéo
          </p>
        </div>
      )}
    </div>
  );
}