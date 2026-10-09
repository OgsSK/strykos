import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { swrGet, swrGetShared } from "@/lib/cache";
import ProductCard from "@/components/ProductCard";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SlidersHorizontal } from "lucide-react";

const SIZES = ["S", "M", "L", "XL", "XXL", "39", "40", "41", "42", "43", "44", "45"];

function FilterPanel({ brands, filters, setFilter }) {
  const { t } = useStore();
  return (
    <div className="space-y-6 text-sm" data-testid="filter-panel">
      <div>
        <h4 className="font-semibold uppercase text-xs tracking-wider mb-3">{t("brand")}</h4>
        <div className="space-y-2 max-h-48 overflow-auto">
          {brands.map((b) => (
            <label key={b.id} className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={filters.brand === b.slug} onCheckedChange={(c) => setFilter("brand", c ? b.slug : "")}
                data-testid={`filter-brand-${b.slug}`} />
              <span>{b.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <h4 className="font-semibold uppercase text-xs tracking-wider mb-3">{t("price")} (EUR)</h4>
        <div className="flex items-center gap-2">
          <Input type="number" placeholder="Min" value={filters.min_price} onChange={(e) => setFilter("min_price", e.target.value)} className="h-9" data-testid="filter-min-price" />
          <span>-</span>
          <Input type="number" placeholder="Max" value={filters.max_price} onChange={(e) => setFilter("max_price", e.target.value)} className="h-9" data-testid="filter-max-price" />
        </div>
      </div>
      <div>
        <h4 className="font-semibold uppercase text-xs tracking-wider mb-3">{t("size")}</h4>
        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <button key={s} onClick={() => setFilter("size", filters.size === s ? "" : s)}
              className={`px-3 py-1 border text-xs ${filters.size === s ? "bg-ink text-white border-ink" : "border-border hover:border-ink"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={filters.in_stock === "true"} onCheckedChange={(c) => setFilter("in_stock", c ? "true" : "")} data-testid="filter-in-stock" />
          <span>{t("inStock")}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={filters.on_sale === "true"} onCheckedChange={(c) => setFilter("on_sale", c ? "true" : "")} data-testid="filter-on-sale" />
          <span>{t("promotions")}</span>
        </label>
      </div>
    </div>
  );
}

export default function Catalog() {
  const { t, lang } = useStore();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const isSearch = location.pathname === "/search";
  const [brands, setBrands] = useState([]);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filters = useMemo(() => ({
    category: params.get("category") || "",
    brand: params.get("brand") || "",
    min_price: params.get("min_price") || "",
    max_price: params.get("max_price") || "",
    size: params.get("size") || "",
    in_stock: params.get("in_stock") || "",
    on_sale: params.get("on_sale") || "",
    is_new: params.get("is_new") || "",
    sort: params.get("sort") || "relevance",
    q: params.get("q") || "",
  }), [params]);

  const setFilter = (key, val) => {
    const next = new URLSearchParams(params);
    if (val) next.set(key, val); else next.delete(key);
    setParams(next);
  };

  useEffect(() => { swrGetShared("/brands", (d) => setBrands(d), { ttl: 10 * 60 * 1000 }).catch(() => {}); }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const qp = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v && k !== "q") qp.set(k, v); });
    if (isSearch && filters.q) qp.set("search", filters.q);
    qp.set("limit", "48");
    try {
      await swrGet(`/products?${qp.toString()}`, (data, stale) => { setProducts(data.products); setTotal(data.total); if (stale) setLoading(false); }, { ttl: 2 * 60 * 1000 });
    } catch { setProducts([]); setTotal(0); }
    setLoading(false);
  }, [filters, isSearch]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const title = isSearch ? `${t("search")}: "${filters.q}"`
    : filters.category ? t({ maillots: "jerseys", chaussures: "boots", vetements: "clothing", equipements: "equipment", accessoires: "accessories" }[filters.category] || "catalog")
    : filters.on_sale ? t("promotions") : filters.is_new ? t("newArrivals") : t("catalog");

  return (
    <div className="max-w-7xl mx-auto px-4 py-8" data-testid="catalog-page">
      <h1 className="font-heading text-3xl sm:text-4xl font-bold uppercase tracking-tight">{title}</h1>
      <div className="flex items-center justify-between mt-2 mb-6">
        <span className="text-sm text-ink-muted" data-testid="product-count">{total} {t("products")}</span>
        <div className="flex items-center gap-3">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button className="lg:hidden flex items-center gap-2 border border-border px-3 py-2 text-sm" data-testid="mobile-filter-btn">
                <SlidersHorizontal className="w-4 h-4" /> {t("filters")}
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 overflow-auto">
              <h3 className="font-heading font-bold text-lg mb-4 mt-2">{t("filters")}</h3>
              <FilterPanel brands={brands} filters={filters} setFilter={setFilter} />
            </SheetContent>
          </Sheet>
          <select value={filters.sort} onChange={(e) => setFilter("sort", e.target.value)}
            className="border border-border px-3 py-2 text-sm bg-white" data-testid="sort-select">
            <option value="relevance">{t("relevance")}</option>
            <option value="price_asc">{t("priceAsc")}</option>
            <option value="price_desc">{t("priceDesc")}</option>
            <option value="new">{t("newest")}</option>
            <option value="best_sellers">{t("bestSellers")}</option>
          </select>
        </div>
      </div>

      <div className="flex gap-8">
        <aside className="hidden lg:block w-56 shrink-0">
          <FilterPanel brands={brands} filters={filters} setFilter={setFilter} />
        </aside>
        <div className="flex-1">
          {loading ? (
            <div className="py-20 text-center text-ink-muted">{t("loading")}</div>
          ) : products.length === 0 ? (
            <div className="py-20 text-center text-ink-muted" data-testid="no-results">{t("noResults")}</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
              {products.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
