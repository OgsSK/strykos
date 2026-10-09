import React, { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { LayoutDashboard, Package, ShoppingCart, Settings, ArrowLeft, Tag, Users, Mail, Layers, Award, Menu, X } from "lucide-react";

export const ADMIN_NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/orders", label: "Commandes", icon: ShoppingCart },
  { to: "/admin/products", label: "Produits", icon: Package },
  { to: "/admin/brands", label: "Marques", icon: Award },
  { to: "/admin/categories", label: "Categories", icon: Layers },
  { to: "/admin/customers", label: "Clients", icon: Users },
  { to: "/admin/promos", label: "Codes promo", icon: Tag },
  { to: "/admin/emails", label: "E-mails", icon: Mail },
  { to: "/admin/settings", label: "Parametres", icon: Settings },
];

export default function AdminLayout() {
  const { user } = useStore();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const active = (n) => (n.exact ? loc.pathname === n.to : loc.pathname.startsWith(n.to));
  return (
    <div className="min-h-screen flex bg-secondary" data-testid="admin-layout">
      <aside className={`${open ? "flex" : "hidden"} lg:flex fixed lg:static inset-y-0 left-0 z-40 w-60 bg-ink text-white flex-col shrink-0`}>
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="font-heading font-extrabold text-xl">STRY<span className="text-brand">KOS</span>
            <span className="text-[11px] font-normal block text-white/50 tracking-wider uppercase">Cockpit admin</span></div>
          <button className="lg:hidden" onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {ADMIN_NAV.map((n) => (
            <Link key={n.to} to={n.to} onClick={() => setOpen(false)} data-testid={`admin-nav-${n.label.toLowerCase().replace(/ /g, "-")}`}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${active(n) ? "bg-brand text-white" : "text-white/70 hover:bg-white/5 hover:text-white"}`}>
              <n.icon className="w-4 h-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-3 text-xs text-white/40 border-t border-white/10 truncate">{user?.email}</div>
        <Link to="/" className="flex items-center gap-2 px-5 py-4 text-sm text-white/60 hover:text-white border-t border-white/10">
          <ArrowLeft className="w-4 h-4" /> Retour boutique
        </Link>
      </aside>
      {open && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setOpen(false)} />}
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="lg:hidden flex items-center gap-3 bg-ink text-white px-4 py-3">
          <button onClick={() => setOpen(true)} data-testid="admin-mobile-menu"><Menu className="w-5 h-5" /></button>
          <span className="font-heading font-bold">Cockpit admin</span>
        </div>
        <div className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
