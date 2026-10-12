import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, Tag, X, MapPin, Loader2, Save, Plus } from "lucide-react";
import { countryName, reverseGeocode } from "@/lib/countries";

export default function Checkout() {
  const { t, lang, currency, fmt, cart, cartSubtotal, user, settings, convertEur } = useStore();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [methodIndex, setMethodIndex] = useState(0);
  const [geoLoading, setGeoLoading] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);

  const [addresses, setAddresses] = useState([]);
  const [addressesLoaded, setAddressesLoaded] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const [form, setForm] = useState({
    first_name: user?.first_name || "",
    last_name: user?.last_name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    country: "ML",
    city: "",
    address_line: "",
    postal_code: "",
  });

  // Pays disponibles = settings.shipping.methods (dédupliqués)
  const availableCountries = useMemo(() => {
    const methods = settings?.shipping?.methods || [];
    const seen = new Map();
    methods.forEach((m) => {
      if (m.country && !seen.has(m.country)) {
        seen.set(m.country, { code: m.country });
      }
    });
    return Array.from(seen.values());
  }, [settings]);

  // Si le pays par défaut n'est pas dans la liste, prendre le 1er dispo
  useEffect(() => {
    if (availableCountries.length > 0 && !availableCountries.find((c) => c.code === form.country)) {
      setForm((f) => ({ ...f, country: availableCountries[0].code }));
    }
  }, [availableCountries]); // eslint-disable-line react-hooks/exhaustive-deps

  const shippingMethods = useMemo(
    () => (settings?.shipping?.methods || []).filter((m) => m.country === form.country),
    [settings, form.country]
  );
  const selectedMethod = shippingMethods[methodIndex] || { cost_eur: 15 };

  // Charger les adresses du user connecté
  useEffect(() => {
    if (!user) { setAddressesLoaded(true); return; }
    api.get("/auth/addresses")
      .then((r) => {
        const list = r.data || [];
        setAddresses(list);
        if (list.length === 1) {
          applyAddress(list[0]);
          setSelectedAddressId(list[0].id);
        } else if (list.length === 0) {
          setShowNewForm(true);
        }
      })
      .catch(() => {})
      .finally(() => setAddressesLoaded(true));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyAddress = (a) => {
    setForm((f) => ({
      ...f,
      first_name: a.first_name || f.first_name,
      last_name: a.last_name || f.last_name,
      phone: a.phone || f.phone,
      country: a.country || f.country,
      city: a.city || "",
      address_line: a.address_line || "",
      postal_code: a.postal_code || "",
    }));
    setSelectedAddressId(a.id);
    setShowNewForm(false);
    setMethodIndex(0);
  };

  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState(null);
  const [promoError, setPromoError] = useState("");
  const subtotalEur = cart.reduce((s, i) => s + ((i.prices?.EUR?.price ?? 0) + (i.extra_price_eur || 0) + (i.customization ? (i.customization_price_eur || 0) : 0)) * i.quantity, 0);
  const discountEur = promo ? (promo.discount_type === "percent" ? Math.round(subtotalEur * promo.value) / 100 : Math.min(promo.value, subtotalEur)) : 0;
  const discountDisplay = Math.min(convertEur(discountEur), cartSubtotal);
  const shippingDisplay = promo?.free_shipping ? 0 : convertEur(selectedMethod.cost_eur);
  const total = cartSubtotal - discountDisplay + shippingDisplay;

  const applyPromo = async () => {
    if (!promoInput.trim()) return;
    setPromoError("");
    try {
      const { data } = await api.post("/promo/check", { code: promoInput.trim(), subtotal_eur: subtotalEur, email: form.email || null });
      if (data.valid) { setPromo(data.promo); toast.success(`${t("promoApplied")}: ${data.promo.code}`); }
      else { setPromo(null); setPromoError(t(data.error) || t("promo_invalid")); }
    } catch (e) { setPromoError(apiError(e)); }
  };
  const chargeDifferent = !["EUR", "USD"].includes(currency);

  if (cart.length === 0) { nav("/cart"); return null; }

  const setF = (k, v) => setForm({ ...form, [k]: v });

  // --- Géolocalisation ---
  const isSecureContext = typeof window !== "undefined" && window.isSecureContext;

  const useMyLocation = () => {
    if (!isSecureContext) {
      toast.error(
        lang === "fr"
          ? "La géolocalisation n'est disponible qu'en HTTPS (ou sur localhost). Remplissez manuellement pour l'instant."
          : "Geolocation is only available over HTTPS (or localhost). Please fill in manually for now.",
        { duration: 6000 }
      );
      return;
    }
    if (!navigator.geolocation) {
      toast.error(lang === "fr" ? "Géolocalisation non supportée" : "Geolocation not supported");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { country, city } = await reverseGeocode(pos.coords.latitude, pos.coords.longitude, lang);
          if (!country) {
            toast.error(lang === "fr" ? "Impossible de déterminer le pays" : "Could not determine country");
            setGeoLoading(false);
            return;
          }
          const isAvailable = availableCountries.some((c) => c.code === country);
          if (!isAvailable) {
            toast.error(
              lang === "fr"
                ? `Nous ne livrons pas encore en ${countryName(country, lang)}`
                : `We don't ship to ${countryName(country, lang)} yet`,
              { duration: 5000 }
            );
            setGeoLoading(false);
            return;
          }
          setForm((f) => ({ ...f, country, city: city || f.city }));
          setMethodIndex(0);
          toast.success(lang === "fr" ? "Localisation appliquée" : "Location applied");
        } catch {
          toast.error(lang === "fr" ? "Erreur de localisation" : "Location error");
        }
        setGeoLoading(false);
      },
      (err) => {
        let msg = lang === "fr" ? "Accès à la position refusé" : "Location access denied";
        if (err.code === err.PERMISSION_DENIED) {
          msg = lang === "fr"
            ? "Vous avez refusé l'accès. Autorisez-le dans les paramètres du navigateur."
            : "You denied access. Allow it in browser settings.";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = lang === "fr" ? "Position indisponible" : "Position unavailable";
        } else if (err.code === err.TIMEOUT) {
          msg = lang === "fr" ? "Délai dépassé" : "Request timed out";
        }
        toast.error(msg, { duration: 5000 });
        setGeoLoading(false);
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  };

  const itemsPayload = cart.map((i) => ({
    product_id: i.product_id, variant_id: i.variant_id, quantity: i.quantity, customization: i.customization,
  }));
  const shippingPayload = { ...form };

  const validateStep0 = () => {
    for (const k of ["first_name", "last_name", "email", "phone", "city", "address_line"]) {
      if (!form[k]) { toast.error(lang === "fr" ? "Remplissez tous les champs" : "Fill all fields"); return false; }
    }
    return true;
  };

  const nextFromStep0 = async () => {
    if (!validateStep0()) return;
    if (saveAddress && user) {
      try {
        await api.post("/auth/addresses", {
          label: "",
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
          country: form.country,
          city: form.city,
          address_line: form.address_line,
          postal_code: form.postal_code,
          is_default: addresses.length === 0,
        });
        setSaveAddress(false);
      } catch {
        // Silencieux
      }
    }
    setStep(1);
  };

  // Compare 2 listes d'items (product_id + variant_id + quantity + customization)
  const itemsMatch = (a, b) => {
    if (!a || !b || a.length !== b.length) return false;
    const key = (it) => `${it.product_id}|${it.variant_id || ""}|${it.quantity}|${it.customization?.name || ""}|${it.customization?.number || ""}`;
    const setA = new Set(a.map(key));
    return b.every((it) => setA.has(key(it)));
  };

  const placeOrder = async () => {
    setLoading(true);
    try {
      // 1) Chercher une commande pending existante avec les memes items
      if (user) {
        try {
          const { data: myOrders } = await api.get("/orders");
          const pendingMatch = (myOrders || []).find((o) =>
            o.status === "pending_payment" &&
            o.payment_status === "pending" &&
            itemsMatch(o.items || [], itemsPayload)
          );
          if (pendingMatch) {
            const { data } = await api.post(`/orders/${pendingMatch.order_number}/retry-payment`, {
              origin_url: window.location.origin,
            });
            window.location.href = data.checkout_url;
            return;
          }
        } catch {
          // Silencieux : on continue avec la creation normale
        }
      }

      // 2) Sinon creer une nouvelle commande
      const { data } = await api.post("/checkout/create", {
        items: itemsPayload, currency, shipping: shippingPayload,
        shipping_method_index: methodIndex, origin_url: window.location.origin,
        promo_code: promo?.code || null, lang,
      });
      window.location.href = data.checkout_url;
    } catch (e) {
      toast.error(apiError(e));
      setLoading(false);
    }
  };

  const steps = [t("contactDetails"), t("shippingMethod"), t("review")];

  const showAddressPicker = user && addresses.length > 1 && !showNewForm;
  const showSavedBadge = user && addresses.length === 1 && selectedAddressId && !showNewForm;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8" data-testid="checkout-page">
      <h1 className="font-heading text-3xl font-bold uppercase tracking-tight mb-6">{t("checkout")}</h1>
      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-7 h-7 flex items-center justify-center text-xs font-bold ${i <= step ? "bg-brand text-white" : "bg-secondary text-ink-muted"}`}>
              {i < step ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-sm ${i <= step ? "text-ink font-semibold" : "text-ink-muted"}`}>{s}</span>
            {i < steps.length - 1 && <div className="w-8 h-px bg-border" />}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {step === 0 && (
            <div data-testid="step-contact">
              {/* Bouton géoloc */}
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={useMyLocation}
                  disabled={geoLoading || !isSecureContext}
                  title={!isSecureContext ? (lang === "fr" ? "Disponible uniquement en HTTPS" : "Available only over HTTPS") : ""}
                  className="rounded-none inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="use-location-btn"
                >
                  {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                  {lang === "fr" ? "Utiliser ma position" : "Use my location"}
                </Button>
                <span className="text-xs text-ink-muted">
                  {!isSecureContext
                    ? (lang === "fr" ? "Disponible en HTTPS (production)" : "Available over HTTPS (production)")
                    : (lang === "fr" ? "Pour pré-remplir le pays et la ville" : "To pre-fill country and city")}
                </span>
              </div>

              {/* Sélecteur d'adresses sauvegardées (2+) */}
              {showAddressPicker && (
                <div className="mb-5">
                  <div className="text-xs uppercase tracking-wider text-ink-muted mb-2">
                    {lang === "fr" ? "Choisissez une adresse" : "Choose an address"}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {addresses.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => applyAddress(a)}
                        className={`text-left border p-4 hover:border-brand transition-colors ${selectedAddressId === a.id ? "border-brand bg-brand/5" : "border-border"}`}
                        data-testid={`address-option-${a.id}`}
                      >
                        <div className="font-semibold text-sm">{a.first_name} {a.last_name}</div>
                        <div className="text-xs text-ink-soft mt-1">{a.address_line}</div>
                        <div className="text-xs text-ink-soft">{a.postal_code} {a.city}</div>
                        <div className="text-xs text-ink-muted mt-1">{countryName(a.country, lang)}</div>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setShowNewForm(true); setSelectedAddressId(null); }}
                      className="text-left border border-dashed border-border p-4 hover:border-brand transition-colors flex items-center gap-2 text-sm"
                      data-testid="address-option-new"
                    >
                      <Plus className="w-4 h-4" />
                      {lang === "fr" ? "Nouvelle adresse" : "New address"}
                    </button>
                  </div>

                  {/* Bouton Continuer */}
                  {selectedAddressId ? (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Button
                        onClick={() => { setShowNewForm(false); setStep(1); }}
                        data-testid="continue-with-address-btn"
                        className="bg-ink hover:bg-ink/90 rounded-none uppercase font-bold"
                      >
                        {lang === "fr" ? "Continuer avec cette adresse" : "Continue with this address"} →
                      </Button>
                      <button
                        type="button"
                        onClick={() => { setShowNewForm(true); setSelectedAddressId(null); setForm((f) => ({ ...f, city: "", address_line: "", postal_code: "" })); }}
                        className="text-xs text-brand font-semibold hover:underline"
                      >
                        {lang === "fr" ? "Modifier cette adresse" : "Edit this address"}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-ink-muted">
                      {lang === "fr" ? "Cliquez sur une adresse pour continuer" : "Click an address to continue"}
                    </p>
                  )}
                </div>
              )}

              {/* Badge "adresse enregistrée" si 1 seule */}
              {showSavedBadge && (
                <div className="mb-5 border border-green-200 bg-green-50 px-4 py-3 text-sm flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-green-800">
                    <Check className="w-4 h-4" />
                    {lang === "fr" ? "Adresse enregistrée pré-remplie" : "Saved address pre-filled"}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setShowNewForm(true); setSelectedAddressId(null); setForm((f) => ({ ...f, city: "", address_line: "", postal_code: "" })); }}
                    className="text-xs text-brand font-semibold hover:underline"
                  >
                    {lang === "fr" ? "Utiliser une autre adresse" : "Use another address"}
                  </button>
                </div>
              )}

              {/* Le formulaire */}
              {!showAddressPicker && (
                <div className="grid sm:grid-cols-2 gap-4">
                  {[["first_name", t("firstName")], ["last_name", t("lastName")], ["email", t("email")], ["phone", t("phone")]].map(([k, lbl]) => (
                    <div key={k}><Label>{lbl}</Label><Input value={form[k]} onChange={(e) => setF(k, e.target.value)} data-testid={`checkout-${k}`} className="mt-1" /></div>
                  ))}
                  <div>
                    <Label>{t("country")}</Label>
                    <select
                      value={form.country}
                      onChange={(e) => { setF("country", e.target.value); setMethodIndex(0); }}
                      className="mt-1 w-full border border-border h-10 px-3 bg-white"
                      data-testid="checkout-country"
                    >
                      {availableCountries.map((c) => (
                        <option key={c.code} value={c.code}>{countryName(c.code, lang)}</option>
                      ))}
                    </select>
                    {availableCountries.length === 0 && (
                      <p className="text-xs text-ink-muted mt-1">
                        {lang === "fr" ? "Aucun pays configuré (admin > Livraison)" : "No country configured (admin > Shipping)"}
                      </p>
                    )}
                  </div>
                  <div><Label>{t("city")}</Label><Input value={form.city} onChange={(e) => setF("city", e.target.value)} data-testid="checkout-city" className="mt-1" /></div>
                  <div className="sm:col-span-2"><Label>{t("address")}</Label><Input value={form.address_line} onChange={(e) => setF("address_line", e.target.value)} data-testid="checkout-address" className="mt-1" /></div>
                  <div><Label>{t("postalCode")}</Label><Input value={form.postal_code} onChange={(e) => setF("postal_code", e.target.value)} className="mt-1" /></div>

                  {user && !showSavedBadge && (
                    <div className="sm:col-span-2 flex items-center gap-2 text-sm pt-1">
                      <input
                        type="checkbox"
                        id="save-address"
                        checked={saveAddress}
                        onChange={(e) => setSaveAddress(e.target.checked)}
                        data-testid="save-address-checkbox"
                      />
                      <label htmlFor="save-address" className="cursor-pointer inline-flex items-center gap-1.5">
                        <Save className="w-3.5 h-3.5 text-ink-muted" />
                        {lang === "fr" ? "Enregistrer cette adresse pour mes prochaines commandes" : "Save this address for future orders"}
                      </label>
                    </div>
                  )}

                  <div className="sm:col-span-2 pt-2">
                    <Button
                      onClick={nextFromStep0}
                      data-testid="to-shipping-btn"
                      className="bg-ink hover:bg-ink/90 rounded-none uppercase font-bold"
                    >
                      {t("shippingMethod")} →
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div data-testid="step-shipping">
              <div className="space-y-3">
                {shippingMethods.length === 0 && <p className="text-sm text-ink-muted">{lang === "fr" ? "Livraison internationale appliquée." : "International shipping applied."}</p>}
                {shippingMethods.map((m, i) => (
                  <label key={i} className={`flex items-center justify-between border p-4 cursor-pointer ${methodIndex === i ? "border-brand" : "border-border"}`} data-testid={`shipping-method-${i}`}>
                    <div className="flex items-center gap-3">
                      <input type="radio" checked={methodIndex === i} onChange={() => setMethodIndex(i)} />
                      <div>
                        <div className="font-medium text-sm">{lang === "fr" ? m.name_fr : m.name_en}</div>
                        <div className="text-xs text-ink-muted">{lang === "fr" ? m.delay_fr : m.delay_en}</div>
                      </div>
                    </div>
                    <span className="font-semibold">{fmt(convertEur(m.cost_eur))}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-3 mt-6">
                <Button variant="outline" onClick={() => setStep(0)} className="rounded-none">←</Button>
                <Button onClick={() => setStep(2)} data-testid="to-review-btn" className="bg-ink hover:bg-ink/90 rounded-none uppercase font-bold">{t("review")} →</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div data-testid="step-review">
              <div className="space-y-3">
                {cart.map((i, idx) => {
                  const name = lang === "fr" ? i.name_fr : i.name_en;
                  return <div key={idx} className="flex gap-3 border border-border p-3">
                    <img src={i.image} alt="" className="w-14 h-16 object-cover" />
                    <div className="flex-1 text-sm">
                      <div className="font-medium">{name}</div>
                      <div className="text-xs text-ink-muted">{t("size")}: {i.size} · x{i.quantity}</div>
                      {/* PERSONNALISATION DESACTIVEE TEMPORAIREMENT */}
                      {false && i.customization && <div className="text-xs text-brand">{i.customization.name} {i.customization.number}</div>}
                    </div>
                  </div>;
                })}
              </div>
              <div className="mt-4 text-sm border border-border p-4">
                <div className="font-semibold mb-1">{t("address")}</div>
                <div className="text-ink-soft">
                  {form.first_name} {form.last_name}, {form.address_line}, {form.postal_code} {form.city}, {countryName(form.country, lang)}
                </div>
              </div>
              {chargeDifferent && (
                <div className="mt-4 bg-amber-50 border border-amber-200 p-4 text-sm" data-testid="payment-notice">
                  <strong>{t("paymentNotice")}: </strong>
                  {lang === "fr"
                    ? `Le paiement sera traité en EUR (équivalent de ${fmt(total)}). Stripe ne facture pas en XOF pour le moment.`
                    : `Payment will be processed in EUR (equivalent of ${fmt(total)}). Stripe does not charge in XOF yet.`}
                </div>
              )}
              <div className="flex gap-3 mt-6">
                <Button variant="outline" onClick={() => setStep(1)} className="rounded-none">←</Button>
                <Button onClick={placeOrder} disabled={loading} data-testid="place-order-btn"
                  className="flex-1 bg-brand hover:bg-brand-dark text-white rounded-none h-12 uppercase font-bold tracking-wide">
                  {loading ? t("loading") : `${t("payWithStripe")}`}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="border border-border p-5 h-fit" data-testid="checkout-summary">
          <h3 className="font-heading font-bold uppercase mb-4">{t("orderSummary")}</h3>
          <div className="flex justify-between text-sm py-1"><span>{t("subtotal")}</span><span>{fmt(cartSubtotal)}</span></div>
          {promo && <div className="flex justify-between text-sm py-1 text-green-700" data-testid="checkout-discount"><span>{t("discount")} ({promo.code})</span><span>-{fmt(discountDisplay)}</span></div>}
          <div className="flex justify-between text-sm py-1"><span>{t("shipping")}</span><span>{promo?.free_shipping ? <span className="text-green-700">{t("freeShipping")}</span> : fmt(shippingDisplay)}</span></div>
          <div className="mt-3 pt-3 border-t border-border" data-testid="promo-box">
            <Label className="text-xs uppercase tracking-wider">{t("promoCode")}</Label>
            {promo ? (
              <div className="flex items-center justify-between mt-1 bg-green-50 border border-green-200 px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-1 font-mono font-semibold text-green-800"><Tag className="w-3 h-3" /> {promo.code}</span>
                <button onClick={() => { setPromo(null); setPromoInput(""); }} className="text-ink-muted hover:text-ink" data-testid="remove-promo-btn"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex gap-2 mt-1">
                <Input value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && applyPromo()} placeholder="CODE" className="font-mono h-9" data-testid="promo-input" />
                <Button type="button" variant="outline" onClick={applyPromo} className="rounded-none h-9" data-testid="apply-promo-btn">{t("applyPromo")}</Button>
              </div>
            )}
            {promoError && <p className="text-xs text-brand mt-1" data-testid="promo-error">{promoError}</p>}
          </div>
          <div className="flex justify-between font-bold py-3 border-t border-border mt-2"><span>{t("total")}</span><span data-testid="checkout-total">{fmt(total)}</span></div>
          <div className="text-xs text-ink-muted mt-2">{currency !== "EUR" && currency !== "USD" ? (lang === "fr" ? "Facture en EUR" : "Billed in EUR") : ""}</div>
        </div>
      </div>
    </div>
  );
}