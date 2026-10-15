import React from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { mediaSrc } from "@/lib/adminUtils";
import { ArrowRight } from "lucide-react";

export default function StoryBlock({ story }) {
  const { lang } = useStore();
  if (!story || (!story.image_url && !story.title_fr && !story.title_en)) return null;

  const L = (k) => story?.[`${k}_${lang}`] || story?.[`${k}_fr`] || "";
  const imageRight = story.image_position === "right";

  return (
    <section className="bg-cream-dark py-12 sm:py-20" data-testid="story-block">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center ${imageRight ? "lg:[&>*:first-child]:order-2" : ""}`}>
          {/* Image */}
          <div className="relative">
            <div className="relative w-full aspect-[4/5] sm:aspect-[5/4] lg:aspect-[4/5] rounded-2xl overflow-hidden shadow-xl bg-cream">
              {story.image_url && (
                <img
                  src={mediaSrc(story.image_url)}
                  alt={L("title")}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
            </div>
            {/* Petit carré décoratif optionnel */}
            <div className="hidden lg:block absolute -bottom-6 -right-6 w-32 h-32 rounded-2xl bg-brand/20 blur-2xl pointer-events-none" />
          </div>

          {/* Texte */}
          <div className="text-center lg:text-left">
            {L("overline") && (
              <span className="text-[11px] sm:text-xs font-sans font-semibold tracking-[0.25em] text-brand uppercase mb-3 block">
                {L("overline")}
              </span>
            )}
            {L("title") && (
              <h2
                className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-ink leading-tight mb-5"
                style={{ textTransform: "none" }}
              >
                {L("title")}
              </h2>
            )}
            {L("text") && (
              <p className="font-sans text-ink-soft text-sm sm:text-base leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0 whitespace-pre-line">
                {L("text")}
              </p>
            )}
            {L("cta") && story.cta_link && (
              <Link
                to={story.cta_link}
                className="group inline-flex items-center gap-2 bg-ink text-cream px-6 sm:px-7 py-3 rounded-full text-sm font-semibold hover:bg-brand transition-all"
              >
                {L("cta")}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}