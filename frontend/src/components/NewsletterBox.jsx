import React, { useState } from "react";
import { useStore } from "@/context/StoreProvider";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { Mail, ArrowRight } from "lucide-react";

export default function NewsletterBox({ source = "footer", compact = false }) {
  const { t, lang, user } = useStore();
  const [email, setEmail] = useState(user?.email || "");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    try {
      const { data } = await api.post("/newsletter/subscribe", { email, lang, source });
      toast.success(data.already ? t("newsletterAlready") : t("newsletterOk"));
      setDone(true);
    } catch (err) { toast.error(apiError(err)); }
    setBusy(false);
  };

  return (
    <div className={compact ? "" : "bg-brand text-white"} data-testid="newsletter-box">
      <div className={`${compact ? "" : "max-w-7xl mx-auto px-4 py-10"} flex flex-col lg:flex-row lg:items-center gap-6`}>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] font-semibold opacity-80"><Mail className="w-4 h-4" /> Newsletter</div>
          <h3 className="font-heading text-2xl sm:text-3xl font-extrabold uppercase tracking-tight mt-1">{t("newsletterTitle")}</h3>
          <p className="text-sm opacity-85 mt-1 max-w-xl">{t("newsletterText")}</p>
        </div>
        {done ? (
          <div className="font-semibold" data-testid="newsletter-done">{t("newsletterOk")}</div>
        ) : (
          <form onSubmit={submit} className="flex w-full lg:w-auto" data-testid="newsletter-form">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("email")}
              className={`flex-1 lg:w-72 h-12 px-4 text-sm text-ink bg-white outline-none ${compact ? "border border-border" : ""}`} data-testid="newsletter-email" />
            <button type="submit" disabled={busy} className="h-12 px-5 bg-ink text-white text-sm font-bold uppercase tracking-wide hover:bg-black transition-colors inline-flex items-center gap-1" data-testid="newsletter-submit">
              {t("newsletterBtn")} <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
