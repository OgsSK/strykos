import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrderTimeline } from "@/components/OrderTimeline";
import { Search } from "lucide-react";

export default function TrackOrder() {
  const { t } = useStore();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ order_number: params.get("order") || "", email: params.get("email") || "" });
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    if (!form.order_number || !form.email) return;
    setLoading(true); setError(""); setOrder(null);
    try { const { data } = await api.post("/orders/track", form); setOrder(data); }
    catch (err) { setError(apiError(err)); }
    setLoading(false);
  };
  useEffect(() => { if (params.get("order") && params.get("email")) submit(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-3xl mx-auto px-4 py-12" data-testid="track-page">
      <h1 className="font-heading text-3xl sm:text-4xl font-bold uppercase tracking-tight mb-2">{t("trackTitle")}</h1>
      <p className="text-ink-soft mb-6">{t("trackIntro")}</p>
      <form onSubmit={submit} className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end border border-border p-5 bg-white">
        <div><Label>{t("orderNumber")}</Label><Input value={form.order_number} onChange={(e) => setForm({ ...form, order_number: e.target.value.toUpperCase() })} placeholder="STK-260101-XXXXX" className="mt-1 font-mono" data-testid="track-order-number" /></div>
        <div><Label>{t("email")}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" data-testid="track-email" /></div>
        <Button type="submit" disabled={loading} className="bg-brand hover:bg-brand-dark rounded-none h-10 uppercase font-bold" data-testid="track-submit"><Search className="w-4 h-4 mr-1" /> {t("trackBtn")}</Button>
      </form>
      {error && <p className="mt-4 text-sm text-brand" data-testid="track-error">{error}</p>}
      {order && <div className="mt-8"><OrderTimeline order={order} /></div>}
    </div>
  );
}
