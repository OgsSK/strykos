import React from "react";
import { Link } from "react-router-dom";
import ProductCard from "@/components/ProductCard";
import { ArrowRight } from "lucide-react";

export default function ProductGrid({ title, link, allLabel, products = [], limit = 4, testid }) {
  if (!products.length || !title) return null;

  return (
    <section data-testid={testid} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-12 sm:py-16">
      <div className="flex items-end justify-between gap-4 mb-6 sm:mb-8">
        <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-ink">
          {title}
        </h2>
        {link && allLabel && (
          <Link
            to={link}
            className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-ink hover:text-brand transition-colors"
          >
            {allLabel} <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      {/* ✅ 2 col mobile → 3 md → 4 lg */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5 lg:gap-6">
        {products.slice(0, limit).map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>

      {link && allLabel && (
        <div className="mt-6 text-center sm:hidden">
          <Link to={link} className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
            {allLabel} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </section>
  );
}