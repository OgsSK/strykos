import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { api, setAuthToken } from "@/lib/api";
import { swrGetShared, invalidateCache, clearAllCache } from "@/lib/cache";
import { translations, formatMoney } from "@/i18n/translations";
import { toast } from "sonner";
// ⭐ NOUVEAU : polling de version pour invalidation intelligente du cache
import { startCacheVersionPolling, onCacheVersionChange } from "@/lib/cacheVersion";

const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);

const DEFAULT_RATES = { EUR: 1, USD: 1.08, XOF: 655.957 };

// ⭐ Devise par défaut = XOF (FCFA)
const DEFAULT_CURRENCY = "XOF";
const CURRENCY_KEY = "strykos_currency_v2";

export function StoreProvider({ children }) {
  // ---- currency & settings ----
  const [currency, setCurrencyState] = useState(() => {
    return localStorage.getItem(CURRENCY_KEY) || DEFAULT_CURRENCY;
  });
  const [settings, setSettings] = useState(() => { try { return JSON.parse(localStorage.getItem("strykos_cache:/settings") || "null")?.data || null; } catch { return null; } });
  const rates = settings?.currency?.rates || DEFAULT_RATES;

  // ⭐ NOUVEAU : compteur de version cache — incrémenté à chaque changement admin
  const [cacheVersion, setCacheVersion] = useState(0);

  // ---- Brand ----
  const brand = useMemo(() => {
    const s = settings?.site || {};
    // ⭐ CORRECTION ICI : On met CAKES et SHOP par défaut au lieu de STRY et KOS
    const full = s.name || `${s.brand_part1 || "CAKES"}${s.brand_part2 || "SHOP"}`;
    return {
      part1: s.brand_part1 || "CAKES",
      part2: s.brand_part2 || "SHOP",
      full,
      tagline: s.brand_tagline || "Pâtisserie artisanale. Fraîcheur garantie. Livrée chez vous.",
      tagline_en: s.brand_tagline_en || "Artisan bakery. Freshly made. Delivered to you.",
    };
  }, [settings]);

  const applyBrand = useCallback((text) => {
    if (!text || typeof text !== "string") return text || "";
    return text.replace(/STRYKOS/g, brand.full);
  }, [brand.full]);

  // ---- i18n ----
  const [lang, setLang] = useState(() => localStorage.getItem("strykos_lang") || "fr");
  const t = useCallback((key) => {
    const raw = translations[lang]?.[key] ?? translations.fr[key] ?? key;
    if (typeof raw !== "string") return raw;
    if (raw.includes("STRYKOS") && brand.full !== "STRYKOS") {
      return raw.replace(/STRYKOS/g, brand.full);
    }
    return raw;
  }, [lang, brand.full]);
  const changeLang = (l) => { setLang(l); localStorage.setItem("strykos_lang", l); };
  const tr = useCallback((obj, field) => {
    if (!obj) return "";
    return obj[`${field}_${lang}`] || obj[`${field}_fr`] || obj[`${field}_en`] || "";
  }, [lang]);

  const setCurrency = (c) => {
    setCurrencyState(c);
    localStorage.setItem(CURRENCY_KEY, c);
  };
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
    swrGetShared("/settings", (d) => setSettings(d), { ttl: 2 * 60 * 1000 }).catch(() => {});
  }, []);

  // ⭐ NOUVEAU : polling de version pour invalidation intelligente du cache
  useEffect(() => {
    const stopPolling = startCacheVersionPolling(30000);

    const unsubscribe = onCacheVersionChange(async (newVersion) => {
      console.log("🔄 Rechargement des données suite à un changement admin (v =", newVersion, ")");
      clearAllCache();
      setCacheVersion(v => v + 1);
      try {
        const settingsRes = await api.get(`/settings?_v=${newVersion}`);
        setSettings(settingsRes.data);
      } catch (e) {
        console.error("Erreur rechargement après bump version", e);
      }
    });

    return () => {
      stopPolling();
      unsubscribe();
    };
  }, []);

  // ---- auth ----
  const [user, setUserState] = useState(() => {
    try { return localStorage.getItem("strykos_token") ? JSON.parse(localStorage.getItem("strykos_user") || "null") : null; } catch { return null; }
  });
  const setUser = (u) => { setUserState(u); if (u) localStorage.setItem("strykos_user", JSON.stringify(u)); else localStorage.removeItem("strykos_user"); };
  const [authChecked, setAuthChecked] = useState(() => !localStorage.getItem("strykos_token"));

  const requireAuth = useCallback((reason) => {
    toast.error(reason || (lang === "fr" ? "Connectez-vous pour continuer" : "Please sign in to continue"));
    const back = window.location.pathname + window.location.search;
    setTimeout(() => {
      window.location.href = `/login?redirect=${encodeURIComponent(back)}`;
    }, 900);
    return false;
  }, [lang]);

  const mergeCarts = (a, b) => {
    const out = [...a];
    for (const it of b) {
      const idx = out.findIndex((x) => x.variant_id === it.variant_id &&
        JSON.stringify(x.customization) === JSON.stringify(it.customization));
      if (idx >= 0) {
        out[idx] = { ...out[idx], quantity: out[idx].quantity + it.quantity };
      } else {
        out.push(it);
      }
    }
    return out;
  };

  const loadServerCartAndMerge = async () => {
    try {
      const { data } = await api.get("/cart");
      const serverItems = data?.cart?.items || [];
      const localItems = JSON.parse(localStorage.getItem("strykos_cart") || "[]");

      if (serverItems.length === 0 && localItems.length === 0) return;

      if (serverItems.length === 0 && localItems.length > 0) {
        setCart(localItems);
        const subtotalEur = localItems.reduce((s, i) => {
          const price = i.prices?.EUR?.price ?? 0;
          const extra = i.extra_price_eur || 0;
          const custom = i.customization ? (i.customization_price_eur || 0) : 0;
          return s + (price + extra + custom) * i.quantity;
        }, 0);
        await api.post("/cart/sync", { items: localItems, subtotal_eur: subtotalEur });
        return;
      }

      if (serverItems.length > 0 && localItems.length === 0) {
        setCart(serverItems);
        return;
      }

      const same = JSON.stringify(
        [...serverItems].sort((a, b) => (a.variant_id || "").localeCompare(b.variant_id || ""))
      ) === JSON.stringify(
        [...localItems].sort((a, b) => (a.variant_id || "").localeCompare(b.variant_id || ""))
      );
      if (same) {
        setCart(serverItems);
        return;
      }

      const merged = mergeCarts(serverItems, localItems);
      setCart(merged);
      const subtotalEur = merged.reduce((s, i) => {
        const price = i.prices?.EUR?.price ?? 0;
        const extra = i.extra_price_eur || 0;
        const custom = i.customization ? (i.customization_price_eur || 0) : 0;
        return s + (price + extra + custom) * i.quantity;
      }, 0);
      await api.post("/cart/sync", { items: merged, subtotal_eur: subtotalEur });
    } catch {
      // silencieux
    }
  };

  useEffect(() => {
    const tk = localStorage.getItem("strykos_token");
    if (!tk) { setAuthChecked(true); return; }
    api.get("/auth/me")
      .then((r) => {
        setUser(r.data);
        loadServerCartAndMerge();
      })
      .catch((e) => { if (e?.response?.status === 401) { setAuthToken(null); setUser(null); } })
      .finally(() => setAuthChecked(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setAuthToken(data.token); setUser(data.user);
    await loadWishlist();
    await loadServerCartAndMerge();
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    return data;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (e) {}
    setAuthToken(null);
    setUser(null);
    setWishlist([]);
    localStorage.removeItem("strykos_wishlist");
    localStorage.removeItem("strykos_cart");
    setCart([]);
    invalidateCache("/auth");
  };

  // ---- wishlist ----
  const [wishlist, setWishlistState] = useState(() => { try { return JSON.parse(localStorage.getItem("strykos_wishlist") || "[]"); } catch { return []; } });
  const setWishlist = (v) => setWishlistState((prev) => { const next = typeof v === "function" ? v(prev) : v; localStorage.setItem("strykos_wishlist", JSON.stringify(next)); return next; });
  const loadWishlist = useCallback(async () => {
    try { const { data } = await api.get("/wishlist"); setWishlist(data.product_ids || []); }
    catch (e) { /* keep cached */ }
  }, []);
  useEffect(() => { if (user) loadWishlist(); }, [user, loadWishlist]);

  const toggleWishlist = async (productId) => {
    if (!user) {
      return requireAuth(lang === "fr"
        ? "Connectez-vous pour ajouter aux favoris"
        : "Sign in to save favorites");
    }
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

  const cartSyncRef = useRef(null);
  useEffect(() => {
    if (!user) return;
    if (cartSyncRef.current) clearTimeout(cartSyncRef.current);
    cartSyncRef.current = setTimeout(() => {
      const subtotalEur = cart.reduce((s, i) => {
        const price = i.prices?.EUR?.price ?? 0;
        const extra = i.extra_price_eur || 0;
        const custom = i.customization ? (i.customization_price_eur || 0) : 0;
        return s + (price + extra + custom) * i.quantity;
      }, 0);
      api.post("/cart/sync", { items: cart, subtotal_eur: subtotalEur }).catch(() => {});
    }, 1500);
    return () => { if (cartSyncRef.current) clearTimeout(cartSyncRef.current); };
  }, [cart, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const addToCart = (item) => {
    if (!user) {
      return requireAuth(lang === "fr"
        ? "Connectez-vous pour ajouter au panier"
        : "Sign in to add to cart");
    }
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.variant_id === item.variant_id &&
        JSON.stringify(x.customization) === JSON.stringify(item.customization));
      if (idx >= 0) {
        const copy = [...prev]; copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + item.quantity }; return copy;
      }
      return [...prev, item];
    });
    return true;
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
    settings, brand, applyBrand,
    user, authChecked, login, register, logout, requireAuth,
    setUser,
    wishlist, toggleWishlist, loadWishlist,
    cart, cartCount, addToCart, updateQty, removeFromCart, clearCart, cartUnitPrice, cartSubtotal,
    cacheVersion, 
  };

  useEffect(() => {
    if (brand.full) document.title = brand.full;
  }, [brand.full]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}