import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api } from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";

export default function Wishlist() {
  const { t, user, wishlist } = useStore();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    api.get("/wishlist").then((r) => setProducts(r.data.products)).catch(() => {}).finally(() => setLoading(false));
  }, [user, wishlist.length]);

  if (!user) return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center">
      <Heart className="w-14 h-14 mx-auto text-ink-muted mb-4" />
      <h1 className="font-heading text-2xl font-bold uppercase">{t("wishlist")}</h1>
      <Link to="/login"><Button className="mt-6 bg-brand hover:bg-brand-dark rounded-none uppercase">{t("login")}</Button></Link>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8" data-testid="wishlist-page">
      <h1 className="font-heading text-3xl font-bold uppercase tracking-tight mb-8">{t("wishlist")}</h1>
      {loading ? <div className="py-20 text-center text-ink-muted">{t("loading")}</div>
        : products.length === 0 ? <div className="py-20 text-center text-ink-muted">{t("noResults")}</div>
          : <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">{products.map((p) => <ProductCard key={p.id} product={p} />)}</div>}
    </div>
  );
}
