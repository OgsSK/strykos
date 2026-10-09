import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api } from "@/lib/api";
import { MailX, CheckCircle2 } from "lucide-react";

export default function NewsletterUnsubscribe() {
  const { t } = useStore();
  const [params] = useSearchParams();
  const [state, setState] = useState("loading");
  useEffect(() => {
    const token = params.get("token");
    if (!token) { setState("error"); return; }
    api.post("/newsletter/unsubscribe", { token }).then(() => setState("done")).catch(() => setState("error"));
  }, [params]);
  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center" data-testid="unsubscribe-page">
      {state === "done" ? <CheckCircle2 className="w-12 h-12 mx-auto text-green-600 mb-4" /> : <MailX className="w-12 h-12 mx-auto text-ink-muted mb-4" />}
      <h1 className="font-heading text-3xl font-bold uppercase tracking-tight mb-3">{t("unsubTitle")}</h1>
      <p className="text-sm text-ink-soft" data-testid="unsubscribe-status">{state === "loading" ? t("loading") : state === "done" ? t("unsubDone") : t("unsubError")}</p>
      <Link to="/" className="inline-block mt-6 bg-ink text-white px-6 py-3 text-sm font-bold uppercase">{t("continueShopping")}</Link>
    </div>
  );
}
