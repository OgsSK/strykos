import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Check, Tag, X, MapPin, Loader2, Save, Plus, Calendar, Minus, Trash2, Banknote, CreditCard } from "lucide-react";
import { countryName, reverseGeocode } from "@/lib/countries";
import { mediaSrc } from "@/lib/adminUtils";

export default function Checkout() {
  const {
    t, lang, currency, fmt, cart, cartSubtotal, cartUnitPrice, user, settings, convertEur,
    updateQty, removeFromCart,
  } = useStore();
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

  const [customerNote, setCustomerNote] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledSlot, setScheduledSlot] = useState("");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [closureInfo, setClosureInfo] = useState(null);

  // ⭐ Paiement à la livraison
  const [paymentMethod, setPaymentMethod] = useState("stripe"); // "stripe" | "cod"
  const [codStatus, setCodStatus] = useState(null); // { available, reason_fr, reason_en, extra_fee_xof, instructions_fr, instructions_en }

  const availableCountries = useMemo(() => {
    const methods = settings?.shipping?.methods || [];
    const seen = new Map();
    methods.forEach((m) => {
      if (m.country && !seen.has(m.country)) seen.set(m.country, { code: m.country });
    });
    return Array.from(seen.values());
  }, [settings]);

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

  const ordersCfg = settings?.orders || {};
  const minLeadHours = ordersCfg.min_lead_hours ?? 48;
  const maxAdvanceDays = ordersCfg.max_advance_days ?? 180;
  const timeSlots = ordersCfg.time_slots || [
    { value: "matin",      label_fr: "Matin (9h-12h)",       label_en: "Morning (9am-12pm)" },
    { value: "apres-midi", label_fr: "Après-midi (14h-18h)", label_en: "Afternoon (2pm-6pm)" },
    { value: "soir",       label_fr: "Soirée (18h-20h)",     label_en: "Evening (6pm-8pm)" },
  ];

  const { minDateStr, maxDateStr, minLeadHuman } = useMemo(() => {
    const now = new Date();
    const min = new Date(now.getTime() + minLeadHours * 3600 * 1000);
    const max = new Date(now.getTime() + maxAdvanceDays * 24 * 3600 * 1000);
    const fmtD = (d) => d.toISOString().slice(0, 10);
    let human;
    if (minLeadHours >= 24) {
      const days = Math.ceil(minLeadHours / 24);
      human = lang === "fr" ? `${days} jour${days > 1 ? "s" : ""}` : `${days} day${days > 1 ? "s" : ""}`;
    } else {
      human = lang === "fr" ? `${minLeadHours} heures` : `${minLeadHours} hours`;
    }
    return { minDateStr: fmtD(min), maxDateStr: fmtD(max), minLeadHuman: human };
  }, [minLeadHours, maxAdvanceDays, lang]);

  useEffect(() => {
    if (timeSlots.length > 0 && !scheduledSlot) setScheduledSlot(timeSlots[0].value);
    if (!scheduledDate && minDateStr) setScheduledDate(minDateStr);
  }, [timeSlots, minDateStr]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!scheduledDate) return;
    api.get(`/orders/available-slots?date=${scheduledDate}`)
      .then(({ data }) => {
        if (data.available) {
          setAvailableSlots(data.slots || []);
          setClosureInfo(null);
          if (!data.slots.find((s) => s.value === scheduledSlot)) {
            setScheduledSlot(data.slots[0]?.value || "");
          }
        } else {
          setAvailableSlots([]);
          setClosureInfo(data);
        }
      })
      .catch(() => {
        setAvailableSlots(timeSlots);
        setClosureInfo(null);
      });
  }, [scheduledDate]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Sous-total EUR (utilisé pour validation promo)
  const subtotalEur = cart.reduce((s, i) => {
    const base = i.prices?.EUR?.price ?? 0;
    const extra = i.extra_price_eur || 0;
    const custom = i.customization_price_eur || 0;
    return s + (base + extra + custom) * i.quantity;
  }, 0);

  const discountEur = promo ? (promo.discount_type === "percent" ? Math.round(subtotalEur * promo.value) / 100 : Math.min(promo.value, subtotalEur)) : 0;
  const discountDisplay = Math.min(convertEur(discountEur), cartSubtotal);
  const shippingDisplay = promo?.free_shipping ? 0 : convertEur(selectedMethod.cost_eur);
  const total = cartSubtotal - discountDisplay + shippingDisplay;

  // ⭐ Calcul du frais COD (si sélectionné)
  const codExtraFeeXof = codStatus?.available ? (codStatus.extra_fee_xof || 0) : 0;
  const codExtraFeeDisplay = paymentMethod === "cod"
    ? Math.round((codExtraFeeXof / 655.957) * (currency === "XOF" ? 655.957 : 1))
    : 0;
  const totalWithCod = total + codExtraFeeDisplay;

  // ⭐ Vérification disponibilité COD (déclenchée à chaque changement)
  useEffect(() => {
    if (step !== 2) return;
    if (cart.length === 0) return;

    const payload = {
      items: cart.map((i) => ({
        product_id: i.product_id,
        variant_id: i.variant_id,
        quantity: i.quantity,
        customization: i.customization,
      })),
      country: (form.country || "").toUpperCase(),
    };

    api.post("/checkout/cod-availability", payload)
      .then(({ data }) => {
        setCodStatus(data);
        if (paymentMethod === "cod" && !data.available) {
          setPaymentMethod("stripe");
        }
      })
      .catch(() => {
        setCodStatus({ available: false, reason_fr: "Indisponible", reason_en: "Unavailable" });
        if (paymentMethod === "cod") setPaymentMethod("stripe");
      });
  }, [step, form.country, cart.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPromo = async () => {
    if (!promoInput.trim()) return;
    setPromoError("");
    try {
      const { data } = await api.post("/promo/check", { code: promoInput.trim(), subtotal_eur: subtotalEur, email: form.email || null });
      if (data.valid) { setPromo(data.promo); toast.success(`${t("promoApplied")}: ${data.promo.code}`); }
      else { setPromo(null); setPromoError(t(data.error) || t("promo_invalid")); }
    } catch (e) { setPromoError(apiError(e)); }
  };

  if (cart.length === 0) {
    if (step === 2) {
      nav("/cart");
    }
    return null;
  }

  const setF = (k, v) => setForm({ ...form, [k]: v });

  const isSecureContext = typeof window !== "undefined" && window.isSecureContext;

  const useMyLocation = () => {
    if (!isSecureContext) {
      toast.error(lang === "fr"
        ? "La géolocalisation n'est disponible qu'en HTTPS (ou localhost)."
        : "Geolocation is only available over HTTPS (or localhost).",
        { duration: 6000 });
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
            toast.error(lang === "fr"
              ? `Nous ne livrons pas encore en ${countryName(country, lang)}`
              : `We don't ship to ${countryName(country, lang)} yet`, { duration: 5000 });
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
          msg = lang === "fr" ? "Vous avez refusé l'accès." : "You denied access.";
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
          first_name: form.first_name, last_name: form.last_name, phone: form.phone,
          country: form.country, city: form.city, address_line: form.address_line,
          postal_code: form.postal_code, is_default: addresses.length === 0,
        });
        setSaveAddress(false);
      } catch {}
    }
    setStep(1);
  };

  const itemsMatch = (a, b) => {
    if (!a || !b || a.length !== b.length) return false;
    const key = (it) => `${it.product_id}|${it.variant_id || ""}|${it.quantity}|${JSON.stringify(it.customization || {})}`;
    const setA = new Set(a.map(key));
    return b.every((it) => setA.has(key(it)));
  };

  const placeOrder = async () => {
    if (closureInfo) {
      toast.error(lang === "fr"
        ? (closureInfo.reason_fr || "Cette date n'est pas disponible")
        : (closureInfo.reason_en || "This date is not available"));
      return;
    }
    if (availableSlots.length === 0) {
      toast.error(lang === "fr" ? "Aucun créneau disponible" : "No slot available");
      return;
    }
    if (!scheduledDate) {
      toast.error(lang === "fr" ? "Choisissez une date de livraison" : "Choose a delivery date");
      return;
    }
    if (scheduledDate < minDateStr) {
      toast.error(lang === "fr"
        ? `Choisissez une date à partir du ${new Date(minDateStr).toLocaleDateString("fr-FR")}`
        : `Choose a date from ${new Date(minDateStr).toLocaleDateString("en-GB")}`);
      return;
    }
    if (scheduledDate > maxDateStr) {
      toast.error(lang === "fr" ? `Date trop éloignée (max ${maxAdvanceDays} jours)` : `Date too far ahead (max ${maxAdvanceDays} days)`);
      return;
    }
    if (!scheduledSlot) {
      toast.error(lang === "fr" ? "Choisissez un créneau horaire" : "Choose a time slot");
      return;
    }

    // ⭐ Si COD sélectionné, vérifier qu'il est bien disponible
    if (paymentMethod === "cod") {
      if (!codStatus?.available) {
        toast.error(lang === "fr"
          ? (codStatus?.reason_fr || "Paiement à la livraison indisponible")
          : (codStatus?.reason_en || "Cash on delivery unavailable"));
        return;
      }
    }

    setLoading(true);
    try {
      // ⭐ Pour COD, on ne cherche PAS de commande pending à reprendre
      if (user && paymentMethod === "stripe") {
        try {
          const { data: myOrders } = await api.get("/orders");
          const pendingMatch = (myOrders || []).find((o) =>
            o.status === "pending_payment" && o.payment_status === "pending" &&
            o.payment_method !== "cod" &&
            itemsMatch(o.items || [], itemsPayload)
          );
          if (pendingMatch) {
            const { data } = await api.post(`/orders/${pendingMatch.order_number}/retry-payment`, {
              origin_url: window.location.origin,
            });
            window.location.href = data.checkout_url;
            return;
          }
        } catch {}
      }

      const { data } = await api.post("/checkout/create", {
        items: itemsPayload, currency, shipping: shippingPayload,
        shipping_method_index: methodIndex, origin_url: window.location.origin,
        promo_code: promo?.code || null, lang,
        customer_note: customerNote || null,
        scheduled_date: scheduledDate,
        scheduled_time_slot: scheduledSlot,
        payment_method: paymentMethod,
      });

      // ⭐ CAS COD — pas de redirection Stripe
      if (data.payment_method === "cod") {
        toast.success(lang === "fr"
          ? "Commande enregistrée ! Paiement à la livraison."
          : "Order registered! Pay on delivery.",
          { duration: 5000 });
        nav(
          `/order/confirmation?order=${data.order_number}&cod=1&email=${encodeURIComponent(form.email)}`,
          { replace: true }
        );
        return;
      }

      // CAS Stripe : redirection habituelle
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
                <Button type="button" variant="outline" onClick={useMyLocation}
                  disabled={geoLoading || !isSecureContext}
                  title={!isSecureContext ? (lang === "fr" ? "Disponible uniquement en HTTPS" : "Available only over HTTPS") : ""}
                  className="rounded-none inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="use-location-btn">
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
                      <button key={a.id} type="button" onClick={() => applyAddress(a)}
                        className={`text-left border p-4 hover:border-brand transition-colors ${selectedAddressId === a.id ? "border-brand bg-brand/5" : "border-border"}`}
                        data-testid={`address-option-${a.id}`}>
                        <div className="font-semibold text-sm">{a.first_name} {a.last_name}</div>
                        <div className="text-xs text-ink-soft mt-1">{a.address_line}</div>
                        <div className="text-xs text-ink-soft">{a.postal_code} {a.city}</div>
                        <div className="text-xs text-ink-muted mt-1">{countryName(a.country, lang)}</div>
                      </button>
                    ))}
                    <button type="button"
                      onClick={() => { setShowNewForm(true); setSelectedAddressId(null); }}
                      className="text-left border border-dashed border-border p-4 hover:border-brand transition-colors flex items-center gap-2 text-sm"
                      data-testid="address-option-new">
                      <Plus className="w-4 h-4" />
                      {lang === "fr" ? "Nouvelle adresse" : "New address"}
                    </button>
                  </div>

                  {selectedAddressId ? (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Button onClick={() => { setShowNewForm(false); setStep(1); }}
                        data-testid="continue-with-address-btn"
                        className="bg-ink hover:bg-ink/90 rounded-none uppercase font-bold">
                        {lang === "fr" ? "Continuer avec cette adresse" : "Continue with this address"} →
                      </Button>
                      <button type="button"
                        onClick={() => { setShowNewForm(true); setSelectedAddressId(null); setForm((f) => ({ ...f, city: "", address_line: "", postal_code: "" })); }}
                        className="text-xs text-brand font-semibold hover:underline">
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
                  <button type="button"
                    onClick={() => { setShowNewForm(true); setSelectedAddressId(null); setForm((f) => ({ ...f, city: "", address_line: "", postal_code: "" })); }}
                    className="text-xs text-brand font-semibold hover:underline">
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
                    <select value={form.country} onChange={(e) => { setF("country", e.target.value); setMethodIndex(0); }}
                      className="mt-1 w-full border border-border h-10 px-3 bg-white" data-testid="checkout-country">
                      {availableCountries.map((c) => (
                        <option key={c.code} value={c.code}>{countryName(c.code, lang)}</option>
                      ))}
                    </select>
                  </div>
                  <div><Label>{t("city")}</Label><Input value={form.city} onChange={(e) => setF("city", e.target.value)} data-testid="checkout-city" className="mt-1" /></div>
                  <div className="sm:col-span-2"><Label>{t("address")}</Label><Input value={form.address_line} onChange={(e) => setF("address_line", e.target.value)} data-testid="checkout-address" className="mt-1" /></div>
                  <div><Label>{t("postalCode")}</Label><Input value={form.postal_code} onChange={(e) => setF("postal_code", e.target.value)} className="mt-1" /></div>

                  {user && !showSavedBadge && (
                    <div className="sm:col-span-2 flex items-center gap-2 text-sm pt-1">
                      <input type="checkbox" id="save-address" checked={saveAddress}
                        onChange={(e) => setSaveAddress(e.target.checked)} data-testid="save-address-checkbox" />
                      <label htmlFor="save-address" className="cursor-pointer inline-flex items-center gap-1.5">
                        <Save className="w-3.5 h-3.5 text-ink-muted" />
                        {lang === "fr" ? "Enregistrer cette adresse pour mes prochaines commandes" : "Save this address for future orders"}
                      </label>
                    </div>
                  )}

                  <div className="sm:col-span-2 pt-2">
                    <Button onClick={nextFromStep0} data-testid="to-shipping-btn"
                      className="bg-ink hover:bg-ink/90 rounded-none uppercase font-bold">
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
              {/* ⭐ ARTICLES ÉDITABLES */}
              <div className="space-y-3">
                {cart.map((i, idx) => {
                  const name = lang === "fr" ? i.name_fr : i.name_en;
                  const fields = i.customization_fields || [];
                  const unit = cartUnitPrice(i);
                  return (
                    <div key={idx} className="border border-border p-3" data-testid="checkout-item">
                      <div className="flex gap-3">
                        <img src={mediaSrc(i.image)} alt="" className="w-16 h-20 object-cover bg-secondary shrink-0" />
                        <div className="flex-1 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium leading-tight">{name}</div>
                            <div className="text-right whitespace-nowrap">
                              <div className="font-semibold">{fmt(unit * i.quantity)}</div>
                              {i.quantity > 1 && (
                                <div className="text-[10px] text-ink-muted">{fmt(unit)} / u</div>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-ink-muted mt-1">
                            Portion : {i.size}
                            {i.color ? ` · ${i.color}` : ""}
                          </div>

                          {/* Personnalisation */}
                          {i.customization && fields.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {fields.map((f) => {
                                const v = i.customization[f.key];
                                if (!v) return null;
                                let display = v;
                                if (f.type === "select") {
                                  const opt = (f.options || []).find((o) => o.value === v);
                                  if (opt) display = lang === "fr" ? opt.label_fr : opt.label_en;
                                }
                                return (
                                  <div key={f.key} className="text-xs text-brand flex items-center gap-1">
                                    🎂 <span className="text-ink-muted">{lang === "fr" ? f.label_fr : f.label_en} :</span>
                                    <strong className="text-ink">{display}</strong>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {i.customization && fields.length === 0 && (i.customization.name || i.customization.number) && (
                            <div className="mt-1 text-xs text-brand">
                              🎂 {[i.customization.name, i.customization.number && `N°${i.customization.number}`].filter(Boolean).join(" · ")}
                            </div>
                          )}

                          {/* Contrôles quantité + supprimer */}
                          <div className="flex items-center gap-3 mt-2">
                            <div className="flex items-center border border-border" data-testid="checkout-qty-controls">
                              <button
                                type="button"
                                onClick={() => updateQty(i.variant_id, i.customization, i.quantity - 1)}
                                disabled={i.quantity <= 1}
                                className="p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                                data-testid="checkout-qty-minus"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-8 text-center text-sm font-medium" data-testid="checkout-qty-value">
                                {i.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateQty(i.variant_id, i.customization, i.quantity + 1)}
                                className="p-1.5"
                                data-testid="checkout-qty-plus"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                removeFromCart(i.variant_id, i.customization);
                                toast.success(lang === "fr" ? "Article retiré" : "Item removed");
                              }}
                              className="text-xs text-ink-muted hover:text-red-600 inline-flex items-center gap-1 transition-colors"
                              data-testid="checkout-remove-item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              {lang === "fr" ? "Retirer" : "Remove"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Adresse */}
              <div className="mt-4 text-sm border border-border p-4">
                <div className="font-semibold mb-1">{t("address")}</div>
                <div className="text-ink-soft">
                  {form.first_name} {form.last_name}, {form.address_line}, {form.postal_code} {form.city}, {countryName(form.country, lang)}
                </div>
              </div>

              {/* Commande programmée */}
              <div className="mt-6 border border-brand/30 bg-brand/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-5 h-5 text-brand" />
                  <span className="font-semibold text-ink">
                    {lang === "fr" ? "Quand souhaitez-vous recevoir votre commande ?" : "When would you like to receive your order?"}
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label>{lang === "fr" ? "Date souhaitée" : "Preferred date"} *</Label>
                    <Input type="date" value={scheduledDate} min={minDateStr} max={maxDateStr}
                      onChange={(e) => setScheduledDate(e.target.value)} className="mt-1 bg-white"
                      data-testid="checkout-scheduled-date" />
                    <p className="text-[11px] text-ink-muted mt-1">
                      {lang === "fr"
                        ? `À partir du ${new Date(minDateStr).toLocaleDateString("fr-FR")} (délai : ${minLeadHuman}).`
                        : `From ${new Date(minDateStr).toLocaleDateString("en-GB")} (lead time: ${minLeadHuman}).`}
                    </p>
                  </div>
                  <div>
                    <Label>{lang === "fr" ? "Créneau horaire" : "Time slot"} *</Label>
                    {closureInfo ? (
                      <div className="mt-1 border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                        🚫 {lang === "fr" ? closureInfo.reason_fr : closureInfo.reason_en}
                      </div>
                    ) : (
                      <select value={scheduledSlot} onChange={(e) => setScheduledSlot(e.target.value)}
                        className="mt-1 w-full border border-border h-10 px-3 bg-white"
                        data-testid="checkout-scheduled-slot"
                        disabled={availableSlots.length === 0}>
                        {availableSlots.map((s) => (
                          <option key={s.value} value={s.value}>
                            {lang === "fr" ? s.label_fr : s.label_en}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <p className="text-xs text-ink-soft mt-3">
                  🎂 {lang === "fr"
                    ? "Vos gâteaux sont préparés à la commande — merci de respecter le délai minimum."
                    : "Our cakes are made to order — please respect the minimum lead time."}
                </p>
              </div>

              {/* ⭐ Mode de paiement */}
              <div className="mt-6 border border-border p-4" data-testid="payment-method-picker">
                <div className="font-semibold text-ink mb-3">
                  {lang === "fr" ? "Mode de paiement" : "Payment method"}
                </div>

                <div className="space-y-2">
                  {/* Option Stripe */}
                  <label className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors ${paymentMethod === "stripe" ? "border-brand bg-brand/5" : "border-border hover:border-brand/50"}`}>
                    <input
                      type="radio"
                      name="payment-method"
                      checked={paymentMethod === "stripe"}
                      onChange={() => setPaymentMethod("stripe")}
                      className="mt-1"
                      data-testid="payment-method-stripe"
                    />
                    <CreditCard className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">
                        {lang === "fr" ? "Carte bancaire (Stripe)" : "Credit card (Stripe)"}
                      </div>
                      <div className="text-xs text-ink-muted mt-0.5">
                        {lang === "fr"
                          ? "Paiement en ligne sécurisé. Redirection vers Stripe."
                          : "Secure online payment. Redirect to Stripe."}
                      </div>
                    </div>
                  </label>

                  {/* Option COD — visible uniquement si disponible */}
                  {codStatus?.available && (
                    <label className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors ${paymentMethod === "cod" ? "border-brand bg-brand/5" : "border-border hover:border-brand/50"}`}>
                      <input
                        type="radio"
                        name="payment-method"
                        checked={paymentMethod === "cod"}
                        onChange={() => setPaymentMethod("cod")}
                        className="mt-1"
                        data-testid="payment-method-cod"
                      />
                      <Banknote className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-semibold text-sm">
                          {lang === "fr" ? "Payer à la livraison" : "Pay on delivery"}
                        </div>
                        <div className="text-xs text-ink-muted mt-0.5">
                          {lang === "fr"
                            ? "Réglez en espèces au moment de la réception."
                            : "Pay in cash when you receive your order."}
                        </div>
                        {codStatus.extra_fee_xof > 0 && (
                          <div className="text-xs text-amber-700 font-semibold mt-1">
                            {lang === "fr"
                              ? `+ ${codStatus.extra_fee_xof.toLocaleString("fr-FR")} FCFA de frais`
                              : `+ ${codStatus.extra_fee_xof.toLocaleString("en-GB")} XOF fee`}
                          </div>
                        )}
                      </div>
                    </label>
                  )}
                </div>

                {/* Instructions COD */}
                {paymentMethod === "cod" && codStatus?.available && (codStatus.instructions_fr || codStatus.instructions_en) && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                    💡 {lang === "fr"
                      ? (codStatus.instructions_fr || "Préparez le montant exact en espèces.")
                      : (codStatus.instructions_en || "Prepare the exact amount in cash.")}
                  </div>
                )}

                {/* Message si COD indisponible */}
                {codStatus && !codStatus.available && (
                  <p className="mt-2 text-xs text-ink-muted italic">
                    {lang === "fr"
                      ? (codStatus.reason_fr || "Paiement à la livraison indisponible pour ce panier.")
                      : (codStatus.reason_en || "Cash on delivery unavailable for this cart.")}
                  </p>
                )}
              </div>

              {/* Note client */}
              <div className="mt-4">
                <Label htmlFor="customer_note">
                  {lang === "fr" ? "Note / instructions spéciales" : "Note / special instructions"}{" "}
                  <span className="text-ink-muted font-normal">({lang === "fr" ? "optionnel" : "optional"})</span>
                </Label>
                <Textarea id="customer_note" rows={3} maxLength={500}
                  value={customerNote} onChange={(e) => setCustomerNote(e.target.value)}
                  placeholder={lang === "fr"
                    ? "Ex : Allergie aux fruits à coque, message sur le gâteau, préférence de créneau de livraison..."
                    : "E.g. Nut allergy, message on the cake, preferred delivery time..."}
                  className="mt-1 rounded-none" data-testid="checkout-customer-note" />
                <p className="text-[11px] text-ink-muted mt-1">
                  {customerNote.length}/500 {lang === "fr" ? "caractères" : "characters"}
                </p>
              </div>

              <div className="flex gap-3 mt-6">
                <Button variant="outline" onClick={() => setStep(1)} className="rounded-none">←</Button>
                <Button onClick={placeOrder} disabled={loading} data-testid="place-order-btn"
                  className="flex-1 bg-brand hover:bg-brand-dark text-white rounded-none h-12 uppercase font-bold tracking-wide">
                  {loading
                    ? t("loading")
                    : paymentMethod === "cod"
                      ? (lang === "fr" ? "Confirmer la commande (COD)" : "Confirm order (COD)")
                      : `${t("payWithStripe")}`}
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
          {/* ⭐ Frais COD */}
          {paymentMethod === "cod" && codExtraFeeDisplay > 0 && (
            <div className="flex justify-between text-sm py-1 text-amber-700">
              <span>{lang === "fr" ? "Frais paiement à la livraison" : "COD fee"}</span>
              <span>+{fmt(codExtraFeeDisplay)}</span>
            </div>
          )}
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
          <div className="flex justify-between font-bold py-3 border-t border-border mt-2">
            <span>{t("total")}</span>
            <span data-testid="checkout-total">
              {paymentMethod === "cod" ? fmt(totalWithCod) : fmt(total)}
            </span>
          </div>
          {/* ⭐ RETIRÉ : plus de texte "Facture en EUR" */}
          {/* ⭐ Info COD dans le récap */}
          {paymentMethod === "cod" && (
            <div className="mt-3 pt-3 border-t border-border text-xs text-amber-800">
              <div className="inline-flex items-center gap-1.5 font-semibold">
                <Banknote className="w-3.5 h-3.5" />
                {lang === "fr" ? "Paiement à la livraison" : "Cash on delivery"}
              </div>
              <div className="mt-1 text-ink-muted">
                {lang === "fr"
                  ? "Vous réglerez en espèces au moment de la réception."
                  : "You will pay in cash when you receive your order."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}