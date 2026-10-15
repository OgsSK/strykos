import React from "react";
import { useStore } from "@/context/StoreProvider";

export default function Steps({ steps }) {
  const { lang } = useStore();
  const items = steps?.items || [];
  if (!items.length) return null;

  const L = (o, k) => o?.[`${k}_${lang}`] || o?.[`${k}_fr`] || "";

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-12 sm:py-20" data-testid="steps-section">
      {(L(steps, "title") || L(steps, "subtitle")) && (
        <div className="text-center mb-10 sm:mb-14">
          {L(steps, "overline") && (
            <span className="text-[11px] sm:text-xs font-sans font-semibold tracking-[0.25em] text-brand uppercase mb-3 block">
              {L(steps, "overline")}
            </span>
          )}
          {L(steps, "title") && (
            <h2
              className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-ink mb-3"
              style={{ textTransform: "none" }}
            >
              {L(steps, "title")}
            </h2>
          )}
          {L(steps, "subtitle") && (
            <p className="font-sans text-ink-soft text-sm sm:text-base max-w-2xl mx-auto">
              {L(steps, "subtitle")}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
        {items.map((item, i) => (
          <div key={i} className="relative text-center" data-testid={`step-${i}`}>
            {/* Numéro dans un cercle */}
            <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-full bg-ink text-cream font-serif text-2xl mb-5">
              {String(i + 1).padStart(2, "0")}
            </div>
            {/* Trait pointillé entre les étapes (desktop) */}
            {i < items.length - 1 && (
              <div className="hidden sm:block absolute top-8 left-[calc(50%+40px)] right-[calc(-50%+40px)] h-[2px] bg-brand/20" />
            )}
            {L(item, "title") && (
              <h3 className="font-heading text-lg sm:text-xl font-semibold text-ink mb-2">
                {L(item, "title")}
              </h3>
            )}
            {L(item, "text") && (
              <p className="font-sans text-sm text-ink-soft leading-relaxed max-w-xs mx-auto">
                {L(item, "text")}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}