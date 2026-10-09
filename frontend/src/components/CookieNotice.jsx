import React, { useState } from "react";
import { useStore } from "@/context/StoreProvider";
import { Link } from "react-router-dom";

export default function CookieNotice() {
  const { t } = useStore();
  const [show, setShow] = useState(() => !localStorage.getItem("strykos_consent"));
  if (!show) return null;
  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:max-w-md z-50 bg-ink text-white p-4 shadow-xl border border-white/10 animate-fade-up" data-testid="cookie-notice">
      <p className="text-xs leading-relaxed text-white/85">{t("cookieText")} <Link to="/page/privacy" className="underline">{t("privacy")}</Link></p>
      <button onClick={() => { localStorage.setItem("strykos_consent", new Date().toISOString()); setShow(false); }}
        className="mt-3 bg-brand hover:bg-brand-dark px-4 py-2 text-xs font-bold uppercase tracking-wide" data-testid="cookie-accept">{t("cookieOk")}</button>
    </div>
  );
}
