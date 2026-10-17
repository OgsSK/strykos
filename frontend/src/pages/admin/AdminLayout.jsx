import React, { useEffect, useState, useCallback } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api } from "@/lib/api";
import { LayoutDashboard, Package, ShoppingCart, Settings, ArrowLeft, Tag, Users, Mail, Layers, Award, Menu, X, Star, Send, Truck } from "lucide-react";

export const ADMIN_NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/orders", label: "Commandes", icon: ShoppingCart },
  { to: "/admin/products", label: "Produits", icon: Package },
  { to: "/admin/brands", label: "Marques", icon: Award },
  { to: "/admin/categories", label: "Categories", icon: Layers },
  { to: "/admin/customers", label: "Clients", icon: Users },
  { to: "/admin/drivers", label: "Livreurs", icon: Truck },
  { to: "/admin/promos", label: "Codes promo", icon: Tag },
  { to: "/admin/reviews", label: "Avis", icon: Star },
  { to: "/admin/newsletter", label: "Newsletter", icon: Send },
  { to: "/admin/emails", label: "E-mails", icon: Mail },
  { to: "/admin/settings", label: "Parametres", icon: Settings },
];

// ⭐ Intervalle de polling des badges (60s)
const POLL_INTERVAL_MS = 60_000;

export default function AdminLayout() {
  const { user } = useStore();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  // ⭐ NOUVEAU : badges (annulations en attente + avis à modérer)
  const [badges, setBadges] = useState({ orders: 0, reviews: 0 });

  // ⭐ Fetch silencieux des compteurs
  const fetchBadges = useCallback(async () => {
    try {
      const [ordersRes, reviewsRes] = await Promise.allSettled([
        api.get("/admin/orders/counts"),
        api.get("/admin/reviews?approved=false&limit=1"),
      ]);

      const cancellations = ordersRes.status === "fulfilled"
        ? (ordersRes.value.data?.cancellations || 0)
        : 0;
      const pendingReviews = reviewsRes.status === "fulfilled"
        ? (reviewsRes.value.data?.total || 0)
        : 0;

      setBadges({ orders: cancellations, reviews: pendingReviews });
    } catch {
      // silent fail — ne casse pas l'UI si le backend est down
    }
  }, []);

  // ⭐ Polling : charge une fois au mount + toutes les 60s
  useEffect(() => {
    fetchBadges();
    const interval = setInterval(fetchBadges, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchBadges]);

  const active = (n) => (n.exact ? loc.pathname === n.to : loc.pathname.startsWith(n.to));

  // ⭐ Retourne le badge pour un item de nav (0 = pas de badge)
  const getBadge = (n) => {
    if (n.to === "/admin/orders") return badges.orders;
    if (n.to === "/admin/reviews") return badges.reviews;
    return 0;
  };

  return (
    <div className="min-h-screen flex bg-secondary" data-testid="admin-layout">
      {/* ⭐ NOUVEAU : skip to content (accessibilité clavier) */}
      <a
        href="#admin-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-brand focus:text-white focus:px-3 focus:py-2 focus:text-sm focus:font-bold focus:rounded"
      >
        Aller au contenu
      </a>

      <aside className={`${open ? "flex" : "hidden"} lg:flex fixed lg:static inset-y-0 left-0 z-40 w-60 bg-ink text-white flex-col shrink-0`}>
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="font-heading font-extrabold text-xl">
            STRY<span className="text-brand">KOS</span>
            <span className="text-[11px] font-normal block text-white/50 tracking-wider uppercase">
              Cockpit admin
            </span>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Fermer le menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          {ADMIN_NAV.map((n) => {
            const badge = getBadge(n);
            const isActive = active(n);
            return (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                data-testid={`admin-nav-${n.label.toLowerCase().replace(/ /g, "-")}`}
                className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                  isActive ? "bg-brand text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <n.icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">{n.label}</span>
                {badge > 0 && (
                  <span
                    className={`text-[10px] font-bold min-w-[20px] h-[20px] flex items-center justify-center rounded-full px-1.5 ${
                      isActive ? "bg-white text-brand" : "bg-red-500 text-white"
                    }`}
                    title={`${badge} en attente`}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-3 text-xs text-white/40 border-t border-white/10 truncate">
          {user?.email}
        </div>
        <Link
          to="/"
          className="flex items-center gap-2 px-5 py-4 text-sm text-white/60 hover:text-white border-t border-white/10"
        >
          <ArrowLeft className="w-4 h-4" /> Retour boutique
        </Link>
      </aside>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <main id="admin-main-content" className="flex-1 min-w-0 overflow-auto" tabIndex={-1}>
        <div className="lg:hidden flex items-center gap-3 bg-ink text-white px-4 py-3">
          <button
            onClick={() => setOpen(true)}
            data-testid="admin-mobile-menu"
            aria-label="Ouvrir le menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-heading font-bold">Cockpit admin</span>
          {/* ⭐ Badge mobile : affiche le total en attente */}
          {badges.orders > 0 && (
            <span className="ml-auto text-[10px] font-bold min-w-[20px] h-[20px] flex items-center justify-center rounded-full bg-red-500 text-white px-1.5">
              {badges.orders}
            </span>
          )}
        </div>
        <div className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}