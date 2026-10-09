import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setAuthToken } from "@/lib/api";
import { translations, formatMoney } from "@/i18n/translations";

const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);

const DEFAULT_RATES = { EUR: 1, USD: 1.08, XOF: 655.957 };

export function StoreProvider({ children }) {
  // ---- i18n ----
  const [lang, setLang] = useState(() => localStorage.getItem("strykos_lang") || "fr");
  const t = useCallback((key) => translations[lang]?.[key] ?? translations.fr[key] ?? key, [lang]);
  const changeLang = (l) => { setLang(l); localStorage.setItem("strykos_lang", l); };
  const tr = useCallback((obj, field) => {
    if (!obj) return "";
    return obj[`${field}_${lang}`] || obj[`${field}_fr`] || obj[`${field}_en`] || "";
  }, [lang]);

  // ---- currency & settings ----
  const [currency, setCurrencyState] = useState(() => localStorage.getItem("strykos_currency") || "EUR");
  const [settings, setSettings] = useState(null);
  const rates = settings?.currency?.rates || DEFAULT_RATES;
  const setCurrency = (c) => { setCurrencyState(c); localStorage.setItem("strykos_currency", c); };
  const convertEur = useCallback((amtEur) => {
    if (amtEur == null) return 0;
    const v = amtEur * (rates[currency] || 1);
    return currency === "XOF" ? Math.round(v) : Math.round(v * 100) / 100;
  }, [rates, currency]);
  const fmt = useCallback((amount) => formatMoney(amount, currency), [currency]);
  const priceOf = useCallback((pricesObj) => {
    if (!pricesObj || !pricesObj[currency]) return { price: 0, compare_at: null };
    return pricesObj[currency];
  }, [currency]);

  useEffect(() => {
    api.get("/settings").then((r) => setSettings(r.data)).catch(() => {});
  }, []);

  // ---- auth ----
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    const tk = localStorage.getItem("strykos_token");
    if (!tk) { setAuthChecked(true); return; }
    api.get("/auth/me").then((r) => setUser(r.data)).catch(() => setAuthToken(null)).finally(() => setAuthChecked(true));
  }, []);
  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setAuthToken(data.token); setUser(data.user); await loadWishlist(); return data.user;
  };
  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    setAuthToken(data.token); setUser(data.user); return data.user;
  };
  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (e) {}
    setAuthToken(null); setUser(null); setWishlist([]);
  };

  // ---- wishlist ----
  const [wishlist, setWishlist] = useState([]);
  const loadWishlist = useCallback(async () => {
    try { const { data } = await api.get("/wishlist"); setWishlist(data.product_ids || []); }
    catch (e) { setWishlist([]); }
  }, []);
  useEffect(() => { if (user) loadWishlist(); }, [user, loadWishlist]);
  const toggleWishlist = async (productId) => {
    if (!user) return false;
    if (wishlist.includes(productId)) {
      setWishlist((w) => w.filter((x) => x !== productId));
      await api.delete(`/wishlist/${productId}`);
    } else {
      setWishlist((w) => [...w, productId]);
      await api.post("/wishlist", { product_id: productId });
    }
    return true;
  };

  // ---- cart ----
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem("strykos_cart") || "[]"); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem("strykos_cart", JSON.stringify(cart)); }, [cart]);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const addToCart = (item) => {
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.variant_id === item.variant_id &&
        JSON.stringify(x.customization) === JSON.stringify(item.customization));
      if (idx >= 0) {
        const copy = [...prev]; copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + item.quantity }; return copy;
      }
      return [...prev, item];
    });
  };
  const updateQty = (variantId, custom, qty) => setCart((prev) => prev.map((x) =>
    (x.variant_id === variantId && JSON.stringify(x.customization) === JSON.stringify(custom))
      ? { ...x, quantity: Math.max(1, qty) } : x));
  const removeFromCart = (variantId, custom) => setCart((prev) => prev.filter((x) =>
    !(x.variant_id === variantId && JSON.stringify(x.customization) === JSON.stringify(custom))));
  const clearCart = () => setCart([]);

  const cartUnitPrice = useCallback((item) => {
    const base = item.prices?.[currency]?.price ?? 0;
    const extra = convertEur(item.extra_price_eur || 0);
    const custom = item.customization ? convertEur(item.customization_price_eur || 0) : 0;
    return base + extra + custom;
  }, [currency, convertEur]);
  const cartSubtotal = cart.reduce((s, i) => s + cartUnitPrice(i) * i.quantity, 0);

  const value = {
    lang, changeLang, t, tr,
    currency, setCurrency, rates, convertEur, fmt, priceOf,
    settings,
    user, authChecked, login, register, logout,
    wishlist, toggleWishlist, loadWishlist,
    cart, cartCount, addToCart, updateQty, removeFromCart, clearCart, cartUnitPrice, cartSubtotal,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
