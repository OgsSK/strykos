import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { mediaSrc } from "@/lib/adminUtils";

function Media({ card }) {
  const ref = useRef();
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }, { threshold: 0.3 });
    io.observe(v);
    return () => io.disconnect();
  }, [card.video_url]);
  return (
    <>
      {card.image_url && <img src={mediaSrc(card.image_url)} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />}
      {card.video_url && <video ref={ref} src={mediaSrc(card.video_url)} poster={card.image_url ? mediaSrc(card.image_url) : undefined} muted loop playsInline preload="metadata"
        onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 w-full h-full object-cover" />}
    </>
  );
}

const Pill = ({ to, children, testid, dark = false }) => (
  <Link to={to} data-testid={testid}
    className={`inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold transition-colors ${dark ? "bg-ink text-white hover:bg-brand hover:text-white" : "bg-white text-ink hover:bg-ink hover:text-white"}`}>
    {children}
  </Link>
);

export default function StoryCards({ cards = [], testid = "story-cards" }) {
  const { lang } = useStore();
  const list = cards.filter((c) => c.image_url || c.video_url);
  if (!list.length) return null;
  const L = (c, k) => c[`${k}_${lang}`] || c[`${k}_fr`] || "";
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 bg-black" style={{ gap: 0 }} data-testid={testid}>
      {list.slice(0, 2).map((c, i) => (
        <div
          key={i}
          className={`relative group overflow-hidden bg-ink aspect-[3/4] text-white ${i === 1 ? "md:-ml-px" : ""}`}
          data-testid={`${testid}-${i}`}
        >
          <Media card={c} />
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 lg:p-10">
            {L(c, "overline") && <div className="text-xs sm:text-sm uppercase tracking-[0.15em] mb-2 opacity-90">{L(c, "overline")}</div>}
            <h3 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-extrabold uppercase tracking-tight mt-1 leading-tight mb-5">{L(c, "title")}</h3>
            <div className="flex flex-wrap gap-2">
              {c.cta_link && <Pill to={c.cta_link} testid={`${testid}-${i}-cta`}>{L(c, "cta") || (lang === "fr" ? "Acheter" : "Shop")}</Pill>}
              {c.cta2_link && <Pill to={c.cta2_link}>{L(c, "cta2") || (lang === "fr" ? "En savoir plus" : "Learn more")}</Pill>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}