import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";

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
      {card.image_url && <img src={card.image_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />}
      {card.video_url && <video ref={ref} src={card.video_url} poster={card.image_url || undefined} muted loop playsInline preload="metadata"
        onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 w-full h-full object-cover" />}
    </>
  );
}

const Pill = ({ to, children, testid }) => (
  <Link to={to} data-testid={testid} className="inline-flex items-center bg-white text-ink hover:bg-ink hover:text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-colors">{children}</Link>
);

/* Nike-style editorial cards: tall media, overline, headline, pill CTAs bottom-left. */
export default function StoryCards({ cards = [], testid = "story-cards" }) {
  const { lang } = useStore();
  const list = cards.filter((c) => c.image_url || c.video_url);
  if (!list.length) return null;
  const L = (c, k) => c[`${k}_${lang}`] || c[`${k}_fr`] || "";
  return (
    <div className={`grid gap-3 sm:gap-4 ${list.length > 1 ? "md:grid-cols-2" : ""}`} data-testid={testid}>
      {list.slice(0, 2).map((c, i) => (
        <div key={i} className="relative group overflow-hidden bg-ink aspect-[4/5] md:aspect-[1/0.95] text-white" data-testid={`${testid}-${i}`}>
          <Media card={c} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
            {L(c, "overline") && <div className="text-sm font-medium opacity-90">{L(c, "overline")}</div>}
            <h3 className="font-heading text-2xl sm:text-3xl font-bold mt-1 leading-tight">{L(c, "title")}</h3>
            <div className="flex flex-wrap gap-2 mt-4">
              {c.cta_link && <Pill to={c.cta_link} testid={`${testid}-${i}-cta`}>{L(c, "cta") || (lang === "fr" ? "Acheter" : "Shop")}</Pill>}
              {c.cta2_link && <Pill to={c.cta2_link}>{L(c, "cta2") || (lang === "fr" ? "En savoir plus" : "Learn more")}</Pill>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
