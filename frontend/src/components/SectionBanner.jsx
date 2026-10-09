import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { ArrowRight } from "lucide-react";

/* Full-bleed video/image banner introducing a homepage section (Nike-style). */
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
    <div className={`relative overflow-hidden ${hasMedia ? "h-[260px] sm:h-[340px]" : ""}`} data-testid={testid}>
      {media?.image_url && <img src={media.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />}
      {media?.video_url && <video ref={ref} src={media.video_url} poster={media.image_url || undefined} muted loop playsInline preload="metadata" onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 w-full h-full object-cover" />}
      {hasMedia && <div className="absolute inset-0 bg-gradient-to-r from-ink/80 via-ink/40 to-transparent" />}
      <div className={`relative max-w-7xl mx-auto px-4 h-full flex ${hasMedia ? "flex-col justify-end pb-8 text-white" : "items-end justify-between py-10"}`}>
        <div className="flex items-end justify-between w-full gap-4">
          <div>
            {tagline && hasMedia && <div className="text-xs sm:text-sm uppercase tracking-[0.2em] text-brand font-semibold mb-2">{tagline}</div>}
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold uppercase tracking-tight leading-none">{title}</h2>
          </div>
          {link && (
            <Link to={link} className={`shrink-0 inline-flex items-center gap-1 text-sm font-bold uppercase tracking-wide px-5 py-2.5 transition-colors ${hasMedia ? "bg-white text-ink hover:bg-brand hover:text-white" : "text-brand hover:text-brand-dark"}`}>
              {t("all")} <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
