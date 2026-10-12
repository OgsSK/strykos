import React from "react";
import { useStore } from "@/context/StoreProvider";

/**
 * Affiche le nom de la marque avec la mise en forme officielle :
 * partie 1 en couleur normale, partie 2 en rouge (brand).
 *
 * Usage : <Brand /> ou <Brand size="lg" /> ou <Brand as="h1" />
 */
export default function Brand({ size = "md", className = "", as: Tag = "div" }) {
  const { brand } = useStore();
  const sizeClasses = {
    xs: "text-lg",
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-3xl",
    xl: "text-4xl",
    "2xl": "text-5xl",
  }[size] || "text-2xl";

  return (
    <Tag className={`font-heading font-extrabold tracking-tight ${sizeClasses} ${className}`} data-testid="brand">
      {brand.part1}<span className="text-brand">{brand.part2}</span>
    </Tag>
  );
}