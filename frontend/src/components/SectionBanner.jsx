import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { mediaSrc } from "@/lib/adminUtils";

export default function SectionBanner({ media, title, link, testid }) {
  const { t, lang } = useStore();
  const ref = useRef();
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }, { threshold: 0.25 });
    io.observe(v);
    return () => io.disconnect();
  }, [media?.video_url]);
  const tagline = media?.[`tagline_${lang}`] || media?.tagline_fr || "";
  const hasMedia = media?.video_url || media?.image_url;

  return (
    <div className={`relative overflow-hidden ${hasMedia ? "h-[70vh] min-h-[420px]" : "h-auto"}`} data-testid={testid}>
      {media?.image_url && <img src={mediaSrc(media.image_url)} alt="" className="absolute inset-0 w-full h-full object-cover" />}
      {media?.video_url && <video ref={ref} src={mediaSrc(media.video_url)} poster={media.image_url ? mediaSrc(media.image_url) : undefined} muted loop playsInline preload="metadata" onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 w-full h-full object-cover" />}
      {hasMedia && <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />}

      <div className="relative h-full flex flex-col items-center justify-end pb-16 sm:pb-20 text-white text-center px-4">
        <div className="max-w-3xl">
          {tagline && hasMedia && <div className="text-xs sm:text-sm uppercase tracking-[0.2em] mb-3 opacity-90">{tagline}</div>}
          <h2 className="font-heading text-4xl sm:text-6xl lg:text-7xl font-extrabold uppercase tracking-tight leading-[0.95] mb-6">{title}</h2>
          {link && (
            <Link to={link} className="inline-flex items-center bg-white text-ink hover:bg-ink hover:text-white px-7 py-3 text-sm font-bold uppercase tracking-wide rounded-full transition-colors">
              {t("all")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}