import React from "react";
import { Star } from "lucide-react";

export function Stars({ value = 0, size = "sm", count, onChange, testid = "stars" }) {
  const dims = { xs: "w-3 h-3", sm: "w-4 h-4", md: "w-5 h-5", lg: "w-7 h-7" }[size] || "w-4 h-4";
  return (
    <span className="inline-flex items-center gap-0.5" data-testid={testid}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" disabled={!onChange} onClick={() => onChange && onChange(i)} data-testid={onChange ? `${testid}-${i}` : undefined}
          className={`${onChange ? "cursor-pointer hover:scale-110 transition-transform" : "cursor-default"} disabled:cursor-default`} aria-label={`${i} stars`}>
          <Star className={`${dims} ${i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-ink-muted/40"}`} />
        </button>
      ))}
      {count != null && <span className="text-xs text-ink-muted ml-1">({count})</span>}
    </span>
  );
}
