import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api } from "@/lib/api";
import { swrGetShared } from "@/lib/cache";
import { Search, Heart, ShoppingBag, User, Menu, X, ChevronRight, ChevronDown } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import Brand from "@/components/Brand";
import { mediaSrc } from "@/lib/adminUtils";

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

/* --- Dropdown desktop au survol --- */
function NavDropdown({ label, to, groups, lang }) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);

  const openMenu = () => { clearTimeout(timerRef.current); setOpen(true); };
  const closeMenu = () => { timerRef.current = setTimeout(() => setOpen(false), 150); };

  // Si aucune sous-catégorie : lien simple
  if (!groups || groups.length === 0) {
    return (
      <Link to={to} className="relative py-3 hover:text-brand transition-colors">
        {label}
      </Link>
    );
  }

  return (
    <div className="relative" onMouseEnter={openMenu} onMouseLeave={closeMenu}>
      <Link to={to} className="relative py-3 hover:text-brand transition-colors inline-flex items-center gap-1">
        {label}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </Link>
      {open && (
        <div className="absolute left-0 top-full pt-2 min-w-[200px] z-50">
          <div className="bg-white border border-border shadow-lg py-2">
            {groups.map((g, i) => (
              <Link
                key={i}
                to={g.to}
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-sm hover:bg-secondary hover:text-brand transition-colors whitespace-nowrap"
              >
                {g.label}
              </Link>
            ))}
            <div className="border-t border-border mt-1 pt-1">
              <Link
                to={to}
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-xs uppercase tracking-wider font-bold text-brand hover:bg-secondary"
              >
                {lang === "fr" ? "Voir tout →" : "See all →"}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const { t, lang, changeLang, currency, setCurrency, cartCount, wishlist, user, settings } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState([]);
  const [nav, setNav] = useState(null);
  const [mobileExpanded, setMobileExpanded] = useState(null); // clé de la section ouverte
  const routerNav = useNavigate();

  // Charge le menu dynamique (categories + marques + genders + sports + teams + clubs filtrés)
  useEffect(() => {
    swrGetShared("/nav", (d) => setNav(d), { ttl: 5 * 60 * 1000 }).catch(() => {});
  }, []);

  // Barre d'info
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

  // Construit les groupes dynamiques par catégorie
  // Ex: pour "maillots", sous-menu [Homme, Femme, Enfant, Sénégal, PSG...] (uniquement ceux qui existent)
  const buildGroups = (categorySlug) => {
    if (!nav) return [];
    const groups = [];
    // Genres (tous, mais on les filtre par dispo produits dans cette catégorie ? -> simplifié : tous ceux qui existent)
    nav.genders?.forEach((g) => groups.push({
      label: lang === "fr" ? g.name_fr : g.name_en,
      to: `/catalog?category=${categorySlug}&gender=${g.value}`,
    }));
    // Sélections (pour les maillots principalement)
    if (categorySlug === "maillots" && nav.teams?.length > 0) {
      nav.teams.forEach((tm) => groups.push({
        label: lang === "fr" ? tm.name_fr : tm.name_en,
        to: `/catalog?category=${categorySlug}&team=${tm.value}`,
      }));
    }
    // Clubs (pour maillots)
    if (categorySlug === "maillots" && nav.clubs?.length > 0) {
      nav.clubs.forEach((cl) => groups.push({
        label: lang === "fr" ? cl.name_fr : cl.name_en,
        to: `/catalog?category=${categorySlug}&club=${cl.value}`,
      }));
    }
    // Sports (pour équipements, chaussures)
    if (["chaussures", "equipements", "vetements"].includes(categorySlug) && nav.sports?.length > 0) {
      nav.sports.forEach((sp) => groups.push({
        label: lang === "fr" ? sp.name_fr : sp.name_en,
        to: `/catalog?category=${categorySlug}&sport=${sp.value}`,
      }));
    }
    return groups;
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-border">
      {/* Barre d'info */}
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

      {/* Barre principale */}
      <div className="max-w-[1800px] mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between h-14 lg:h-16 gap-4">

          {/* Gauche : burger (mobile) + logo */}
          <div className="flex items-center gap-3 shrink-0">
            <button className="lg:hidden" onClick={() => setMobileOpen(true)} data-testid="mobile-menu-btn" aria-label="menu">
              <Menu className="w-6 h-6" />
            </button>
            <Link to="/" data-testid="logo-link" className="shrink-0">
              <Brand />
            </Link>
          </div>

          {/* Centre : nav dynamique (desktop) */}
          <nav className="hidden lg:flex items-center gap-6 xl:gap-8 text-[13px] xl:text-sm font-medium">
            {/* Catégories dynamiques */}
            {(nav?.categories || []).map((c) => (
              <NavDropdown
                key={c.slug}
                label={lang === "fr" ? c.name_fr : c.name_en}
                to={`/catalog?category=${c.slug}`}
                groups={buildGroups(c.slug)}
                lang={lang}
              />
            ))}

            {/* Sélections (menu principal si produits) */}
            {nav?.teams?.length > 0 && (
              <NavDropdown
                label={lang === "fr" ? "Sélections" : "Teams"}
                to={`/catalog`}
                groups={nav.teams.map((tm) => ({
                  label: lang === "fr" ? tm.name_fr : tm.name_en,
                  to: `/catalog?team=${tm.value}`,
                }))}
                lang={lang}
              />
            )}

            {/* Clubs (menu principal si produits) */}
            {nav?.clubs?.length > 0 && (
              <NavDropdown
                label={lang === "fr" ? "Clubs" : "Clubs"}
                to={`/catalog`}
                groups={nav.clubs.map((cl) => ({
                  label: lang === "fr" ? cl.name_fr : cl.name_en,
                  to: `/catalog?club=${cl.value}`,
                }))}
                lang={lang}
              />
            )}

            {/* Promotions */}
            <Link to="/catalog?on_sale=true" className="py-3 text-brand hover:text-brand-dark transition-colors" data-testid="nav-promotions">
              {t("promotions")}
            </Link>

            {/* Marques (dropdown) */}
            {nav?.brands?.length > 0 && (
              <NavDropdown
                label={t("brands")}
                to="/brands"
                groups={nav.brands.map((b) => ({ label: b.name, to: `/catalog?brand=${b.slug}` }))}
                lang={lang}
              />
            )}
          </nav>

          {/* Droite : recherche + switchers + icônes */}
          <div className="flex items-center gap-3 lg:gap-4 shrink-0">
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
              <Switcher value={currency} options={["EUR", "USD", "XOF"]} onChange={setCurrency} testid="currency-switcher" />
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

      {/* Menu mobile (accordéon) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-80 p-0 overflow-auto">
          <div className="p-4 border-b flex items-center justify-between">
            <Brand size="sm" />
            <button onClick={() => setMobileOpen(false)} aria-label="close"><X className="w-5 h-5" /></button>
          </div>

          <form onSubmit={doSearch} className="p-4 border-b">
            <Input value={q} onChange={(e) => onSearchChange(e.target.value)} placeholder={t("searchPlaceholder")} data-testid="mobile-search-input" />
          </form>

          <div className="flex flex-col">
            {/* Catégories dynamiques avec accordéon */}
            {(nav?.categories || []).map((c) => {
              const groups = buildGroups(c.slug);
              const isExp = mobileExpanded === c.slug;
              return (
                <div key={c.slug} className="border-b">
                  <div className="flex items-center justify-between px-4 py-3">
                    <Link
                      to={`/catalog?category=${c.slug}`}
                      onClick={() => setMobileOpen(false)}
                      className="text-sm font-semibold uppercase flex-1"
                    >
                      {lang === "fr" ? c.name_fr : c.name_en}
                    </Link>
                    {groups.length > 0 && (
                      <button onClick={() => setMobileExpanded(isExp ? null : c.slug)} className="p-1">
                        <ChevronDown className={`w-4 h-4 transition-transform ${isExp ? "rotate-180" : ""}`} />
                      </button>
                    )}
                  </div>
                  {isExp && groups.length > 0 && (
                    <div className="bg-secondary/40">
                      {groups.map((g, i) => (
                        <Link
                          key={i}
                          to={g.to}
                          onClick={() => setMobileOpen(false)}
                          className="block px-6 py-2 text-sm hover:text-brand"
                        >
                          {g.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Sélections (menu mobile) */}
            {nav?.teams?.length > 0 && (
              <div className="border-b">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-semibold uppercase flex-1">
                    {lang === "fr" ? "Sélections" : "Teams"}
                  </span>
                  <button onClick={() => setMobileExpanded(mobileExpanded === "__teams" ? null : "__teams")} className="p-1">
                    <ChevronDown className={`w-4 h-4 transition-transform ${mobileExpanded === "__teams" ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {mobileExpanded === "__teams" && (
                  <div className="bg-secondary/40">
                    {nav.teams.map((tm, i) => (
                      <Link
                        key={i}
                        to={`/catalog?team=${tm.value}`}
                        onClick={() => setMobileOpen(false)}
                        className="block px-6 py-2 text-sm hover:text-brand"
                      >
                        {lang === "fr" ? tm.name_fr : tm.name_en}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Clubs (menu mobile) */}
            {nav?.clubs?.length > 0 && (
              <div className="border-b">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-semibold uppercase flex-1">
                    {lang === "fr" ? "Clubs" : "Clubs"}
                  </span>
                  <button onClick={() => setMobileExpanded(mobileExpanded === "__clubs" ? null : "__clubs")} className="p-1">
                    <ChevronDown className={`w-4 h-4 transition-transform ${mobileExpanded === "__clubs" ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {mobileExpanded === "__clubs" && (
                  <div className="bg-secondary/40">
                    {nav.clubs.map((cl, i) => (
                      <Link
                        key={i}
                        to={`/catalog?club=${cl.value}`}
                        onClick={() => setMobileOpen(false)}
                        className="block px-6 py-2 text-sm hover:text-brand"
                      >
                        {lang === "fr" ? cl.name_fr : cl.name_en}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Link to="/catalog?on_sale=true" onClick={() => setMobileOpen(false)} className="px-4 py-3 border-b text-sm font-semibold uppercase text-brand">
              {t("promotions")}
            </Link>

            {nav?.brands?.length > 0 && (
              <Link to="/brands" onClick={() => setMobileOpen(false)} className="px-4 py-3 border-b text-sm font-semibold uppercase">
                {t("brands")}
              </Link>
            )}
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