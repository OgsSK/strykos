import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { LayoutDashboard, Package, ShoppingCart, Settings, ArrowLeft } from "lucide-react";

export default function AdminLayout() {
  const { user } = useStore();
  const loc = useLocation();
  const nav = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/admin/products", label: "Produits", icon: Package },
    { to: "/admin/orders", label: "Commandes", icon: ShoppingCart },
    { to: "/admin/settings", label: "Parametres", icon: Settings },
  ];
  const active = (n) => n.exact ? loc.pathname === n.to : loc.pathname.startsWith(n.to);
  return (
    <div className="min-h-screen flex bg-secondary">
      <aside className="w-60 bg-ink text-white flex flex-col shrink-0">
        <div className="p-5 font-heading font-extrabold text-xl border-b border-white/10">STRY<span className="text-brand">KOS</span> <span className="text-xs font-normal block text-white/50">Admin</span></div>
        <nav className="flex-1 py-4">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} data-testid={`admin-nav-${n.label.toLowerCase()}`}
              className={`flex items-center gap-3 px-5 py-3 text-sm ${active(n) ? "bg-brand text-white" : "text-white/70 hover:bg-white/5"}`}>
              <n.icon className="w-4 h-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <Link to="/" className="flex items-center gap-2 px-5 py-4 text-sm text-white/60 hover:text-white border-t border-white/10">
          <ArrowLeft className="w-4 h-4" /> Retour boutique
        </Link>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
