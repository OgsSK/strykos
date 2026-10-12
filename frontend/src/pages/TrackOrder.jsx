import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrderTimeline } from "@/components/OrderTimeline";
import { Search, HelpCircle, Mail, PackageSearch, AlertCircle } from "lucide-react";

export default function TrackOrder() {
  const { t } = useStore();
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    order_number: params.get("order") || "",
    email: params.get("email") || "",
  });
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    if (!form.order_number || !form.email) return;
    setLoading(true);
    setError("");
    setOrder(null);
    try {
      const { data } = await api.post("/orders/track", form);
      setOrder(data);
    } catch (err) {
      setError(apiError(err));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (params.get("order") && params.get("email")) submit();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-3xl mx-auto px-4 py-12" data-testid="track-page">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 mb-3">
          <PackageSearch className="w-5 h-5 text-brand" />
          <span className="text-xs uppercase tracking-wider font-semibold text-ink-muted">
            {t("trackTitle")}
          </span>
        </div>
        <h1 className="font-heading text-3xl sm:text-4xl font-bold uppercase tracking-tight mb-3">
          {t("trackHeading")}
        </h1>
        <p className="text-ink-soft leading-relaxed">{t("trackIntro")}</p>
      </div>

      {/* Aide "où trouver le numéro" */}
      <div className="border border-border bg-secondary p-4 mb-6 flex gap-3 text-sm">
        <HelpCircle className="w-5 h-5 text-ink-muted shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-ink mb-1">{t("trackHelpTitle")}</div>
          <p className="text-ink-soft leading-relaxed">{t("trackHelpText")}</p>
        </div>
      </div>

      {/* Formulaire */}
      <form
        onSubmit={submit}
        className="border border-border bg-white p-5 sm:p-6"
        data-testid="track-form"
      >
        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          <div>
            <Label htmlFor="order_number" className="text-xs uppercase tracking-wider text-ink-muted">
              {t("orderNumber")}
            </Label>
            <Input
              id="order_number"
              value={form.order_number}
              onChange={(e) => setForm({ ...form, order_number: e.target.value.toUpperCase() })}
              placeholder="STK-260101-XXXXX"
              className="mt-2 font-mono rounded-none"
              data-testid="track-order-number"
            />
          </div>
          <div>
            <Label htmlFor="email" className="text-xs uppercase tracking-wider text-ink-muted">
              {t("email")}
            </Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="votre@email.com"
              className="mt-2 rounded-none"
              data-testid="track-email"
            />
          </div>
        </div>
        <Button
          type="submit"
          disabled={loading || !form.order_number || !form.email}
          className="w-full sm:w-auto bg-brand hover:bg-brand-dark rounded-none h-11 px-6 uppercase font-bold tracking-wide"
          data-testid="track-submit"
        >
          {loading ? (
            t("loading")
          ) : (
            <>
              <Search className="w-4 h-4 mr-2" />
              {t("trackBtn")}
            </>
          )}
        </Button>
      </form>

      {/* Erreur */}
      {error && (
        <div
          className="mt-6 border border-brand/30 bg-brand/5 p-4 flex gap-3 text-sm"
          data-testid="track-error"
        >
          <AlertCircle className="w-5 h-5 text-brand shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-brand mb-1">{t("trackNotFound")}</div>
            <p className="text-ink-soft leading-relaxed mb-2">{error}</p>
            <Link
              to="/page/contact"
              className="inline-flex items-center gap-1 text-brand font-semibold hover:underline"
            >
              <Mail className="w-3 h-3" /> {t("trackContact")}
            </Link>
          </div>
        </div>
      )}

      {/* Résultat */}
      {order && (
        <div className="mt-8">
          <OrderTimeline order={order} />
        </div>
      )}

      {/* Bloc bas de page : autre aide */}
      {!order && !error && (
        <div className="mt-10 pt-8 border-t border-border">
          <div className="flex items-start gap-3 text-sm text-ink-soft">
            <Mail className="w-5 h-5 text-ink-muted shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-ink mb-1">{t("trackNeedHelp")}</div>
              <p className="leading-relaxed">
                {t("trackNeedHelpText")}{" "}
                <Link to="/page/contact" className="text-brand font-semibold hover:underline">
                  {t("contact")}
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}