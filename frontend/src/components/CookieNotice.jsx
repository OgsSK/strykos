import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { X, Cookie, Check } from "lucide-react";

const STORAGE_KEY = "strykos_consent_v2";

const DEFAULT_PREFS = {
  essential: true,
  analytics: false,
  marketing: false,
  updated_at: null,
};

export default function CookieNotice() {
  const { t, lang } = useStore();
  const [visible, setVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);

  // Chargement initial
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        setVisible(true);
      } else {
        const parsed = JSON.parse(saved);
        setPrefs({ ...DEFAULT_PREFS, ...parsed });
      }
    } catch {
      setVisible(true);
    }
  }, []);

  // Permet de rouvrir la bannière depuis n'importe où (footer, page cookies)
  useEffect(() => {
    const open = () => { setShowSettings(true); setVisible(true); };
    window.addEventListener("strykos:open-cookies", open);
    return () => window.removeEventListener("strykos:open-cookies", open);
  }, []);

  const save = (next) => {
    const payload = { ...next, updated_at: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setPrefs(payload);
    setVisible(false);
    setShowSettings(false);
    window.dispatchEvent(new CustomEvent("strykos:cookies-updated", { detail: payload }));
  };

  const acceptAll = () => save({ essential: true, analytics: true, marketing: true });
  const rejectAll = () => save({ essential: true, analytics: false, marketing: false });
  const saveCustom = () => save({ ...prefs, essential: true });

  const toggle = (key) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  if (!visible) return null;

  return (
    <>
      {/* Bannière bas de page */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[60] bg-white border-t-2 border-ink shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
        data-testid="cookie-notice"
      >
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 py-4 sm:py-5">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
            <div className="flex items-start gap-3 flex-1">
              <div className="w-10 h-10 border border-border flex items-center justify-center shrink-0">
                <Cookie className="w-5 h-5 text-brand" />
              </div>
              <div className="flex-1">
                <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-ink mb-1">
                  {t("cookieBannerTitle")}
                </h3>
                <p className="text-xs sm:text-sm text-ink-soft leading-relaxed">
                  {t("cookieBannerText")}{" "}
                  <Link
                    to="/page/cookies"
                    className="underline font-medium hover:text-brand transition-colors"
                  >
                    {t("cookieBannerLearn")}
                  </Link>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 lg:shrink-0">
              <button
                onClick={() => setShowSettings(true)}
                className="flex-1 lg:flex-none border border-ink px-4 py-2.5 text-xs font-bold uppercase tracking-wide hover:bg-ink hover:text-white transition-colors"
                data-testid="cookie-customize"
              >
                {t("cookieCustomize")}
              </button>
              <button
                onClick={rejectAll}
                className="flex-1 lg:flex-none border border-border px-4 py-2.5 text-xs font-bold uppercase tracking-wide hover:bg-secondary transition-colors"
                data-testid="cookie-reject"
              >
                {t("cookieRejectAll")}
              </button>
              <button
                onClick={acceptAll}
                className="flex-1 lg:flex-none bg-brand hover:bg-brand-dark text-white px-5 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors"
                data-testid="cookie-accept"
              >
                {t("cookieAcceptAll")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modale de personnalisation */}
      {showSettings && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-ink/60"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="bg-white w-full max-w-lg border border-border shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            data-testid="cookie-modal"
          >
            {/* Header modale */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-heading text-base font-bold uppercase tracking-tight">
                {t("cookieModalTitle")}
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-ink-muted hover:text-ink transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Intro */}
            <p className="p-5 pb-3 text-xs text-ink-soft leading-relaxed">
              {t("cookieModalIntro")}
            </p>

            {/* Cases */}
            <div className="px-5 pb-3 space-y-3">
              {/* Nécessaires */}
              <div className="border border-border p-4 bg-secondary/50">
                <label className="flex items-start gap-3 cursor-not-allowed">
                  <input
                    type="checkbox"
                    checked
                    disabled
                    className="mt-0.5 w-4 h-4 accent-ink cursor-not-allowed"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-ink">
                        {t("cookieEssential")}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider bg-ink text-white px-2 py-0.5">
                        {t("cookieRequired")}
                      </span>
                    </div>
                    <p className="text-xs text-ink-soft leading-relaxed">
                      {t("cookieEssentialDesc")}
                    </p>
                  </div>
                </label>
              </div>

              {/* Analytics */}
              <div className="border border-border p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs.analytics}
                    onChange={() => toggle("analytics")}
                    className="mt-0.5 w-4 h-4 accent-brand cursor-pointer"
                    data-testid="cookie-toggle-analytics"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-ink block mb-1">
                      {t("cookieAnalytics")}
                    </span>
                    <p className="text-xs text-ink-soft leading-relaxed">
                      {t("cookieAnalyticsDesc")}
                    </p>
                  </div>
                </label>
              </div>

              {/* Marketing */}
              <div className="border border-border p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs.marketing}
                    onChange={() => toggle("marketing")}
                    className="mt-0.5 w-4 h-4 accent-brand cursor-pointer"
                    data-testid="cookie-toggle-marketing"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-ink block mb-1">
                      {t("cookieMarketing")}
                    </span>
                    <p className="text-xs text-ink-soft leading-relaxed">
                      {t("cookieMarketingDesc")}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Actions modale */}
            <div className="p-5 pt-3 flex flex-col-reverse sm:flex-row gap-2">
              <button
                onClick={rejectAll}
                className="flex-1 border border-border px-4 py-2.5 text-xs font-bold uppercase tracking-wide hover:bg-secondary transition-colors"
              >
                {t("cookieRejectAll")}
              </button>
              <button
                onClick={saveCustom}
                className="flex-1 bg-brand hover:bg-brand-dark text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors inline-flex items-center justify-center gap-2"
                data-testid="cookie-save"
              >
                <Check className="w-4 h-4" /> {t("cookieSave")}
              </button>
            </div>

            {/* Lien vers la politique complète */}
            <div className="px-5 pb-5 text-center">
              <Link
                to="/page/cookies"
                className="text-xs text-ink-muted underline hover:text-brand transition-colors"
              >
                {t("cookieBannerLearn")}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}