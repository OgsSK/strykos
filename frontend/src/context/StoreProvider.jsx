import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { api, setAuthToken } from "@/lib/api";
import { swrGetShared, invalidateCache } from "@/lib/cache";
import { translations, formatMoney } from "@/i18n/translations";

const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);

const DEFAULT_RATES = { EUR: 1, USD: 1.08, XOF: 655.957 };

export function StoreProvider({ children }) {
  // ---- currency & settings (en premier car brand en depend) ----
  const [currency, setCurrencyState] = useState(() => localStorage.getItem("strykos_currency") || "EUR");
  const [settings, setSettings] = useState(() => { try { return JSON.parse(localStorage.getItem("strykos_cache:/settings") || "null")?.data || null; } catch { return null; } });
  const rates = settings?.currency?.rates || DEFAULT_RATES;

  // ---- Brand (nom parametrable depuis l'admin) ----
  const brand = useMemo(() => {
    const s = settings?.site || {};
    const full = s.name || `${s.brand_part1 || "STRY"}${s.brand_part2 || "KOS"}`;
    return {
      part1: s.brand_part1 || "STRY",
      part2: s.brand_part2 || "KOS",
      full,
      tagline: s.brand_tagline || "Multimarque. Authentique. Livré chez vous.",
      tagline_en: s.brand_tagline_en || "Multi-brand. Authentic. Delivered to you.",
    };
  }, [settings]);

  // Remplace le placeholder STRYKOS dans un texte par le nom actuel
  const applyBrand = useCallback((text) => {
    if (!text || typeof text !== "string") return text || "";
    return text.replace(/STRYKOS/g, brand.full);
  }, [brand.full]);

  // ---- i18n (t utilise maintenant brand) ----
  const [lang, setLang] = useState(() => localStorage.getItem("strykos_lang") || "fr");
  const t = useCallback((key) => {
    const raw = translations[lang]?.[key] ?? translations.fr[key] ?? key;
    if (typeof raw !== "string") return raw;
    // Remplace STRYKOS par le nom actuel de la marque
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
    swrGetShared("/settings", (d) => setSettings(d), { ttl: 2 * 60 * 1000 }).catch(() => {});
  }, []);

  // ---- auth ----
  const [user, setUserState] = useState(() => {
    try { return localStorage.getItem("strykos_token") ? JSON.parse(localStorage.getItem("strykos_user") || "null") : null; } catch { return null; }
  });
  const setUser = (u) => { setUserState(u); if (u) localStorage.setItem("strykos_user", JSON.stringify(u)); else localStorage.removeItem("strykos_user"); };
  const [authChecked, setAuthChecked] = useState(() => !localStorage.getItem("strykos_token"));

  // Fusionne 2 paniers : si meme variant_id + customization, on additionne les quantites
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

  // Charge le panier serveur et fusionne avec le panier local (invite)
  const loadServerCartAndMerge = async () => {
    try {
      const { data } = await api.get("/cart");
      const serverItems = data?.cart?.items || [];
      const localItems = JSON.parse(localStorage.getItem("strykos_cart") || "[]");

      // Cas 1 : rien nulle part → on ne fait rien
      if (serverItems.length === 0 && localItems.length === 0) return;

      // Cas 2 : serveur vide, local non vide → on pousse le local au serveur
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

      // Cas 3 : serveur non vide, local vide → on charge le serveur
      if (serverItems.length > 0 && localItems.length === 0) {
        setCart(serverItems);
        return;
      }

      // Cas 4 : les 2 non vides → on compare pour eviter la double-fusion
      // Si identiques (meme items, memes quantites) → on garde juste le serveur
      const same = JSON.stringify(
        [...serverItems].sort((a, b) => (a.variant_id || "").localeCompare(b.variant_id || ""))
      ) === JSON.stringify(
        [...localItems].sort((a, b) => (a.variant_id || "").localeCompare(b.variant_id || ""))
      );
      if (same) {
        setCart(serverItems);
        return;
      }

      // Sinon : fusion reelle (vrai cas "invite avait un panier, user connecte en a un aussi")
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
      // silencieux : si le serveur ne repond pas, on garde le panier local
    }
  };

  useEffect(() => {
    const tk = localStorage.getItem("strykos_token");
    if (!tk) { setAuthChecked(true); return; }
    api.get("/auth/me")
      .then((r) => {
        setUser(r.data);
        // Charge le panier serveur apres avoir identifie le user
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
    setAuthToken(data.token); setUser(data.user); return data.user;
  };
  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (e) {}
    setAuthToken(null);
    setUser(null);
    setWishlist([]);
    localStorage.removeItem("strykos_wishlist");
    // On vide le panier local au logout : le panier reste sur le serveur
    // et sera rechargé à la prochaine connexion (evite les doublons par fusion)
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

  // ---- Sync du panier vers le serveur (si user connecte) avec debounce ----
  const cartSyncRef = useRef(null);
  useEffect(() => {
    if (!user) return;
    // Debounce : attend 1.5s apres la derniere modif du panier
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
    settings, brand, applyBrand,
    user, authChecked, login, register, logout,
    wishlist, toggleWishlist, loadWishlist,
    cart, cartCount, addToCart, updateQty, removeFromCart, clearCart, cartUnitPrice, cartSubtotal,
  };

  // Met a jour le titre de l'onglet navigateur
  useEffect(() => {
    if (brand.full) document.title = brand.full;
  }, [brand.full]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}