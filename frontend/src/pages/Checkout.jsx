import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check } from "lucide-react";

const COUNTRIES = [
  { code: "ML", fr: "Mali", en: "Mali" },
  { code: "BE", fr: "Belgique", en: "Belgium" },
  { code: "FR", fr: "France", en: "France" },
  { code: "SN", fr: "Senegal", en: "Senegal" },
  { code: "CI", fr: "Cote d'Ivoire", en: "Ivory Coast" },
];

export default function Checkout() {
  const { t, lang, currency, fmt, cart, cartSubtotal, user, settings, convertEur } = useStore();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [methodIndex, setMethodIndex] = useState(0);
  const [form, setForm] = useState({
    first_name: user?.first_name || "", last_name: user?.last_name || "",
    email: user?.email || "", phone: user?.phone || "",
    country: "ML", city: "", address_line: "", postal_code: "",
  });

  const shippingMethods = useMemo(
    () => (settings?.shipping?.methods || []).filter((m) => m.country === form.country),
    [settings, form.country]
  );
  const selectedMethod = shippingMethods[methodIndex] || { cost_eur: 15 };
  const shippingDisplay = convertEur(selectedMethod.cost_eur);
  const total = cartSubtotal + shippingDisplay;
  const chargeDifferent = !["EUR", "USD"].includes(currency);

  if (cart.length === 0) { nav("/cart"); return null; }

  const setF = (k, v) => setForm({ ...form, [k]: v });
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

  const placeOrder = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/checkout/create", {
        items: itemsPayload, currency, shipping: shippingPayload,
        shipping_method_index: methodIndex, origin_url: window.location.origin,
      });
      window.location.href = data.checkout_url;
    } catch (e) {
      toast.error(apiError(e));
      setLoading(false);
    }
  };

  const steps = [t("contactDetails"), t("shippingMethod"), t("review")];

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
            <div className="grid sm:grid-cols-2 gap-4" data-testid="step-contact">
              {[["first_name", t("firstName")], ["last_name", t("lastName")], ["email", t("email")], ["phone", t("phone")]].map(([k, lbl]) => (
                <div key={k}><Label>{lbl}</Label><Input value={form[k]} onChange={(e) => setF(k, e.target.value)} data-testid={`checkout-${k}`} className="mt-1" /></div>
              ))}
              <div>
                <Label>{t("country")}</Label>
                <select value={form.country} onChange={(e) => { setF("country", e.target.value); setMethodIndex(0); }}
                  className="mt-1 w-full border border-border h-10 px-3 bg-white" data-testid="checkout-country">
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{lang === "fr" ? c.fr : c.en}</option>)}
                </select>
              </div>
              <div><Label>{t("city")}</Label><Input value={form.city} onChange={(e) => setF("city", e.target.value)} data-testid="checkout-city" className="mt-1" /></div>
              <div className="sm:col-span-2"><Label>{t("address")}</Label><Input value={form.address_line} onChange={(e) => setF("address_line", e.target.value)} data-testid="checkout-address" className="mt-1" /></div>
              <div><Label>{t("postalCode")}</Label><Input value={form.postal_code} onChange={(e) => setF("postal_code", e.target.value)} className="mt-1" /></div>
              <div className="sm:col-span-2">
                <Button onClick={() => validateStep0() && setStep(1)} data-testid="to-shipping-btn" className="bg-ink hover:bg-ink/90 rounded-none uppercase font-bold">{t("shippingMethod")} →</Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div data-testid="step-shipping">
              <div className="space-y-3">
                {shippingMethods.length === 0 && <p className="text-sm text-ink-muted">{lang === "fr" ? "Livraison internationale appliquee." : "International shipping applied."}</p>}
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
                      {i.customization && <div className="text-xs text-brand">{i.customization.name} {i.customization.number}</div>}
                    </div>
                  </div>;
                })}
              </div>
              <div className="mt-4 text-sm border border-border p-4">
                <div className="font-semibold mb-1">{t("address")}</div>
                <div className="text-ink-soft">{form.first_name} {form.last_name}, {form.address_line}, {form.city}, {form.country}</div>
              </div>
              {chargeDifferent && (
                <div className="mt-4 bg-amber-50 border border-amber-200 p-4 text-sm" data-testid="payment-notice">
                  <strong>{t("paymentNotice")}: </strong>
                  {lang === "fr"
                    ? `Le paiement sera traite en EUR (equivalent de ${fmt(total)}). Stripe ne facture pas en XOF pour le moment.`
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
          <div className="flex justify-between text-sm py-1"><span>{t("shipping")}</span><span>{fmt(shippingDisplay)}</span></div>
          <div className="flex justify-between font-bold py-3 border-t border-border mt-2"><span>{t("total")}</span><span data-testid="checkout-total">{fmt(total)}</span></div>
          <div className="text-xs text-ink-muted mt-2">{currency !== "EUR" && currency !== "USD" ? (lang === "fr" ? "Facture en EUR" : "Billed in EUR") : ""}</div>
        </div>
      </div>
    </div>
  );
}
