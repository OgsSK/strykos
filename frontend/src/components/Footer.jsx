import React from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";

export default function Footer() {
  const { t, settings } = useStore();
  const site = settings?.site;
  return (
    <footer className="bg-ink text-white mt-20" data-testid="footer">
      <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1">
          <div className="font-heading font-extrabold text-2xl mb-3">STRY<span className="text-brand">KOS</span></div>
          <p className="text-sm text-white/60 leading-relaxed">{t("footerTagline")}</p>
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wider font-semibold mb-4 text-white/80">{t("catalog")}</h4>
          <ul className="space-y-2 text-sm text-white/60">
            <li><Link to="/catalog?category=maillots" className="hover:text-brand">{t("jerseys")}</Link></li>
            <li><Link to="/catalog?category=chaussures" className="hover:text-brand">{t("boots")}</Link></li>
            <li><Link to="/catalog?category=equipements" className="hover:text-brand">{t("equipment")}</Link></li>
            <li><Link to="/catalog?on_sale=true" className="hover:text-brand">{t("promotions")}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wider font-semibold mb-4 text-white/80">{t("customerService")}</h4>
          <ul className="space-y-2 text-sm text-white/60">
            <li><Link to="/page/shipping" className="hover:text-brand">{t("shippingPolicy")}</Link></li>
            <li><Link to="/page/returns" className="hover:text-brand">{t("returnsPolicy")}</Link></li>
            <li><Link to="/page/faq" className="hover:text-brand">{t("faq")}</Link></li>
            <li><Link to="/page/contact" className="hover:text-brand">{t("contact")}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wider font-semibold mb-4 text-white/80">STRYKOS</h4>
          <ul className="space-y-2 text-sm text-white/60">
            <li><Link to="/page/about" className="hover:text-brand">{t("about")}</Link></li>
            <li><Link to="/page/terms" className="hover:text-brand">{t("terms")}</Link></li>
            <li><Link to="/page/privacy" className="hover:text-brand">{t("privacy")}</Link></li>
            <li><Link to="/page/cookies" className="hover:text-brand">{t("cookies")}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/50">
          <span>© {new Date().getFullYear()} STRYKOS. {t("allRightsReserved")}.</span>
          <span>{t("independentStore")}</span>
          {site?.email && <span>{site.email}</span>}
        </div>
      </div>
    </footer>
  );
}
