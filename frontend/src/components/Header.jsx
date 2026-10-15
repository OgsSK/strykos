import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api } from "@/lib/api";
import { swrGetShared } from "@/lib/cache";
import { Search, Heart, ShoppingBag, User, Menu, ChevronRight, ChevronDown } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import Brand from "@/components/Brand";
import { mediaSrc } from "@/lib/adminUtils";
import AnimatedSearchInput from "@/components/AnimatedSearchInput";

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

/* --- Mega-menu desktop : 4 colonnes avec sous-catégories --- */
function MegaMenu({ categories, lang }) {
  const [openSlug, setOpenSlug] = useState(null);
  const timerRef = useRef(null);

  const openMenu = (slug) => {
    clearTimeout(timerRef.current);
    setOpenSlug(slug);
  };
  const closeMenu = () => {
    timerRef.current = setTimeout(() => setOpenSlug(null), 200);
  };

  return (
    <nav
      className="hidden lg:flex items-center gap-6 xl:gap-8 text-[13px] xl:text-sm font-medium"
      onMouseLeave={closeMenu}
    >
      {categories.map((cat) => {
        const label = lang === "fr" ? cat.name_fr : cat.name_en;
        const hasChildren = cat.children && cat.children.length > 0;

        return (
          <div
            key={cat.slug}
            className="relative"
            onMouseEnter={() => openMenu(cat.slug)}
          >
            <Link
              to={`/catalog?category=${cat.slug}`}
              className="py-3 inline-flex items-center gap-1 hover:text-brand transition-colors"
              data-testid={`nav-${cat.slug}`}
            >
              {label}
              {hasChildren && <ChevronDown className={`w-3 h-3 transition-transform ${openSlug === cat.slug ? "rotate-180" : ""}`} />}
            </Link>
          </div>
        );
      })}

      <Link to="/catalog?on_sale=true" className="py-3 text-brand hover:text-brand-dark transition-colors" data-testid="nav-promotions">
        {lang === "fr" ? "Promotions" : "Sale"}
      </Link>

      <Link to="/brands" className="py-3 hover:text-brand transition-colors" data-testid="nav-brands">
        {lang === "fr" ? "Nos créations" : "Our creations"}
      </Link>

      {openSlug && (() => {
        const cat = categories.find((c) => c.slug === openSlug);
        if (!cat || !cat.children?.length) return null;
        return (
          <div
            className="absolute left-0 right-0 top-full pt-2 z-40"
            onMouseEnter={() => openMenu(openSlug)}
          >
            <div className="max-w-[1800px] mx-auto px-4 lg:px-6">
              <div className="bg-white border border-border shadow-lg p-6">
                <div className="flex items-start gap-12">
                  <div className="flex-1">
                    <div className="text-[11px] uppercase tracking-widest text-ink-muted mb-4">
                      {lang === "fr" ? cat.name_fr : cat.name_en}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-2">
                      {cat.children.map((child) => (
                        <Link
                          key={child.slug}
                          to={`/catalog?category=${child.slug}`}
                          onClick={() => setOpenSlug(null)}
                          className="text-sm text-ink-soft hover:text-brand transition-colors py-1"
                        >
                          {lang === "fr" ? child.name_fr : child.name_en}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 border-l border-border pl-8">
                    <Link
                      to={`/catalog?category=${cat.slug}`}
                      onClick={() => setOpenSlug(null)}
                      className="text-sm font-bold uppercase tracking-wider text-brand hover:text-brand-dark inline-flex items-center gap-1"
                    >
                      {lang === "fr" ? "Voir tout" : "See all"} →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </nav>
  );
}

export default function Header() {
  const { t, lang, changeLang, currency, setCurrency, cartCount, wishlist, user, settings } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState([]);
  const [nav, setNav] = useState(null);
  const [mobileExpanded, setMobileExpanded] = useState(null);
  const routerNav = useNavigate();

  useEffect(() => {
    swrGetShared("/nav", (d) => setNav(d), { ttl: 5 * 60 * 1000 }).catch(() => {});
  }, []);

  const infoMsgs = settings?.info_bar?.enabled
    ? (lang === "fr" ? settings.info_bar.messages_fr : settings.info_bar.messages_en) || [] : [];
  const [infoIdx, setInfoIdx] = useState(0);
  useEffect(() => {
    if (infoMsgs.length < 2) return;
    const id = setInterval(() => setInfoIdx((i) => i + 1), 4000);
    return () => clearInterval(id);
  }, [infoMsgs.length]);

  const doSearch = (e) => {
    e.preventDefault();
    if (q.trim()) { routerNav(`/search?q=${encodeURIComponent(q)}`); setSuggest([]); setMobileOpen(false); }
  };
  const onSearchChange = async (val) => {
    setQ(val);
    if (val.length >= 2) {
      try { const { data } = await api.get(`/products/search-suggest?q=${encodeURIComponent(val)}`); setSuggest(data.products); }
      catch { setSuggest([]); }
    } else setSuggest([]);
  };

  return (
    <header className="sticky top-0 z-50 bg-cream border-b border-border">
      {infoMsgs.length > 0 && (
        <div className="bg-ink text-white text-xs py-2 overflow-hidden" data-testid="info-bar">
          <div className="hidden sm:flex max-w-7xl mx-auto px-4 items-center justify-center gap-6 whitespace-nowrap">
            {infoMsgs.map((m, i) => <span key={i} className="tracking-wide">{m}</span>)}
          </div>
          <div className="sm:hidden px-4 text-center truncate tracking-wide" key={infoIdx} data-testid="info-bar-mobile">
            {infoMsgs[infoIdx % infoMsgs.length]}
          </div>
        </div>
      )}

      <div className="relative">
        <div className="max-w-[1800px] mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-14 lg:h-16 gap-4">
            <div className="flex items-center gap-3 shrink-0">
              <button className="lg:hidden" onClick={() => setMobileOpen(true)} data-testid="mobile-menu-btn" aria-label="menu">
                <Menu className="w-6 h-6" />
              </button>
              <Link to="/" data-testid="logo-link" className="shrink-0">
                <Brand />
              </Link>
            </div>

            <div className="flex-1 flex justify-center">
              {nav?.categories?.length > 0 && (
                <MegaMenu categories={nav.categories} lang={lang} />
              )}
            </div>

            <div className="flex items-center gap-3 lg:gap-4 shrink-0">
              <form onSubmit={doSearch} className="hidden md:flex relative">
                <div className="relative">
                  <AnimatedSearchInput
                    data-testid="search-input"
                    value={q}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    className="w-44 lg:w-56 xl:w-64 h-9"
                    rightIcon={
                      <button
                        type="submit"
                        className="p-1 text-ink-muted hover:text-ink"
                        aria-label="search"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    }
                  />
                  {suggest.length > 0 && (
                    <div className="absolute top-11 right-0 w-80 bg-white border border-border shadow-lg z-50" data-testid="search-suggestions">
                      {suggest.map((p) => (
                        <Link key={p.id} to={`/product/${p.slug}`} onClick={() => { setSuggest([]); setQ(""); }}
                          className="flex items-center gap-3 p-2 hover:bg-cream">
                          <img src={mediaSrc(p.images?.[0])} alt="" className="w-10 h-12 object-cover" />
                          <span className="text-sm">{lang === "fr" ? p.name_fr : p.name_en}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </form>

              <div className="hidden sm:flex items-center gap-3">
                <Switcher value={lang.toUpperCase()} options={["FR", "EN"]} onChange={(v) => changeLang(v.toLowerCase())} testid="lang-switcher" />
                <Switcher value={currency} options={["XOF"]} onChange={setCurrency} testid="currency-switcher" />
              </div>

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
      </div>

      {/* Menu mobile */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-80 p-0 overflow-auto">
          <div className="p-4 border-b flex items-center justify-between">
            <Brand size="sm" />
          </div>

          {/* ⭐ Recherche mobile avec le même composant tronqué */}
          <form onSubmit={doSearch} className="p-4 border-b">
            <AnimatedSearchInput
              data-testid="mobile-search-input"
              value={q}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full h-10"
              rightIcon={
                <button
                  type="submit"
                  className="p-1 text-ink-muted hover:text-ink"
                  aria-label="search"
                >
                  <Search className="w-4 h-4" />
                </button>
              }
            />
          </form>

          <div className="flex flex-col">
            {(nav?.categories || []).map((c) => {
              const label = lang === "fr" ? c.name_fr : c.name_en;
              const isExp = mobileExpanded === c.slug;
              const hasChildren = c.children?.length > 0;
              return (
                <div key={c.slug} className="border-b">
                  <div className="flex items-center justify-between px-4 py-3">
                    <Link
                      to={`/catalog?category=${c.slug}`}
                      onClick={() => setMobileOpen(false)}
                      className="text-sm font-semibold uppercase flex-1"
                    >
                      {label}
                    </Link>
                    {hasChildren && (
                      <button onClick={() => setMobileExpanded(isExp ? null : c.slug)} className="p-1">
                        <ChevronDown className={`w-4 h-4 transition-transform ${isExp ? "rotate-180" : ""}`} />
                      </button>
                    )}
                  </div>
                  {isExp && hasChildren && (
                    <div className="bg-cream">
                      {c.children.map((child) => (
                        <Link
                          key={child.slug}
                          to={`/catalog?category=${child.slug}`}
                          onClick={() => setMobileOpen(false)}
                          className="block px-6 py-2 text-sm hover:text-brand"
                        >
                          {lang === "fr" ? child.name_fr : child.name_en}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <Link to="/catalog?on_sale=true" onClick={() => setMobileOpen(false)} className="px-4 py-3 border-b text-sm font-semibold uppercase text-brand">
              {t("promotions")}
            </Link>

            <Link to="/brands" onClick={() => setMobileOpen(false)} className="px-4 py-3 border-b text-sm font-semibold uppercase">
              {lang === "fr" ? "Nos créations" : "Our creations"}
            </Link>
          </div>

          <div className="p-4 flex gap-4">
            <Switcher value={lang.toUpperCase()} options={["FR", "EN"]} onChange={(v) => changeLang(v.toLowerCase())} testid="mobile-lang" />
            <Switcher value={currency} options={["XOF"]} onChange={setCurrency} testid="mobile-currency" />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}