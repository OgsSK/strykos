import React from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { mediaSrc } from "@/lib/adminUtils";
import { ArrowRight } from "lucide-react";

export default function CtaBanner({ banner }) {
  const { lang } = useStore();
  if (!banner || (!banner.image_url && !banner.video_url && !banner.title_fr && !banner.title_en)) return null;

  const L = (k) => banner?.[`${k}_${lang}`] || banner?.[`${k}_fr`] || "";

  return (
    <section className="relative w-full overflow-hidden" data-testid="cta-banner">
      <div className="relative w-full aspect-[4/5] sm:aspect-[16/7] lg:aspect-[21/9]">
        {banner.image_url && (
          <img
            src={mediaSrc(banner.image_url)}
            alt={L("title")}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {banner.video_url && (
          <video
            src={mediaSrc(banner.video_url)}
            poster={banner.image_url ? mediaSrc(banner.image_url) : undefined}
            muted
            loop
            playsInline
            autoPlay
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/40 to-ink/20" />

        {/* Contenu */}
        <div className="relative h-full flex flex-col items-center justify-center text-center px-5 sm:px-8">
          {L("overline") && (
            <span className="text-[10px] sm:text-xs font-sans font-semibold tracking-[0.25em] text-cream/90 uppercase mb-3">
              {L("overline")}
            </span>
          )}
          {L("title") && (
            <h2
              className="font-serif text-3xl sm:text-5xl lg:text-6xl font-normal text-cream leading-tight mb-4 max-w-3xl"
              style={{ textTransform: "none" }}
            >
              {L("title")}
            </h2>
          )}
          {L("subtitle") && (
            <p className="font-sans text-sm sm:text-base text-cream/85 max-w-xl mb-6">
              {L("subtitle")}
            </p>
          )}
          {L("cta") && banner.cta_link && (
            <Link
              to={banner.cta_link}
              className="group inline-flex items-center gap-2 bg-cream text-ink px-6 sm:px-8 py-3 sm:py-4 rounded-full text-sm font-semibold hover:bg-brand hover:text-cream transition-all"
            >
              {L("cta")}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}