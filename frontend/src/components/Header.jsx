import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api } from "@/lib/api";
import { Search, Heart, ShoppingBag, User, Menu, X, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import Brand from "@/components/Brand";
import { mediaSrc } from "@/lib/adminUtils";

const NAV = [
  { key: "newArrivals", to: "/catalog?is_new=true" },
  { key: "jerseys", to: "/catalog?category=maillots" },
  { key: "boots", to: "/catalog?category=chaussures" },
  { key: "clothing", to: "/catalog?category=vetements" },
  { key: "equipment", to: "/catalog?category=equipements" },
  { key: "accessories", to: "/catalog?category=accessoires" },
  { key: "promotions", to: "/catalog?on_sale=true" },
  { key: "brands", to: "/brands" },
];

function Switcher({ value, options, onChange, testid }) {
  return (
    <select
      data-testid={testid}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-transparent text-xs font-medium uppercase tracking-wider outline-none cursor-pointer"
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
      {/* Barre d'info (fine, en haut) */}
      {infoMsgs.length > 0 && (
        <div className="bg-ink text-white text-xs py-2 overflow-hidden" data-testid="info-bar">
          <div className="hidden sm:flex max-w-7xl mx-auto px-4 items-center justify-center gap-6 whitespace-nowrap">
            {infoMsgs.map((m, i) => <span key={i} className="tracking-wide">{m}</span>)}
          </div>
          <div className="sm:hidden px-4 text-center truncate tracking-wide" key={infoIdx} data-testid="info-bar-mobile">{infoMsgs[infoIdx % infoMsgs.length]}</div>
        </div>
      )}

      {/* Barre principale (logo | nav | actions) */}
      <div className="max-w-[1800px] mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between h-14 lg:h-16 gap-4">

          {/* Zone gauche : burger (mobile) + logo */}
          <div className="flex items-center gap-3 shrink-0">
            <button className="lg:hidden" onClick={() => setMobileOpen(true)} data-testid="mobile-menu-btn" aria-label="menu">
              <Menu className="w-6 h-6" />
            </button>
            <Link to="/" data-testid="logo-link" className="shrink-0">
              <Brand />
            </Link>
          </div>

          {/* Zone centre : nav horizontale (desktop) */}
          <nav className="hidden lg:flex items-center gap-6 xl:gap-8 text-[13px] xl:text-sm font-medium">
            {NAV.map((n) => (
              <Link
                key={n.key}
                to={n.to}
                data-testid={`nav-${n.key}`}
                className={`relative py-2 transition-colors ${n.key === "promotions" ? "text-brand hover:text-brand-dark" : "hover:text-brand"}`}
              >
                {t(n.key)}
              </Link>
            ))}
          </nav>

          {/* Zone droite : recherche + switchers + icônes */}
          <div className="flex items-center gap-3 lg:gap-4 shrink-0">

            {/* Recherche desktop compacte */}
            <form onSubmit={doSearch} className="hidden md:flex relative">
              <div className="relative">
                <Input
                  data-testid="search-input"
                  value={q}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="w-44 lg:w-56 xl:w-64 h-9 pr-9 rounded-full bg-secondary border-transparent focus-visible:ring-1 focus-visible:ring-ink/20 text-sm"
                />
                <button type="submit" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink" aria-label="search">
                  <Search className="w-4 h-4" />
                </button>
                {suggest.length > 0 && (
                  <div className="absolute top-11 right-0 w-80 bg-white border border-border shadow-lg z-50" data-testid="search-suggestions">
                    {suggest.map((p) => (
                      <Link key={p.id} to={`/product/${p.slug}`} onClick={() => { setSuggest([]); setQ(""); }}
                        className="flex items-center gap-3 p-2 hover:bg-secondary">
                        <img src={mediaSrc(p.images[0])} alt="" className="w-10 h-12 object-cover" />
                        <span className="text-sm">{lang === "fr" ? p.name_fr : p.name_en}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </form>

            {/* Switchers langue / devise (desktop) */}
            <div className="hidden sm:flex items-center gap-3">
              <Switcher value={lang.toUpperCase()} options={["FR", "EN"]} onChange={(v) => changeLang(v.toLowerCase())} testid="lang-switcher" />
              <Switcher value={currency} options={["EUR", "USD", "XOF"]} onChange={setCurrency} testid="currency-switcher" />
            </div>

            {/* Icônes */}
            <div className="flex items-center gap-3 lg:gap-4">
              <Link to={user ? "/account" : "/login"} data-testid="account-link" aria-label="account" className="hover:text-brand transition-colors">
                <User className="w-5 h-5" />
              </Link>
              <Link to="/wishlist" data-testid="wishlist-link" className="relative hover:text-brand transition-colors" aria-label="wishlist">
                <Heart className="w-5 h-5" />
                {wishlist.length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-brand text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                    {wishlist.length}
                  </span>
                )}
              </Link>
              <Link to="/cart" data-testid="cart-link" className="relative hover:text-brand transition-colors" aria-label="cart">
                <ShoppingBag className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-brand text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center" data-testid="cart-count">
                    {cartCount}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Menu mobile (inchangé) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-80 p-0">
          <div className="p-4 border-b flex items-center justify-between">
            <Brand size="sm" />
            <button onClick={() => setMobileOpen(false)} aria-label="close"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={doSearch} className="p-4 border-b">
            <Input value={q} onChange={(e) => onSearchChange(e.target.value)} placeholder={t("searchPlaceholder")} data-testid="mobile-search-input" />
          </form>
          <div className="flex flex-col">
            {NAV.map((n) => (
              <Link key={n.key} to={n.to} onClick={() => setMobileOpen(false)}
                className={`flex items-center justify-between px-4 py-3 border-b text-sm font-semibold uppercase ${n.key === "promotions" ? "text-brand" : ""}`}>
                {t(n.key)} <ChevronRight className="w-4 h-4" />
              </Link>
            ))}
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