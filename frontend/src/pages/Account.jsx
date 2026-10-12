import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { LayoutDashboard, Package, MapPin, User, LogOut, ShieldCheck, Truck, RefreshCw, XCircle, AlertTriangle, Eye, EyeOff, Clock, RotateCcw, CheckCircle2 } from "lucide-react";
import { OrderTimeline } from "@/components/OrderTimeline";
import { COUNTRIES_MAP, countryName } from "@/lib/countries";
import { RETURN_REASONS, isStrykosExpense } from "@/lib/returnReasons";
import PasswordStrength from "@/components/PasswordStrength";

export default function Account() {
  const { t, lang, user, logout, settings, clearCart, addToCart, setUser, applyBrand } = useStore();
  const nav = useNavigate();
  const [tab, setTab] = useState("dashboard");
  const [orders, setOrders] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [news, setNews] = useState(null);
  const [busyOrder, setBusyOrder] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [requestCancel, setRequestCancel] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [includeHidden, setIncludeHidden] = useState(false);
  const [ordersFilter, setOrdersFilter] = useState(""); // "" | "paid" | ...

  // --- Retours ---
  const [requestReturn, setRequestReturn] = useState(null);   // commande concernee
  const [returnStep, setReturnStep] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState({}); // { "pid|vid": true }
  const [productReasons, setProductReasons] = useState({});     // { "pid|vid": "defect" }
  const [returnType, setReturnType] = useState("refund");       // refund | exchange
  const [exchangeVariants, setExchangeVariants] = useState({});      // { product_id: { product, variants } }
  const [selectedExchangeVariant, setSelectedExchangeVariant] = useState({}); // { product_id: variant_id }
  const [returnGeneralReason, setReturnGeneralReason] = useState("");
  const [returnBusy, setReturnBusy] = useState(false);
  const [markShippedOrder, setMarkShippedOrder] = useState(null);
  const [returnTracking, setReturnTracking] = useState("");

  // --- Paramètres compte ---
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: "", newPwd: "", confirm: "" });
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [emailForm, setEmailForm] = useState({ password: "", newEmail: "" });
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteForm, setDeleteForm] = useState({ password: "", confirm: "" });
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState(null);   // { old_email, new_email, old_confirmed, new_confirmed, expires_at }
  const [cartRemindersOptOut, setCartRemindersOptOut] = useState(false);

  useEffect(() => { if (user) api.get("/newsletter/status").then((r) => setNews(r.data)).catch(() => {}); }, [user]);
  const toggleNews = async () => {
    try {
      if (news?.subscribed) { await api.post("/newsletter/unsubscribe", {}); setNews({ ...news, subscribed: false }); toast.success(t("newsletterOff")); }
      else { await api.post("/newsletter/subscribe", { email: user.email, lang, source: "account" }); setNews({ ...news, subscribed: true }); toast.success(t("newsletterOk")); }
    } catch (e) { toast.error(apiError(e)); }
  };

  const toggleCartReminders = async () => {
    const newVal = !cartRemindersOptOut;
    setCartRemindersOptOut(newVal);
    try {
      await api.post("/cart/opt-out", { opt_out: newVal });
      toast.success(
        lang === "fr"
          ? (newVal ? "Relances désactivées" : "Relances activées")
          : (newVal ? "Reminders disabled" : "Reminders enabled")
      );
    } catch (e) {
      setCartRemindersOptOut(!newVal); // rollback
      toast.error(apiError(e));
    }
  };

  const [profile, setProfile] = useState({ first_name: user.first_name, last_name: user.last_name, phone: user.phone });

  // Sync le formulaire quand user change (ex: après change-email/refresh)
  useEffect(() => {
    if (user) {
      setProfile({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        phone: user.phone || "",
      });
    }
  }, [user?.id, user?.first_name, user?.last_name, user?.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const [newAddr, setNewAddr] = useState({ label: "", address_line: "", city: "", country: "ML", postal_code: "", first_name: user.first_name, last_name: user.last_name, phone: user.phone });

  const reloadOrders = () => api.get("/orders").then((r) => setOrders(r.data)).catch(() => {});

  useEffect(() => {
    reloadOrders();
    api.get("/auth/addresses").then((r) => setAddresses(r.data)).catch(() => {});
    api.get("/auth/me").then((r) => { if (typeof setUser === "function") setUser(r.data); }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Charge la demande de changement d'email en cours
  const loadPendingEmail = () => {
    if (!user) return;
    api.get("/auth/pending-email-change")
      .then((r) => setPendingEmail(r.data.pending || null))
      .catch(() => setPendingEmail(null));
  };
  useEffect(() => { loadPendingEmail(); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Charge la préférence de relance panier
  useEffect(() => {
    if (!user) return;
    api.get("/cart")
      .then((r) => setCartRemindersOptOut(!!r.data?.reminder_opt_out))
      .catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detecte le retour depuis un lien d'annulation (?cancel_email_change=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("cancel_email_change") === "1") {
      api.post("/auth/cancel-email-change").then(() => {
        setPendingEmail(null);
        toast.success(lang === "fr" ? "Changement d'email annule" : "Email change cancelled");
        window.history.replaceState({}, "", "/account");
      }).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const money = (v, cur) => cur === "XOF" ? `${Math.round(v).toLocaleString("fr-FR")} FCFA` : cur === "USD" ? `$${v.toFixed(2)}` : `${v.toFixed(2)} €`;

  const saveProfile = async () => {
    try {
      const { data } = await api.put("/auth/me", profile);
      // Synchronise le store + localStorage
      if (typeof setUser === "function") setUser(data);
      setProfile({
        first_name: data.first_name || "",
        last_name: data.last_name || "",
        phone: data.phone || "",
      });
      toast.success(t("save"));
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  // --- Changement mot de passe ---
  const submitChangePwd = async () => {
    if (!pwdForm.current || !pwdForm.newPwd || !pwdForm.confirm) {
      return toast.error(lang === "fr" ? "Remplissez tous les champs" : "Fill all fields");
    }
    if (pwdForm.newPwd.length < 8) {
      return toast.error(lang === "fr" ? "Minimum 8 caracteres" : "Minimum 8 characters");
    }
    if (pwdForm.newPwd !== pwdForm.confirm) {
      return toast.error(lang === "fr" ? "Les mots de passe ne correspondent pas" : "Passwords do not match");
    }
    setSettingsBusy(true);
    try {
      await api.post("/auth/change-password", {
        current_password: pwdForm.current,
        new_password: pwdForm.newPwd,
      });
      toast.success(lang === "fr" ? "Mot de passe modifie" : "Password updated");
      setShowChangePwd(false);
      setPwdForm({ current: "", newPwd: "", confirm: "" });
    } catch (e) {
      toast.error(apiError(e));
    }
    setSettingsBusy(false);
  };

  // --- Changement email (double confirmation) ---
  const submitChangeEmail = async () => {
    if (!emailForm.password || !emailForm.newEmail) {
      return toast.error(lang === "fr" ? "Remplissez tous les champs" : "Fill all fields");
    }
    if (emailForm.newEmail.toLowerCase() === (user.email || "").toLowerCase()) {
      return toast.error(lang === "fr" ? "C'est votre email actuel" : "This is your current email");
    }
    setSettingsBusy(true);
    try {
      await api.post("/auth/request-email-change", {
        password: emailForm.password,
        new_email: emailForm.newEmail,
      });
      toast.success(
        lang === "fr"
          ? "2 emails envoyes. Confirmez depuis vos deux adresses."
          : "2 emails sent. Confirm from both addresses.",
        { duration: 7000 }
      );
      setShowChangeEmail(false);
      setEmailForm({ password: "", newEmail: "" });
      loadPendingEmail();
    } catch (e) {
      toast.error(apiError(e));
    }
    setSettingsBusy(false);
  };

  const cancelPendingEmail = async () => {
    if (!window.confirm(lang === "fr" ? "Annuler le changement d'email en cours ?" : "Cancel the pending email change?")) return;
    try {
      await api.post("/auth/cancel-email-change");
      toast.success(lang === "fr" ? "Changement annule" : "Change cancelled");
      loadPendingEmail();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  // --- Suppression compte ---
  const submitDeleteAccount = async () => {
    if (!deleteForm.password) {
      return toast.error(lang === "fr" ? "Mot de passe requis" : "Password required");
    }
    if ((deleteForm.confirm || "").trim().toUpperCase() !== "SUPPRIMER") {
      return toast.error(lang === "fr" ? "Tapez SUPPRIMER pour confirmer" : "Type SUPPRIMER to confirm");
    }
    setSettingsBusy(true);
    try {
      await api.delete("/auth/me", {
        data: { password: deleteForm.password, confirm: deleteForm.confirm },
      });
      toast.success(lang === "fr" ? "Compte supprime" : "Account deleted");
      logout();
      nav("/");
    } catch (e) {
      toast.error(apiError(e));
      setSettingsBusy(false);
    }
  };

  const addAddress = async () => {
    try { const { data } = await api.post("/auth/addresses", newAddr); setAddresses([...addresses, data]); toast.success(t("save")); }
    catch { toast.error("Error"); }
  };
  const delAddress = async (id) => {
    await api.delete(`/auth/addresses/${id}`); setAddresses(addresses.filter((a) => a.id !== id));
  };

  // --- Actions commande ---
  const retryPayment = async (orderNumber) => {
    setBusyOrder(orderNumber);
    try {
      const { data } = await api.post(`/orders/${orderNumber}/retry-payment`, { origin_url: window.location.origin });
      if (data.checkout_url) window.location.href = data.checkout_url;
      else { toast.error(lang === "fr" ? "Impossible de creer la session" : "Could not create session"); setBusyOrder(null); }
    } catch (e) { toast.error(apiError(e)); setBusyOrder(null); }
  };

  const cancelOrder = async (orderNumber) => {
    setBusyOrder(orderNumber);
    try {
      await api.post(`/orders/${orderNumber}/cancel`);
      toast.success(lang === "fr" ? "Commande annulee" : "Order cancelled");
      setConfirmCancel(null); clearCart(); reloadOrders();
    } catch (e) { toast.error(apiError(e)); }
    setBusyOrder(null);
  };

  const requestCancellation = async (orderNumber) => {
    setBusyOrder(orderNumber);
    try {
      await api.post(`/orders/${orderNumber}/request-cancellation`, { reason: cancelReason });
      toast.success(lang === "fr" ? "Demande envoyee" : "Request sent");
      setRequestCancel(null); setCancelReason(""); reloadOrders();
    } catch (e) { toast.error(apiError(e)); }
    setBusyOrder(null);
  };

  const hideOrder = async (orderNumber) => {
    setBusyOrder(orderNumber);
    try { await api.post(`/orders/${orderNumber}/hide`); toast.success(lang === "fr" ? "Retiree de votre historique" : "Removed"); reloadOrders(); }
    catch (e) { toast.error(apiError(e)); }
    setBusyOrder(null);
  };

  const unhideOrder = async (orderNumber) => {
    setBusyOrder(orderNumber);
    try { await api.post(`/orders/${orderNumber}/unhide`); toast.success(lang === "fr" ? "Commande reaffichee" : "Order restored"); reloadOrders(); }
    catch (e) { toast.error(apiError(e)); }
    setBusyOrder(null);
  };

  const reorder = async (order) => {
    if (!order?.items?.length) return;
    setBusyOrder(order.order_number);
    let added = 0, unavailable = 0;
    for (const it of order.items) {
      try {
        const slug = it.slug;
        if (!slug) { unavailable++; continue; }
        const { data: p } = await api.get(`/products/${slug}`);
        const variant = (p.variants || []).find((v) => v.size === it.size && v.stock > 0) || (p.variants || []).find((v) => v.stock > 0);
        if (!variant) { unavailable++; continue; }
        const img = (p.images && p.images[0]) || it.image || "";
        const priceEur = p.sale_price_eur ?? p.price_eur ?? 0;
        addToCart({
          product_id: p.id, variant_id: variant.id, quantity: it.quantity || 1,
          customization: it.customization || null, name_fr: p.name_fr, name_en: p.name_en,
          slug: p.slug, size: variant.size, image: img,
          prices: p.prices || { EUR: { price: priceEur } },
          extra_price_eur: variant.extra_price_eur || 0,
          customization_price_eur: p.customization_price_eur || 0,
        });
        added++;
      } catch { unavailable++; }
    }
    setBusyOrder(null);
    if (added > 0) {
      toast.success(lang === "fr" ? `${added} article(s) ajoute(s)${unavailable > 0 ? ` (${unavailable} indisponible(s))` : ""}` : `${added} item(s) added${unavailable > 0 ? ` (${unavailable} unavailable)` : ""}`);
      nav("/cart");
    } else {
      toast.error(lang === "fr" ? "Aucun article disponible" : "No item available");
    }
  };

  // --- Retours ---
  const canRequestReturn = (o) => {
    if (o.status !== "delivered" || o.payment_status !== "paid") return false;
    if (["return_requested", "return_approved", "return_shipped", "return_received", "returned", "refunded", "exchange_sent"].includes(o.status)) return false;
    if (!o.delivered_at) return false;
    const age = (Date.now() - new Date(o.delivered_at).getTime()) / (1000 * 60 * 60 * 24);
    return age <= 14;
  };

  const openReturnModal = (order) => {
    setRequestReturn(order);
    setReturnStep(1);
    setSelectedProducts({});
    setProductReasons({});
    setReturnType("refund");
    setReturnGeneralReason("");
    setExchangeVariants({});
    setSelectedExchangeVariant({});
  };

  const toggleProductSelection = (it) => {
    const key = `${it.product_id}|${it.variant_id || ""}`;
    setSelectedProducts((p) => ({ ...p, [key]: !p[key] }));
    if (!productReasons[key]) {
      setProductReasons((p) => ({ ...p, [key]: "defect" }));
    }
  };

  const setProductReason = (key, reason) => {
    setProductReasons((p) => ({ ...p, [key]: reason }));
  };

  // Charge les variantes de tous les produits retournés (pour échange)
  const loadExchangeVariants = async () => {
    if (!requestReturn) return;
    const toLoad = [];
    for (const it of (requestReturn.items || [])) {
      const key = `${it.product_id}|${it.variant_id || ""}`;
      if (!selectedProducts[key]) continue;
      if (exchangeVariants[it.product_id]) continue;
      if (!it.slug) continue;
      toLoad.push(it);
    }
    for (const it of toLoad) {
      try {
        const { data: p } = await api.get(`/products/${it.slug}`);
        setExchangeVariants((prev) => ({
          ...prev,
          [it.product_id]: {
            product: p,
            variants: (p.variants || []).filter((v) => v.stock > 0),
          },
        }));
      } catch {
        // ignore
      }
    }
  };

  // Auto-load quand on passe en exchange
  React.useEffect(() => {
    if (requestReturn && returnType === "exchange" && returnStep === 2) {
      loadExchangeVariants();
    }
  }, [returnType, returnStep, requestReturn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calcul diff de prix pour un produit
  const computeExchangeDiff = (productId) => {
    if (!exchangeVariants[productId] || !requestReturn) return null;
    const { product, variants } = exchangeVariants[productId];
    const selectedVariantId = selectedExchangeVariant[productId];
    if (!selectedVariantId) return null;
    const variant = variants.find((v) => v.id === selectedVariantId);
    if (!variant) return null;

    // Prix payé par le client pour ce produit
    let paidPrice = 0;
    for (const it of (requestReturn.items || [])) {
      if (it.product_id === productId) {
        paidPrice = parseFloat(it.unit_price || 0);
        break;
      }
    }

    // Prix cible
    const targetPrice = parseFloat(product.sale_price_eur || product.price_eur || 0)
      + parseFloat(variant.extra_price_eur || 0);

    return {
      target_price: targetPrice,
      paid_price: paidPrice,
      diff: Math.round((targetPrice - paidPrice) * 100) / 100,
      variant,
    };
  };

  // Différence totale
  const totalExchangeDiff = () => {
    let total = 0;
    for (const it of (requestReturn?.items || [])) {
      const key = `${it.product_id}|${it.variant_id || ""}`;
      if (!selectedProducts[key]) continue;
      const diff = computeExchangeDiff(it.product_id);
      if (diff) total += diff.diff;
    }
    return Math.round(total * 100) / 100;
  };

  const submitReturn = async () => {
    if (!requestReturn) return;
    const products = [];
    for (const it of (requestReturn.items || [])) {
      const key = `${it.product_id}|${it.variant_id || ""}`;
      if (selectedProducts[key]) {
        products.push({
          product_id: it.product_id,
          variant_id: it.variant_id,
          reason: productReasons[key] || "other",
        });
      }
    }
    if (products.length === 0) {
      toast.error(lang === "fr" ? "Selectionnez au moins un article" : "Select at least one item");
      return;
    }

    // Si echange : verifier que toutes les variantes sont selectionnees
    let exchange_variant_id = null;
    if (returnType === "exchange") {
      // On prend la 1ere variante (pour l'instant mono-produit)
      for (const it of (requestReturn.items || [])) {
        const key = `${it.product_id}|${it.variant_id || ""}`;
        if (!selectedProducts[key]) continue;
        const variantId = selectedExchangeVariant[it.product_id];
        if (!variantId) {
          toast.error(lang === "fr" ? "Selectionnez la nouvelle variante pour l'echange" : "Select the new variant for the exchange");
          return;
        }
        exchange_variant_id = variantId;
        break; // mono-produit
      }
    }

    setReturnBusy(true);
    try {
      const { data } = await api.post(`/orders/${requestReturn.order_number}/request-return`, {
        products,
        return_type: returnType,
        reason: returnGeneralReason,
        exchange_variant_id,
        origin_url: window.location.origin,
      });

      // Si un paiement de complement est requis -> redirection Stripe
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }

      toast.success(
        lang === "fr"
          ? `Demande envoyee · Code RMA : ${data.rma_code}`
          : `Request sent · RMA code: ${data.rma_code}`
      );
      setRequestReturn(null);
      reloadOrders();
    } catch (e) { toast.error(apiError(e)); }
    setReturnBusy(false);
  };

  const submitMarkShipped = async () => {
    if (!markShippedOrder || !returnTracking.trim()) {
      toast.error(lang === "fr" ? "Numero de suivi requis" : "Tracking number required");
      return;
    }
    setReturnBusy(true);
    try {
      await api.post(`/orders/${markShippedOrder.order_number}/mark-return-shipped`, {
        tracking_number: returnTracking.trim(),
      });
      toast.success(lang === "fr" ? "Expedition confirmee" : "Shipment confirmed");
      setMarkShippedOrder(null);
      setReturnTracking("");
      reloadOrders();
    } catch (e) { toast.error(apiError(e)); }
    setReturnBusy(false);
  };

  // --- Helpers affichage badges retour ---
  const returnBadge = (o) => {
    switch (o.status) {
      case "return_requested":
        return { label: lang === "fr" ? "Retour demande" : "Return requested", color: "bg-orange-100 text-orange-800 border-orange-300" };
      case "return_approved":
        return { label: lang === "fr" ? "Retour approuve · en attente d'envoi" : "Return approved · awaiting shipment", color: "bg-orange-100 text-orange-800 border-orange-300" };
      case "return_shipped":
        return { label: lang === "fr" ? "Colis retour en transit" : "Return parcel in transit", color: "bg-orange-100 text-orange-800 border-orange-300" };
      case "return_received":
        return { label: lang === "fr" ? "Retour recu · controle en cours" : "Return received · inspection", color: "bg-orange-200 text-orange-900 border-orange-400" };
      case "returned":
      case "refunded":
        return { label: lang === "fr" ? "Retourne · rembourse" : "Returned · refunded", color: "bg-gray-200 text-gray-700 border-gray-300" };
      case "exchange_sent":
        return { label: lang === "fr" ? "Echange envoye" : "Exchange sent", color: "bg-purple-100 text-purple-800 border-purple-300" };
      default:
        return null;
    }
  };

  const tabs = [
    { key: "dashboard", label: t("dashboard"), icon: LayoutDashboard },
    { key: "orders", label: t("myOrders"), icon: Package },
    { key: "addresses", label: t("myAddresses"), icon: MapPin },
    { key: "profile", label: t("profile"), icon: User },
  ];

  const visibleOrders = orders.filter((o) => {
    if (o.status === "cancelled") return false;
    if (!includeHidden && o.hidden_by_customer) return false;
    if (ordersFilter === "paid" && o.payment_status !== "paid") return false;
    return true;
  });
  const hiddenCount = orders.filter((o) => o.hidden_by_customer && o.status !== "cancelled").length;

  // Total selectionne pour retour
  const returnSelectionCount = Object.values(selectedProducts).filter(Boolean).length;

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
              <button
                onClick={() => { setOrdersFilter(""); setTab("orders"); }}
                className="border border-border p-5 text-left hover:border-ink hover:shadow-sm transition-all group"
                data-testid="stat-my-orders"
              >
                <div className="text-3xl font-bold">{visibleOrders.length}</div>
                <div className="text-sm text-ink-muted mt-1 flex items-center gap-1 group-hover:text-ink transition-colors">
                  {t("myOrders")}
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </div>
              </button>
              <button
                onClick={() => { setOrdersFilter("paid"); setTab("orders"); }}
                className="border border-border p-5 text-left hover:border-ink hover:shadow-sm transition-all group"
                data-testid="stat-paid-orders"
              >
                <div className="text-3xl font-bold">{orders.filter((o) => o.payment_status === "paid").length}</div>
                <div className="text-sm text-ink-muted mt-1 flex items-center gap-1 group-hover:text-ink transition-colors">
                  {lang === "fr" ? "Payees" : "Paid"}
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </div>
              </button>
              <button
                onClick={() => setTab("addresses")}
                className="border border-border p-5 text-left hover:border-ink hover:shadow-sm transition-all group"
                data-testid="stat-addresses"
              >
                <div className="text-3xl font-bold">{addresses.length}</div>
                <div className="text-sm text-ink-muted mt-1 flex items-center gap-1 group-hover:text-ink transition-colors">
                  {t("myAddresses")}
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </div>
              </button>
            </div>
          )}

          {tab === "orders" && (
            <div className="space-y-3" data-testid="orders-list">
              {ordersFilter && (
                <div className="flex items-center justify-between border border-ink/20 bg-secondary/60 px-4 py-2 text-xs">
                  <span>
                    <strong>{lang === "fr" ? "Filtre actif" : "Active filter"} : </strong>
                    {ordersFilter === "paid" && (lang === "fr" ? "Commandes payées" : "Paid orders")}
                  </span>
                  <button
                    onClick={() => setOrdersFilter("")}
                    className="text-brand font-semibold hover:underline"
                  >
                    {lang === "fr" ? "Effacer le filtre" : "Clear filter"}
                  </button>
                </div>
              )}

              {hiddenCount > 0 && (
                <div className="flex items-center justify-between border border-border bg-secondary/40 px-4 py-2 text-xs">
                  <span className="text-ink-muted">
                    {lang === "fr" ? `${hiddenCount} commande(s) masquee(s)` : `${hiddenCount} hidden order(s)`}
                  </span>
                  <button onClick={() => setIncludeHidden((v) => !v)}
                    className="font-semibold text-brand hover:underline inline-flex items-center gap-1" data-testid="toggle-hidden-orders">
                    {includeHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {includeHidden ? (lang === "fr" ? "Masquer les cachees" : "Hide hidden") : (lang === "fr" ? "Afficher les cachees" : "Show hidden")}
                  </button>
                </div>
              )}

              {visibleOrders.length === 0 && (
                <p className="text-ink-muted text-sm">{lang === "fr" ? "Aucune commande pour le moment." : "No orders yet."}</p>
              )}

              {visibleOrders.map((o) => {
                const isPending = o.status === "pending_payment" && o.payment_status === "pending";
                const isHidden = o.hidden_by_customer;
                const busy = busyOrder === o.order_number;
                const canRequestCancel = o.payment_status === "paid" && (o.status === "paid" || o.status === "preparing");
                const cancelInProgress = o.status === "cancellation_requested";
                const eligibleReturn = canRequestReturn(o);
                const rBadge = returnBadge(o);
                const isReturnFlow = ["return_requested", "return_approved", "return_shipped", "return_received"].includes(o.status);
                const isTerminal = ["cancelled", "refunded", "returned", "exchange_sent"].includes(o.status);

                return (
                  <div key={o.id}
                    className={`border p-4 ${isPending ? "border-amber-300 bg-amber-50/40" : cancelInProgress ? "border-red-300 bg-red-50/40" : isReturnFlow ? "border-orange-300 bg-orange-50/40" : isHidden ? "border-border bg-secondary/30 opacity-70" : "border-border"}`}
                    data-testid={`account-order-${o.order_number}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold flex items-center gap-2 flex-wrap">
                          {o.order_number}
                          {isHidden && <span className="text-[10px] uppercase tracking-wider bg-secondary px-1.5 py-0.5 text-ink-muted">{lang === "fr" ? "Masquee" : "Hidden"}</span>}
                          {cancelInProgress && <span className="text-[10px] uppercase tracking-wider bg-red-100 text-red-700 px-1.5 py-0.5">{lang === "fr" ? "Annulation demandee" : "Cancellation requested"}</span>}
                          {rBadge && <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 border ${rBadge.color}`}>{rBadge.label}</span>}
                        </div>
                        <div className="text-xs text-ink-muted">{new Date(o.created_at).toLocaleDateString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{money(o.total, o.currency)}</div>
                        <span className={`text-xs uppercase ${o.payment_status === "paid" ? "text-green-600" : o.payment_status === "refunded" ? "text-red-600" : "text-amber-600"}`}>{t(`st_${o.status}`)}</span>
                      </div>
                    </div>

                    <div className="mt-2 text-sm text-ink-soft">
                      {(o.items || []).map((it, i) => <span key={i}>{(lang === "fr" ? it.name_fr : it.name_en)} ({it.size}) x{it.quantity}{i < o.items.length - 1 ? ", " : ""}</span>)}
                    </div>

                    {o.tracking_number && <div className="mt-2 text-xs inline-flex items-center gap-1 text-cyan-700"><Truck className="w-3 h-3" /> {o.tracking_carrier} {o.tracking_number}</div>}

                    {/* Info retour */}
                    {o.return_rma_code && isReturnFlow && (
                      <div className="mt-3 text-xs bg-orange-50 border border-orange-200 p-3 text-orange-900">
                        <div className="inline-flex items-center gap-1.5 font-semibold mb-1">
                          <RotateCcw className="w-3.5 h-3.5" />
                          {lang === "fr" ? "Code RMA" : "RMA code"} : <span className="font-mono">{o.return_rma_code}</span>
                        </div>
                        {o.status === "return_requested" && <p>{lang === "fr" ? "Notre equipe examine votre demande. Vous recevrez une reponse sous 24 a 48 heures ouvrees." : "Our team is reviewing your request. You will receive a response within 24-48 business hours."}</p>}
                        {o.status === "return_approved" && <p>{lang === "fr" ? "Retour approuve. Imprimez l'etiquette depuis l'e-mail puis deposez le colis au point indique." : "Return approved. Print the label from the email, then drop off the parcel at the indicated point."}</p>}
                        {o.status === "return_shipped" && <p>{lang === "fr" ? "Colis en transit. Nous vous previendrons des reception." : "Parcel in transit. We'll notify you upon receipt."}</p>}
                        {o.status === "return_received" && <p>{lang === "fr" ? "Colis recu. Controle en cours (2 a 5 jours ouvres)." : "Parcel received. Inspection in progress (2-5 business days)."}</p>}
                        {o.return_tracking_number && <p className="mt-1">{lang === "fr" ? "Suivi client" : "Customer tracking"} : <span className="font-mono">{o.return_tracking_number}</span></p>}
                      </div>
                    )}

                    {/* Message annulation en cours */}
                    {cancelInProgress && (
                      <div className="mt-3 text-xs bg-red-50 border border-red-200 p-3 text-red-800">
                        <div className="inline-flex items-center gap-1.5 font-semibold mb-1"><Clock className="w-3.5 h-3.5" />{lang === "fr" ? "Annulation en cours d'examen" : "Cancellation under review"}</div>
                      </div>
                    )}

                    {/* Actions commande EN ATTENTE */}
                    {isPending && (
                      <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-amber-200">
                        <Button onClick={() => retryPayment(o.order_number)} disabled={busy}
                          className="bg-brand hover:bg-brand-dark text-white rounded-none text-xs uppercase font-bold inline-flex items-center gap-1.5 h-9"
                          data-testid={`retry-order-${o.order_number}`}>
                          <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
                          {lang === "fr" ? "Reprendre le paiement" : "Resume payment"}
                        </Button>
                        <Button variant="outline" onClick={() => setConfirmCancel(o)} disabled={busy}
                          className="rounded-none text-xs uppercase font-bold inline-flex items-center gap-1.5 h-9 text-red-600 border-red-200 hover:bg-red-50"
                          data-testid={`cancel-order-${o.order_number}`}>
                          <XCircle className="w-3.5 h-3.5" />
                          {lang === "fr" ? "Annuler" : "Cancel"}
                        </Button>
                      </div>
                    )}

                    {/* Actions commande TRAITEE */}
                    {!isPending && !isTerminal && (
                      <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-border items-center">
                        <Button onClick={() => reorder(o)} disabled={busy}
                          className="bg-ink hover:bg-ink/90 rounded-none text-xs uppercase font-bold inline-flex items-center gap-1.5 h-9"
                          data-testid={`reorder-order-${o.order_number}`}>
                          <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
                          {lang === "fr" ? "Recommander" : "Reorder"}
                        </Button>

                        {eligibleReturn && (
                          <button onClick={() => openReturnModal(o)} disabled={busy}
                            className="text-xs text-orange-700 hover:text-orange-800 font-semibold inline-flex items-center gap-1 h-9 px-2 border border-orange-200 hover:bg-orange-50"
                            data-testid={`request-return-${o.order_number}`}>
                            <RotateCcw className="w-3.5 h-3.5" />
                            {lang === "fr" ? "Demander un retour" : "Request a return"}
                          </button>
                        )}

                        {o.status === "return_approved" && (
                          <button onClick={() => { setMarkShippedOrder(o); setReturnTracking(""); }} disabled={busy}
                            className="text-xs text-white bg-orange-600 hover:bg-orange-700 font-semibold inline-flex items-center gap-1 h-9 px-3 rounded-none"
                            data-testid={`mark-return-shipped-${o.order_number}`}>
                            <Truck className="w-3.5 h-3.5" />
                            {lang === "fr" ? "J'ai envoye le colis" : "I shipped the parcel"}
                          </button>
                        )}

                        {!cancelInProgress && canRequestCancel && (
                          <button onClick={() => { setRequestCancel(o); setCancelReason(""); }} disabled={busy}
                            className="text-xs text-amber-700 hover:text-amber-800 font-semibold inline-flex items-center gap-1 h-9 px-2 border border-amber-200 hover:bg-amber-50"
                            data-testid={`request-cancel-${o.order_number}`}>
                            <XCircle className="w-3.5 h-3.5" />
                            {lang === "fr" ? "Demander l'annulation" : "Request cancellation"}
                          </button>
                        )}

                        {!isHidden ? (
                          <button onClick={() => hideOrder(o.order_number)} disabled={busy}
                            className="ml-auto text-xs text-ink-muted hover:text-ink font-semibold inline-flex items-center gap-1 h-9 px-2"
                            data-testid={`hide-order-${o.order_number}`}>
                            <EyeOff className="w-3.5 h-3.5" />
                            {lang === "fr" ? "Retirer de l'historique" : "Remove from history"}
                          </button>
                        ) : (
                          <button onClick={() => unhideOrder(o.order_number)} disabled={busy}
                            className="ml-auto text-xs text-brand hover:underline font-semibold inline-flex items-center gap-1 h-9 px-2"
                            data-testid={`unhide-order-${o.order_number}`}>
                            <Eye className="w-3.5 h-3.5" />
                            {lang === "fr" ? "Reafficher" : "Show in my history"}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Commandes terminales : juste masquer */}
                    {!isPending && isTerminal && (
                      <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-border">
                        {!isHidden ? (
                          <button onClick={() => hideOrder(o.order_number)} disabled={busy}
                            className="ml-auto text-xs text-ink-muted hover:text-ink font-semibold inline-flex items-center gap-1 h-9 px-2"
                            data-testid={`hide-order-${o.order_number}`}>
                            <EyeOff className="w-3.5 h-3.5" />
                            {lang === "fr" ? "Retirer de l'historique" : "Remove from history"}
                          </button>
                        ) : (
                          <button onClick={() => unhideOrder(o.order_number)} disabled={busy}
                            className="ml-auto text-xs text-brand hover:underline font-semibold inline-flex items-center gap-1 h-9 px-2"
                            data-testid={`unhide-order-${o.order_number}`}>
                            <Eye className="w-3.5 h-3.5" />
                            {lang === "fr" ? "Reafficher" : "Show in my history"}
                          </button>
                        )}
                      </div>
                    )}

                    <button onClick={() => setExpanded(expanded === o.id ? null : o.id)} className="mt-2 text-xs font-semibold text-brand hover:underline block" data-testid={`toggle-order-${o.order_number}`}>
                      {expanded === o.id ? t("hideDetails") : t("viewDetails")}
                    </button>
                    {expanded === o.id && <div className="mt-3"><OrderTimeline order={o} /></div>}
                  </div>
                );
              })}
            </div>
          )}

          {tab === "addresses" && (
            <div data-testid="addresses-tab">
              <div className="grid sm:grid-cols-2 gap-3 mb-6">
                {addresses.map((a) => (
                  <div key={a.id} className="border border-border p-4 text-sm">
                    <div className="font-semibold">{a.first_name} {a.last_name}</div>
                    <div className="text-ink-soft">{a.address_line}, {a.postal_code} {a.city}, {countryName(a.country, lang)}</div>
                    <button onClick={() => delAddress(a.id)} className="text-brand text-xs mt-2 hover:underline">{t("remove")}</button>
                  </div>
                ))}
                {addresses.length === 0 && <p className="text-sm text-ink-muted sm:col-span-2">{lang === "fr" ? "Aucune adresse enregistree." : "No saved address yet."}</p>}
              </div>
              <div className="border border-border p-4 grid sm:grid-cols-2 gap-3">
                <h3 className="sm:col-span-2 font-semibold">{t("addAddress")}</h3>
                <Input placeholder={t("address")} value={newAddr.address_line} onChange={(e) => setNewAddr({ ...newAddr, address_line: e.target.value })} />
                <Input placeholder={t("city")} value={newAddr.city} onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })} />
                <Input placeholder={t("postalCode")} value={newAddr.postal_code} onChange={(e) => setNewAddr({ ...newAddr, postal_code: e.target.value })} />
                <div>
                  <Label className="text-xs uppercase tracking-wider text-ink-muted">{t("country")}</Label>
                  <select value={newAddr.country} onChange={(e) => setNewAddr({ ...newAddr, country: e.target.value })}
                    className="mt-1 w-full border border-border h-10 px-3 bg-white text-sm" data-testid="new-address-country">
                    {Object.entries(COUNTRIES_MAP).map(([code, names]) => (
                      <option key={code} value={code}>{lang === "fr" ? names.fr : names.en}</option>
                    ))}
                  </select>
                </div>
                <Button onClick={addAddress} className="bg-ink hover:bg-ink/90 rounded-none sm:col-span-2">{t("save")}</Button>
              </div>
            </div>
          )}

          {tab === "profile" && (
            <div className="max-w-2xl space-y-6" data-testid="profile-tab">

              {/* Bandeau : changement d'email en cours */}
              {pendingEmail && (
                <div className="border-2 border-amber-300 bg-amber-50 p-5" data-testid="pending-email-banner">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-bold text-amber-900 mb-1">
                        {lang === "fr" ? "Changement d'email en cours" : "Email change in progress"}
                      </div>
                      <p className="text-xs text-amber-800 mb-3">
                        {lang === "fr"
                          ? `Un changement de ${pendingEmail.old_email} vers ${pendingEmail.new_email} est en attente. Confirmez depuis les 2 emails recus.`
                          : `A change from ${pendingEmail.old_email} to ${pendingEmail.new_email} is pending. Confirm from both received emails.`}
                      </p>
                      <div className="flex flex-wrap gap-2 mb-3 text-xs">
                        <span className={`px-2 py-1 border ${pendingEmail.old_confirmed ? "bg-green-100 border-green-300 text-green-800" : "bg-white border-amber-300 text-amber-800"}`}>
                          {pendingEmail.old_confirmed ? "✅" : "⏳"} {lang === "fr" ? "Ancien email" : "Old email"}
                        </span>
                        <span className={`px-2 py-1 border ${pendingEmail.new_confirmed ? "bg-green-100 border-green-300 text-green-800" : "bg-white border-amber-300 text-amber-800"}`}>
                          {pendingEmail.new_confirmed ? "✅" : "⏳"} {lang === "fr" ? "Nouvel email" : "New email"}
                        </span>
                      </div>
                      <button onClick={cancelPendingEmail} className="text-xs text-red-600 hover:underline font-semibold" data-testid="cancel-pending-email">
                        {lang === "fr" ? "Annuler le changement" : "Cancel change"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Section 1 — Informations personnelles */}
              <div className="border border-border p-5">
                <h3 className="font-heading font-bold uppercase text-sm mb-4">{lang === "fr" ? "Informations personnelles" : "Personal information"}</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div><Label>{t("firstName")}</Label><Input value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} className="mt-1" /></div>
                  <div><Label>{t("lastName")}</Label><Input value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} className="mt-1" /></div>
                  <div><Label>{t("phone")}</Label><Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="mt-1" /></div>
                  <div>
                    <Label>{t("email")}</Label>
                    <div className="flex gap-2 mt-1">
                      <Input value={user.email} disabled className="bg-secondary flex-1" />
                      <Button variant="outline" onClick={() => setShowChangeEmail(true)} className="rounded-none text-xs uppercase font-bold whitespace-nowrap" data-testid="open-change-email">
                        {lang === "fr" ? "Modifier" : "Change"}
                      </Button>
                    </div>
                  </div>
                </div>
                <Button onClick={saveProfile} data-testid="save-profile-btn" className="mt-4 bg-brand hover:bg-brand-dark rounded-none uppercase font-bold">
                  {t("save")}
                </Button>
              </div>

              {/* Section 2 — Sécurité */}
              <div className="border border-border p-5">
                <h3 className="font-heading font-bold uppercase text-sm mb-4">{lang === "fr" ? "Sécurité" : "Security"}</h3>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-semibold">{lang === "fr" ? "Mot de passe" : "Password"}</div>
                    <div className="text-xs text-ink-muted">{lang === "fr" ? "Modifiez votre mot de passe régulièrement pour plus de sécurité." : "Change your password regularly for better security."}</div>
                  </div>
                  <Button variant="outline" onClick={() => setShowChangePwd(true)} className="rounded-none text-xs uppercase font-bold" data-testid="open-change-pwd">
                    {lang === "fr" ? "Changer le mot de passe" : "Change password"}
                  </Button>
                </div>
              </div>

              {/* Section 3 — Newsletter */}
              <div className="border border-border p-5">
                <h3 className="font-heading font-bold uppercase text-sm mb-4">{lang === "fr" ? "Newsletter" : "Newsletter"}</h3>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-semibold">{news?.subscribed ? t("newsletterOn") : t("newsletterOff")}</div>
                    <div className="text-xs text-ink-muted">{lang === "fr" ? "Nouveautés, éditions limitées et codes promo." : "New releases, limited editions and promo codes."}</div>
                  </div>
                  <button onClick={toggleNews} className={`text-xs font-bold uppercase px-3 py-2 border ${news?.subscribed ? "border-border text-ink-muted hover:text-brand" : "bg-ink text-white border-ink"}`} data-testid="newsletter-toggle">
                    {news?.subscribed ? t("unsubscribe") : t("subscribe")}
                  </button>
                </div>
              </div>

              {/* Section 3.b — Relances panier abandonné */}
              <div className="border border-border p-5">
                <h3 className="font-heading font-bold uppercase text-sm mb-4">{lang === "fr" ? "Relances panier" : "Cart reminders"}</h3>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="max-w-md">
                    <div className="text-sm font-semibold">
                      {cartRemindersOptOut
                        ? (lang === "fr" ? "Désactivé" : "Disabled")
                        : (lang === "fr" ? "Activé" : "Enabled")}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {lang === "fr"
                        ? "Recevez un rappel par email si vous laissez des articles dans votre panier sans finaliser."
                        : "Get a reminder email if you leave items in your cart without checking out."}
                    </div>
                  </div>
                  <button
                    onClick={toggleCartReminders}
                    className={`text-xs font-bold uppercase px-3 py-2 border ${cartRemindersOptOut ? "bg-ink text-white border-ink" : "border-border text-ink-muted hover:text-brand"}`}
                    data-testid="cart-reminders-toggle"
                  >
                    {cartRemindersOptOut
                      ? (lang === "fr" ? "Activer" : "Enable")
                      : (lang === "fr" ? "Désactiver" : "Disable")}
                  </button>
                </div>
              </div>

              {/* Section 4 — Zone dangereuse */}
              <div className="border-2 border-red-200 p-5 bg-red-50/50">
                <h3 className="font-heading font-bold uppercase text-sm mb-2 text-red-700">{lang === "fr" ? "Zone dangereuse" : "Danger zone"}</h3>
                <p className="text-xs text-red-700/80 mb-3">
                  {lang === "fr"
                    ? "La suppression de votre compte est irréversible. Vos commandes passées sont conservées pour des raisons légales et comptables, mais votre profil sera définitivement supprimé."
                    : "Deleting your account is irreversible. Past orders are kept for legal and accounting reasons, but your profile will be permanently deleted."}
                </p>
                <button
                  type="button"
                  onClick={() => setShowDeleteAccount(true)}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase px-4 py-2 rounded-none inline-flex items-center gap-1.5"
                  data-testid="open-delete-account"
                >
                  <XCircle className="w-4 h-4" />
                  {lang === "fr" ? "Supprimer mon compte" : "Delete my account"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modale : Annuler commande pending */}
      {confirmCancel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setConfirmCancel(null)}>
          <div className="bg-white max-w-md w-full p-6 border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
              <div>
                <h3 className="font-bold text-lg mb-1">{lang === "fr" ? "Annuler la commande ?" : "Cancel order?"}</h3>
                <p className="text-sm text-ink-soft">
                  {lang === "fr" ? `La commande ${confirmCancel.order_number} sera supprimee de votre historique.` : `Order ${confirmCancel.order_number} will be removed from your history.`}
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmCancel(null)} className="px-4 py-2 border border-border text-xs font-bold uppercase hover:bg-secondary">{lang === "fr" ? "Garder" : "Keep"}</button>
              <button onClick={() => cancelOrder(confirmCancel.order_number)} disabled={busyOrder === confirmCancel.order_number}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase disabled:opacity-50" data-testid="confirm-cancel-order">
                {busyOrder === confirmCancel.order_number ? "..." : (lang === "fr" ? "Annuler la commande" : "Cancel order")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale : Demander l'annulation */}
      {requestCancel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setRequestCancel(null)}>
          <div className="bg-white max-w-md w-full p-6 border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
              <div>
                <h3 className="font-bold text-lg mb-1">{lang === "fr" ? "Demander l'annulation" : "Request cancellation"}</h3>
                <p className="text-sm text-ink-soft">
                  {lang === "fr" ? `Votre demande pour la commande ${requestCancel.order_number} sera examinee sous 24 a 48 heures ouvrees.` : `Your request for order ${requestCancel.order_number} will be reviewed within 24-48 business hours.`}
                </p>
              </div>
            </div>
            <Label className="text-xs uppercase tracking-wider text-ink-muted">{lang === "fr" ? "Raison (optionnel)" : "Reason (optional)"}</Label>
            <Textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              placeholder={lang === "fr" ? "Ex: changement d'avis..." : "E.g. change of mind..."} className="mt-1 rounded-none" data-testid="cancel-reason-input" />
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setRequestCancel(null)} className="px-4 py-2 border border-border text-xs font-bold uppercase hover:bg-secondary">{lang === "fr" ? "Annuler" : "Back"}</button>
              <button onClick={() => requestCancellation(requestCancel.order_number)} disabled={busyOrder === requestCancel.order_number}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold uppercase disabled:opacity-50" data-testid="confirm-request-cancel">
                {busyOrder === requestCancel.order_number ? "..." : (lang === "fr" ? "Envoyer la demande" : "Send request")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale : Demander un retour */}
      {requestReturn && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setRequestReturn(null)}>
          <div className="bg-white max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-lg">{lang === "fr" ? "Demander un retour" : "Request a return"}</h3>
                <button onClick={() => setRequestReturn(null)} className="text-ink-muted hover:text-ink"><XCircle className="w-5 h-5" /></button>
              </div>
              <p className="text-xs text-ink-muted">
                {lang === "fr" ? `Commande ${requestReturn.order_number} · Etape ${returnStep}/2` : `Order ${requestReturn.order_number} · Step ${returnStep}/2`}
              </p>
            </div>

            {/* ETAPE 1 : Sélection produits + raison */}
            {returnStep === 1 && (
              <div className="p-5 space-y-3">
                <p className="text-sm text-ink-soft">
                  {lang === "fr"
                    ? "Selectionnez les articles a retourner et indiquez un motif pour chacun."
                    : "Select the items to return and indicate a reason for each."}
                </p>
                {(requestReturn.items || []).map((it, i) => {
                  const key = `${it.product_id}|${it.variant_id || ""}`;
                  const selected = !!selectedProducts[key];
                  return (
                    <div key={i} className={`border p-3 ${selected ? "border-orange-400 bg-orange-50/40" : "border-border"}`}>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" checked={selected} onChange={() => toggleProductSelection(it)} className="mt-1 w-4 h-4" />
                        <div className="flex-1">
                          <div className="font-semibold text-sm">{lang === "fr" ? it.name_fr : it.name_en}</div>
                          <div className="text-xs text-ink-muted">{lang === "fr" ? "Taille" : "Size"} {it.size} · x{it.quantity}</div>
                        </div>
                      </label>
                      {selected && (
                        <div className="mt-3 pl-7">
                          <Label className="text-xs uppercase tracking-wider text-ink-muted">{lang === "fr" ? "Motif" : "Reason"}</Label>
                          <select value={productReasons[key] || "defect"} onChange={(e) => setProductReason(key, e.target.value)}
                            className="mt-1 w-full border border-border h-10 px-3 bg-white text-sm">
                            {RETURN_REASONS.map((r) => (
                              <option key={r.value} value={r.value}>{lang === "fr" ? r.label_fr : r.label_en}</option>
                            ))}
                          </select>
                          {isStrykosExpense(productReasons[key] || "defect") && (
                            <p className="text-[11px] text-green-700 mt-1">
                              {applyBrand(lang === "fr" ? "Frais de retour pris en charge par STRYKOS" : "Return costs covered by STRYKOS")}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ETAPE 2 : Type + raison globale + recap */}
            {returnStep === 2 && (
              <div className="p-5 space-y-4">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-ink-muted mb-2 block">
                    {lang === "fr" ? "Solution souhaitee" : "Requested solution"}
                  </Label>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <button type="button" onClick={() => setReturnType("refund")}
                      className={`p-3 border text-left text-sm ${returnType === "refund" ? "border-brand bg-brand/5" : "border-border hover:bg-secondary"}`}>
                      <div className="font-semibold">{lang === "fr" ? "Remboursement" : "Refund"}</div>
                      <div className="text-xs text-ink-muted">{lang === "fr" ? "Rembourse sur le moyen de paiement initial" : "Refunded to original payment method"}</div>
                    </button>
                    <button type="button" onClick={() => setReturnType("exchange")}
                      className={`p-3 border text-left text-sm ${returnType === "exchange" ? "border-brand bg-brand/5" : "border-border hover:bg-secondary"}`}>
                      <div className="font-semibold">{lang === "fr" ? "Echange" : "Exchange"}</div>
                      <div className="text-xs text-ink-muted">{lang === "fr" ? "Autre taille ou couleur du meme produit" : "Other size or color of the same product"}</div>
                    </button>
                  </div>
                </div>

                {/* Sélection de la variante d'échange */}
                {returnType === "exchange" && (
                  <div className="space-y-4 border-t border-border pt-4">
                    {(requestReturn.items || []).map((it) => {
                      const key = `${it.product_id}|${it.variant_id || ""}`;
                      if (!selectedProducts[key]) return null;
                      const data = exchangeVariants[it.product_id];
                      const diffInfo = computeExchangeDiff(it.product_id);
                      const isSelected = !!selectedExchangeVariant[it.product_id];

                      return (
                        <div key={it.product_id} className="border border-border p-4 bg-white">
                          <div className="text-sm font-semibold mb-1">{lang === "fr" ? it.name_fr : it.name_en}</div>
                          <div className="text-xs text-ink-muted mb-3">
                            {lang === "fr" ? "Taille actuelle" : "Current size"} : <strong>{it.size}</strong> · {lang === "fr" ? "Payé" : "Paid"} : {it.unit_price} €
                          </div>

                          {!data ? (
                            <div className="text-xs text-ink-muted italic">{lang === "fr" ? "Chargement des variantes..." : "Loading variants..."}</div>
                          ) : data.variants.length === 0 ? (
                            <div className="text-xs text-red-600">{lang === "fr" ? "Aucune variante disponible en stock." : "No variant available in stock."}</div>
                          ) : (
                            <>
                              <Label className="text-xs uppercase tracking-wider text-ink-muted">
                                {lang === "fr" ? "Choisir la nouvelle taille / couleur" : "Choose new size / color"}
                              </Label>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {data.variants.map((v) => {
                                  const isSel = selectedExchangeVariant[it.product_id] === v.id;
                                  const isCurrent = v.id === it.variant_id;
                                  return (
                                    <button
                                      key={v.id}
                                      type="button"
                                      onClick={() => {
                                        if (isCurrent) return;
                                        setSelectedExchangeVariant((s) => ({ ...s, [it.product_id]: v.id }));
                                      }}
                                      disabled={isCurrent}
                                      className={`px-3 py-2 border text-xs font-semibold ${isSel ? "border-brand bg-brand text-white" : isCurrent ? "border-border bg-secondary text-ink-muted cursor-not-allowed" : "border-border hover:border-brand"}`}
                                      title={isCurrent ? (lang === "fr" ? "Taille actuelle" : "Current size") : ""}
                                    >
                                      {v.size} {v.color && `· ${v.color}`}
                                      {v.extra_price_eur > 0 && ` (+${v.extra_price_eur}€)`}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Diff de prix */}
                              {diffInfo && (
                                <div className={`mt-3 p-3 text-sm border ${diffInfo.diff > 0 ? "bg-amber-50 border-amber-200 text-amber-900" : diffInfo.diff < 0 ? "bg-green-50 border-green-200 text-green-900" : "bg-secondary border-border"}`}>
                                  <div className="flex justify-between mb-1">
                                    <span>{lang === "fr" ? "Prix du nouveau" : "New price"} :</span>
                                    <span>{diffInfo.target_price.toFixed(2)} €</span>
                                  </div>
                                  <div className="flex justify-between mb-1">
                                    <span>{lang === "fr" ? "Prix payé" : "Price paid"} :</span>
                                    <span>{diffInfo.paid_price.toFixed(2)} €</span>
                                  </div>
                                  <div className="flex justify-between font-bold border-t border-current pt-1 mt-1">
                                    <span>{lang === "fr" ? "Différence" : "Difference"} :</span>
                                    <span>
                                      {diffInfo.diff > 0 && `+${diffInfo.diff.toFixed(2)} €`}
                                      {diffInfo.diff < 0 && `${diffInfo.diff.toFixed(2)} €`}
                                      {diffInfo.diff === 0 && "0.00 €"}
                                    </span>
                                  </div>
                                  <div className="text-[11px] mt-1 italic">
                                    {diffInfo.diff > 0 && (lang === "fr" ? "Vous devrez payer ce montant avant validation." : "You will pay this amount before validation.")}
                                    {diffInfo.diff < 0 && (lang === "fr" ? "Nous vous rembourserons ce montant à réception." : "We will refund this amount upon receipt.")}
                                    {diffInfo.diff === 0 && (lang === "fr" ? "Aucun paiement supplémentaire." : "No additional payment.")}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}

                    {/* Total */}
                    {totalExchangeDiff() !== 0 && (
                      <div className={`p-3 text-sm font-bold text-center border-2 ${totalExchangeDiff() > 0 ? "bg-amber-50 border-amber-400 text-amber-900" : "bg-green-50 border-green-400 text-green-900"}`}>
                        {totalExchangeDiff() > 0
                          ? `${lang === "fr" ? "Total à payer" : "Total to pay"} : +${totalExchangeDiff().toFixed(2)} €`
                          : `${lang === "fr" ? "Total à vous rembourser" : "Total to refund you"} : ${totalExchangeDiff().toFixed(2)} €`}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <Label className="text-xs uppercase tracking-wider text-ink-muted">
                    {lang === "fr" ? "Message (optionnel)" : "Message (optional)"}
                  </Label>
                  <Textarea rows={3} value={returnGeneralReason} onChange={(e) => setReturnGeneralReason(e.target.value)}
                    placeholder={lang === "fr" ? "Details supplementaires..." : "Additional details..."}
                    className="mt-1 rounded-none" />
                </div>

                <div className="bg-secondary/40 border border-border p-4 text-sm">
                  <div className="font-semibold mb-2">{lang === "fr" ? "Recapitulatif" : "Summary"}</div>
                  <div className="text-xs text-ink-soft space-y-1">
                    <div>{returnSelectionCount} {lang === "fr" ? "article(s) a retourner" : "item(s) to return"}</div>
                    <div>{lang === "fr" ? "Solution" : "Solution"} : <strong>{returnType === "refund" ? (lang === "fr" ? "Remboursement" : "Refund") : (lang === "fr" ? "Echange" : "Exchange")}</strong></div>
                    <p className="mt-2 text-ink-muted">
                      {lang === "fr"
                        ? "Un code RMA et une etiquette de retour vous seront envoyes par e-mail."
                        : "An RMA code and a return label will be sent to you by email."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Footer actions */}
            <div className="p-5 border-t border-border flex gap-2 justify-end">
              {returnStep === 2 && (
                <button onClick={() => setReturnStep(1)} className="px-4 py-2 border border-border text-xs font-bold uppercase hover:bg-secondary">
                  ← {lang === "fr" ? "Retour" : "Back"}
                </button>
              )}
              <button onClick={() => setRequestReturn(null)} className="px-4 py-2 border border-border text-xs font-bold uppercase hover:bg-secondary">
                {lang === "fr" ? "Annuler" : "Cancel"}
              </button>
              {returnStep === 1 ? (
                <button onClick={() => {
                  if (returnSelectionCount === 0) return toast.error(lang === "fr" ? "Selectionnez au moins un article" : "Select at least one item");
                  setReturnStep(2);
                }}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold uppercase">
                  {lang === "fr" ? "Suivant" : "Next"} →
                </button>
              ) : (
                <button onClick={submitReturn} disabled={returnBusy}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold uppercase disabled:opacity-50"
                  data-testid="submit-return">
                  {returnBusy ? "..." : (lang === "fr" ? "Envoyer la demande" : "Send request")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modale : J'ai envoyé le colis retour */}
      {markShippedOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setMarkShippedOrder(null)}>
          <div className="bg-white max-w-md w-full p-6 border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <Truck className="w-6 h-6 text-orange-600 shrink-0" />
              <div>
                <h3 className="font-bold text-lg mb-1">{lang === "fr" ? "Confirmer l'envoi" : "Confirm shipment"}</h3>
                <p className="text-sm text-ink-soft">
                  {lang === "fr"
                    ? `Indiquez le numero de suivi de votre colis retour pour la commande ${markShippedOrder.order_number}.`
                    : `Enter the tracking number of your return parcel for order ${markShippedOrder.order_number}.`}
                </p>
              </div>
            </div>
            <Label className="text-xs uppercase tracking-wider text-ink-muted">{lang === "fr" ? "Numero de suivi" : "Tracking number"}</Label>
            <Input value={returnTracking} onChange={(e) => setReturnTracking(e.target.value)}
              placeholder="Ex: 6A12345678901" className="mt-1 font-mono rounded-none" data-testid="return-tracking-input" />
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setMarkShippedOrder(null)} className="px-4 py-2 border border-border text-xs font-bold uppercase hover:bg-secondary">
                {lang === "fr" ? "Annuler" : "Cancel"}
              </button>
              <button onClick={submitMarkShipped} disabled={returnBusy || !returnTracking.trim()}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold uppercase disabled:opacity-50"
                data-testid="confirm-mark-shipped">
                {returnBusy ? "..." : (lang === "fr" ? "Confirmer" : "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale : Changer mot de passe */}
      {showChangePwd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowChangePwd(false)}>
          <div className="bg-white max-w-md w-full p-6 border border-border" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-1">{lang === "fr" ? "Changer le mot de passe" : "Change password"}</h3>
            <p className="text-xs text-ink-muted mb-4">{lang === "fr" ? "Saisissez votre mot de passe actuel puis votre nouveau mot de passe." : "Enter your current password then your new password."}</p>

            <Label className="text-xs uppercase tracking-wider text-ink-muted">{lang === "fr" ? "Mot de passe actuel" : "Current password"}</Label>
            <Input type="password" value={pwdForm.current} onChange={(e) => setPwdForm({ ...pwdForm, current: e.target.value })} className="mt-1 rounded-none" data-testid="current-password-input" />

            <Label className="text-xs uppercase tracking-wider text-ink-muted mt-3">{lang === "fr" ? "Nouveau mot de passe" : "New password"}</Label>
            <Input type="password" value={pwdForm.newPwd} onChange={(e) => setPwdForm({ ...pwdForm, newPwd: e.target.value })} className="mt-1 rounded-none" data-testid="new-password-input" />
            <PasswordStrength password={pwdForm.newPwd} lang={lang} />

            <Label className="text-xs uppercase tracking-wider text-ink-muted mt-3">{lang === "fr" ? "Confirmer" : "Confirm"}</Label>
            <Input type="password" value={pwdForm.confirm} onChange={(e) => setPwdForm({ ...pwdForm, confirm: e.target.value })} className="mt-1 rounded-none" data-testid="confirm-password-input" />

            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setShowChangePwd(false)} className="px-4 py-2 border border-border text-xs font-bold uppercase hover:bg-secondary">
                {lang === "fr" ? "Annuler" : "Cancel"}
              </button>
              <button onClick={submitChangePwd} disabled={settingsBusy} className="px-4 py-2 bg-brand hover:bg-brand-dark text-white text-xs font-bold uppercase disabled:opacity-50" data-testid="submit-change-pwd">
                {settingsBusy ? "..." : (lang === "fr" ? "Enregistrer" : "Save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale : Changer email */}
      {showChangeEmail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowChangeEmail(false)}>
          <div className="bg-white max-w-md w-full p-6 border border-border" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-1">{lang === "fr" ? "Changer d'email" : "Change email"}</h3>
            <p className="text-xs text-ink-muted mb-4">
              {lang === "fr"
                ? `Email actuel : ${user.email}`
                : `Current email: ${user.email}`}
            </p>

            <Label className="text-xs uppercase tracking-wider text-ink-muted">{lang === "fr" ? "Mot de passe" : "Password"}</Label>
            <Input type="password" value={emailForm.password} onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })} className="mt-1 rounded-none" data-testid="email-password-input" />

            <Label className="text-xs uppercase tracking-wider text-ink-muted mt-3">{lang === "fr" ? "Nouvel email" : "New email"}</Label>
            <Input type="email" value={emailForm.newEmail} onChange={(e) => setEmailForm({ ...emailForm, newEmail: e.target.value })} className="mt-1 rounded-none" data-testid="new-email-input" />

            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setShowChangeEmail(false)} className="px-4 py-2 border border-border text-xs font-bold uppercase hover:bg-secondary">
                {lang === "fr" ? "Annuler" : "Cancel"}
              </button>
              <button onClick={submitChangeEmail} disabled={settingsBusy} className="px-4 py-2 bg-brand hover:bg-brand-dark text-white text-xs font-bold uppercase disabled:opacity-50" data-testid="submit-change-email">
                {settingsBusy ? "..." : (lang === "fr" ? "Enregistrer" : "Save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale : Supprimer compte */}
      {showDeleteAccount && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowDeleteAccount(false)}>
          <div className="bg-white max-w-md w-full p-6 border-2 border-red-300" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-lg mb-1 text-red-700">{lang === "fr" ? "Supprimer mon compte" : "Delete my account"}</h3>
                <p className="text-xs text-ink-soft">
                  {lang === "fr"
                    ? "Cette action est définitive. Votre profil, vos adresses, vos avis et votre wishlist seront supprimés. Vos commandes passées sont conservées."
                    : "This action is permanent. Your profile, addresses, reviews and wishlist will be deleted. Past orders are kept."}
                </p>
              </div>
            </div>

            <Label className="text-xs uppercase tracking-wider text-ink-muted">{lang === "fr" ? "Mot de passe" : "Password"}</Label>
            <Input type="password" value={deleteForm.password} onChange={(e) => setDeleteForm({ ...deleteForm, password: e.target.value })} className="mt-1 rounded-none" data-testid="delete-password-input" />

            <Label className="text-xs uppercase tracking-wider text-ink-muted mt-3">
              {lang === "fr" ? "Tapez SUPPRIMER pour confirmer" : "Type SUPPRIMER to confirm"}
            </Label>
            <Input value={deleteForm.confirm} onChange={(e) => setDeleteForm({ ...deleteForm, confirm: e.target.value })} placeholder="SUPPRIMER" className="mt-1 rounded-none uppercase" data-testid="delete-confirm-input" />

            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setShowDeleteAccount(false)} className="px-4 py-2 border border-border text-xs font-bold uppercase hover:bg-secondary">
                {lang === "fr" ? "Annuler" : "Cancel"}
              </button>
              <button onClick={submitDeleteAccount} disabled={settingsBusy} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase disabled:opacity-50" data-testid="submit-delete-account">
                {settingsBusy ? "..." : (lang === "fr" ? "Supprimer définitivement" : "Delete permanently")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}