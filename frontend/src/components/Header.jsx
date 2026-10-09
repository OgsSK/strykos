import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api } from "@/lib/api";
import { Search, Heart, ShoppingBag, User, Menu, X, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";

const NAV = [
  { key: "jerseys", cat: "maillots" },
  { key: "boots", cat: "chaussures" },
  { key: "clothing", cat: "vetements" },
  { key: "equipment", cat: "equipements" },
  { key: "accessories", cat: "accessoires" },
];

function Switcher({ value, options, onChange, testid }) {
  return (
    <select
      data-testid={testid}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-transparent text-xs font-semibold uppercase tracking-wider outline-none cursor-pointer"
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function Header() {
  const { t, lang, changeLang, currency, setCurrency, cartCount, wishlist, user, settings } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState([]);
  const nav = useNavigate();

  const infoMsgs = settings?.info_bar?.enabled
    ? (lang === "fr" ? settings.info_bar.messages_fr : settings.info_bar.messages_en) || [] : [];
  const [infoIdx, setInfoIdx] = useState(0);
  useEffect(() => { if (infoMsgs.length < 2) return; const id = setInterval(() => setInfoIdx((i) => i + 1), 4000); return () => clearInterval(id); }, [infoMsgs.length]);

  const doSearch = (e) => {
    e.preventDefault();
    if (q.trim()) { nav(`/search?q=${encodeURIComponent(q)}`); setSuggest([]); setMobileOpen(false); }
  };
  const onSearchChange = async (val) => {
    setQ(val);
    if (val.length >= 2) {
      try { const { data } = await api.get(`/products/search-suggest?q=${encodeURIComponent(val)}`); setSuggest(data.products); }
      catch { setSuggest([]); }
    } else setSuggest([]);
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-border">
      {infoMsgs.length > 0 && (
        <div className="bg-ink text-white text-xs py-2 overflow-hidden" data-testid="info-bar">
          <div className="hidden sm:flex max-w-7xl mx-auto px-4 items-center justify-center gap-6 whitespace-nowrap">
            {infoMsgs.map((m, i) => <span key={i} className="tracking-wide">{m}</span>)}
          </div>
          <div className="sm:hidden px-4 text-center truncate tracking-wide" key={infoIdx} data-testid="info-bar-mobile">{infoMsgs[infoIdx % infoMsgs.length]}</div>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16 gap-4">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setMobileOpen(true)} data-testid="mobile-menu-btn" aria-label="menu">
              <Menu className="w-6 h-6" />
            </button>
            <Link to="/" data-testid="logo-link" className="font-heading font-extrabold text-2xl tracking-tight">
              STRY<span className="text-brand">KOS</span>
            </Link>
          </div>

          <form onSubmit={doSearch} className="hidden md:flex flex-1 max-w-md relative">
            <Input
              data-testid="search-input"
              value={q}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pr-10 rounded-sm border-ink/20"
            />
            <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-label="search">
              <Search className="w-4 h-4" />
            </button>
            {suggest.length > 0 && (
              <div className="absolute top-11 left-0 right-0 bg-white border border-border shadow-md z-50" data-testid="search-suggestions">
                {suggest.map((p) => (
                  <Link key={p.id} to={`/product/${p.slug}`} onClick={() => { setSuggest([]); setQ(""); }}
                    className="flex items-center gap-3 p-2 hover:bg-secondary">
                    <img src={p.images[0]} alt="" className="w-10 h-12 object-cover" />
                    <span className="text-sm">{lang === "fr" ? p.name_fr : p.name_en}</span>
                  </Link>
                ))}
              </div>
            )}
          </form>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 border-r border-border pr-4">
              <Switcher value={lang.toUpperCase()} options={["FR", "EN"]} onChange={(v) => changeLang(v.toLowerCase())} testid="lang-switcher" />
              <Switcher value={currency} options={["EUR", "USD", "XOF"]} onChange={setCurrency} testid="currency-switcher" />
            </div>
            <Link to={user ? "/account" : "/login"} data-testid="account-link" aria-label="account"><User className="w-5 h-5" /></Link>
            <Link to="/wishlist" data-testid="wishlist-link" className="relative" aria-label="wishlist">
              <Heart className="w-5 h-5" />
              {wishlist.length > 0 && <span className="absolute -top-2 -right-2 bg-brand text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{wishlist.length}</span>}
            </Link>
            <Link to="/cart" data-testid="cart-link" className="relative" aria-label="cart">
              <ShoppingBag className="w-5 h-5" />
              {cartCount > 0 && <span className="absolute -top-2 -right-2 bg-brand text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center" data-testid="cart-count">{cartCount}</span>}
            </Link>
          </div>
        </div>

        <nav className="hidden lg:flex items-center gap-7 h-11 text-sm font-semibold uppercase tracking-wide">
          {NAV.map((n) => (
            <Link key={n.key} to={`/catalog?category=${n.cat}`} data-testid={`nav-${n.cat}`}
              className="hover:text-brand transition-colors">{t(n.key)}</Link>
          ))}
          <Link to="/catalog?is_new=true" className="hover:text-brand transition-colors">{t("newArrivals")}</Link>
          <Link to="/catalog?on_sale=true" className="text-brand hover:text-brand-dark transition-colors" data-testid="nav-promotions">{t("promotions")}</Link>
          <Link to="/brands" className="hover:text-brand transition-colors" data-testid="nav-brands">{t("brands")}</Link>
        </nav>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-80 p-0">
          <div className="p-4 border-b flex items-center justify-between">
            <span className="font-heading font-extrabold text-xl">STRY<span className="text-brand">KOS</span></span>
          </div>
          <form onSubmit={doSearch} className="p-4 border-b">
            <Input value={q} onChange={(e) => onSearchChange(e.target.value)} placeholder={t("searchPlaceholder")} data-testid="mobile-search-input" />
          </form>
          <div className="flex flex-col">
            {NAV.map((n) => (
              <Link key={n.key} to={`/catalog?category=${n.cat}`} onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between px-4 py-3 border-b text-sm font-semibold uppercase">
                {t(n.key)} <ChevronRight className="w-4 h-4" />
              </Link>
            ))}
            <Link to="/catalog?on_sale=true" onClick={() => setMobileOpen(false)} className="px-4 py-3 border-b text-sm font-semibold uppercase text-brand">{t("promotions")}</Link>
            <Link to="/brands" onClick={() => setMobileOpen(false)} className="px-4 py-3 border-b text-sm font-semibold uppercase">{t("brands")}</Link>
          </div>
          <div className="p-4 flex gap-4">
            <Switcher value={lang.toUpperCase()} options={["FR", "EN"]} onChange={(v) => changeLang(v.toLowerCase())} testid="mobile-lang" />
            <Switcher value={currency} options={["EUR", "USD", "XOF"]} onChange={setCurrency} testid="mobile-currency" />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
