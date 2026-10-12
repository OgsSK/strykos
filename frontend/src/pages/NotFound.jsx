import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useStore } from "@/context/StoreProvider";
import Brand from "@/components/Brand";

export default function NotFound() {
  const { t, brand } = useStore();
  return (
    <div className="max-w-xl mx-auto px-4 py-28 text-center" data-testid="not-found">
      <div className="font-heading text-7xl font-extrabold text-brand">404</div>
      <h1 className="font-heading text-2xl font-bold uppercase mt-4">Page introuvable</h1>
      <p className="text-ink-muted mt-2">{t("noResults")}</p>
      <Link to="/">
        <Button className="mt-6 bg-ink hover:bg-ink/90 rounded-none uppercase">
          {brand.part1}{brand.part2}
        </Button>
      </Link>
    </div>
  );
}