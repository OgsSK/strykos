import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LayoutDashboard, Package, MapPin, User, LogOut, ShieldCheck } from "lucide-react";

export default function Account() {
  const { t, lang, user, logout, settings } = useStore();
  const nav = useNavigate();
  const [tab, setTab] = useState("dashboard");
  const [orders, setOrders] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [profile, setProfile] = useState({ first_name: user.first_name, last_name: user.last_name, phone: user.phone });
  const [newAddr, setNewAddr] = useState({ label: "", address_line: "", city: "", country: "ML", postal_code: "", first_name: user.first_name, last_name: user.last_name, phone: user.phone });

  useEffect(() => {
    api.get("/orders").then((r) => setOrders(r.data)).catch(() => {});
    api.get("/auth/addresses").then((r) => setAddresses(r.data)).catch(() => {});
  }, []);

  const money = (v, cur) => cur === "XOF" ? `${Math.round(v).toLocaleString("fr-FR")} FCFA` : cur === "USD" ? `$${v.toFixed(2)}` : `${v.toFixed(2)} €`;

  const saveProfile = async () => {
    try { await api.put("/auth/me", profile); toast.success(t("save")); } catch { toast.error("Error"); }
  };
  const addAddress = async () => {
    try { const { data } = await api.post("/auth/addresses", newAddr); setAddresses([...addresses, data]); toast.success(t("save")); }
    catch { toast.error("Error"); }
  };
  const delAddress = async (id) => {
    await api.delete(`/auth/addresses/${id}`); setAddresses(addresses.filter((a) => a.id !== id));
  };

  const tabs = [
    { key: "dashboard", label: t("dashboard"), icon: LayoutDashboard },
    { key: "orders", label: t("myOrders"), icon: Package },
    { key: "addresses", label: t("myAddresses"), icon: MapPin },
    { key: "profile", label: t("profile"), icon: User },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8" data-testid="account-page">
      <h1 className="font-heading text-3xl font-bold uppercase tracking-tight mb-2">{t("welcome")}, {user.first_name || user.email}</h1>
      <div className="grid lg:grid-cols-4 gap-8 mt-6">
        <aside className="space-y-1">
          {tabs.map((tb) => (
            <button key={tb.key} onClick={() => setTab(tb.key)} data-testid={`account-tab-${tb.key}`}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-left ${tab === tb.key ? "bg-ink text-white" : "hover:bg-secondary"}`}>
              <tb.icon className="w-4 h-4" /> {tb.label}
            </button>
          ))}
          {user.role === "admin" && (
            <button onClick={() => nav("/admin")} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-left text-brand hover:bg-secondary">
              <ShieldCheck className="w-4 h-4" /> {t("admin")}
            </button>
          )}
          <button onClick={() => { logout(); nav("/"); }} data-testid="logout-btn"
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-left hover:bg-secondary text-ink-muted">
            <LogOut className="w-4 h-4" /> {t("logout")}
          </button>
        </aside>

        <div className="lg:col-span-3">
          {tab === "dashboard" && (
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="border border-border p-5"><div className="text-3xl font-bold">{orders.length}</div><div className="text-sm text-ink-muted">{t("myOrders")}</div></div>
              <div className="border border-border p-5"><div className="text-3xl font-bold">{orders.filter((o) => o.payment_status === "paid").length}</div><div className="text-sm text-ink-muted">{lang === "fr" ? "Payees" : "Paid"}</div></div>
              <div className="border border-border p-5"><div className="text-3xl font-bold">{addresses.length}</div><div className="text-sm text-ink-muted">{t("myAddresses")}</div></div>
            </div>
          )}

          {tab === "orders" && (
            <div className="space-y-3" data-testid="orders-list">
              {orders.length === 0 ? <p className="text-ink-muted">{t("noOrders")}</p> : orders.map((o) => (
                <div key={o.id} className="border border-border p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold">{o.order_number}</div>
                      <div className="text-xs text-ink-muted">{new Date(o.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{money(o.total, o.currency)}</div>
                      <span className={`text-xs uppercase ${o.payment_status === "paid" ? "text-green-600" : "text-amber-600"}`}>{o.status}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-ink-soft">
                    {(o.items || []).map((it, i) => <span key={i}>{(lang === "fr" ? it.name_fr : it.name_en)} ({it.size}) x{it.quantity}{i < o.items.length - 1 ? ", " : ""}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "addresses" && (
            <div data-testid="addresses-tab">
              <div className="grid sm:grid-cols-2 gap-3 mb-6">
                {addresses.map((a) => (
                  <div key={a.id} className="border border-border p-4 text-sm">
                    <div className="font-semibold">{a.first_name} {a.last_name}</div>
                    <div className="text-ink-soft">{a.address_line}, {a.city}, {a.country}</div>
                    <button onClick={() => delAddress(a.id)} className="text-brand text-xs mt-2 hover:underline">{t("remove")}</button>
                  </div>
                ))}
              </div>
              <div className="border border-border p-4 grid sm:grid-cols-2 gap-3">
                <h3 className="sm:col-span-2 font-semibold">{t("addAddress")}</h3>
                <Input placeholder={t("address")} value={newAddr.address_line} onChange={(e) => setNewAddr({ ...newAddr, address_line: e.target.value })} />
                <Input placeholder={t("city")} value={newAddr.city} onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })} />
                <Input placeholder={t("postalCode")} value={newAddr.postal_code} onChange={(e) => setNewAddr({ ...newAddr, postal_code: e.target.value })} />
                <Button onClick={addAddress} className="bg-ink hover:bg-ink/90 rounded-none">{t("save")}</Button>
              </div>
            </div>
          )}

          {tab === "profile" && (
            <div className="max-w-md space-y-4" data-testid="profile-tab">
              <div><Label>{t("firstName")}</Label><Input value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} className="mt-1" /></div>
              <div><Label>{t("lastName")}</Label><Input value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} className="mt-1" /></div>
              <div><Label>{t("phone")}</Label><Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="mt-1" /></div>
              <div><Label>{t("email")}</Label><Input value={user.email} disabled className="mt-1 bg-secondary" /></div>
              <Button onClick={saveProfile} data-testid="save-profile-btn" className="bg-brand hover:bg-brand-dark rounded-none uppercase">{t("save")}</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
