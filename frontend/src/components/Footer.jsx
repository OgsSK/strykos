import React from "react";
import { Link } from "react-router-dom";
import { Instagram, Facebook, Music2, MapPin, Clock } from "lucide-react";
import { useStore } from "@/context/StoreProvider";
import Brand from "@/components/Brand";

export default function Footer() {
  const { t, settings, lang, brand } = useStore();
  const site = settings?.site || {};

  const socials = site.socials || {};
  const address = lang === "fr" ? site.address_fr : site.address_en;
  const hours = lang === "fr" ? site.hours_fr : site.hours_en;

  const hasSocials = socials.instagram || socials.facebook || socials.tiktok;

  return (
    <footer className="bg-ink text-white" data-testid="footer">
      <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">

        {/* Colonne 1 : Logo + tagline + réseaux + coordonnées */}
        <div className="col-span-2 md:col-span-1">
          <Brand className="mb-3 text-white" />
          <p className="text-sm text-white/60 leading-relaxed">{t("footerTagline")}</p>

          {/* Réseaux sociaux — s'affichent uniquement si renseignés */}
          {hasSocials && (
            <div className="flex gap-3 mt-4">
              {socials.instagram && (
                <a
                  href={socials.instagram}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white/60 hover:text-brand transition-colors"
                  title="Instagram"
                  data-testid="footer-instagram"
                >
                  <Instagram className="w-5 h-5" />
                </a>
              )}
              {socials.facebook && (
                <a
                  href={socials.facebook}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white/60 hover:text-brand transition-colors"
                  title="Facebook"
                  data-testid="footer-facebook"
                >
                  <Facebook className="w-5 h-5" />
                </a>
              )}
              {socials.tiktok && (
                <a
                  href={socials.tiktok}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white/60 hover:text-brand transition-colors"
                  title="TikTok"
                  data-testid="footer-tiktok"
                >
                  <Music2 className="w-5 h-5" />
                </a>
              )}
            </div>
          )}

          {/* Adresse + Horaires — s'affichent uniquement si renseignés */}
          {(address || hours) && (
            <div className="mt-4 space-y-1.5 text-sm text-white/60">
              {address && (
                <div className="flex items-start gap-2" data-testid="footer-address">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-brand" />
                  <span>{address}</span>
                </div>
              )}
              {hours && (
                <div className="flex items-start gap-2" data-testid="footer-hours">
                  <Clock className="w-4 h-4 mt-0.5 shrink-0 text-brand" />
                  <span>{hours}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Colonne 2 : Nos gâteaux */}
        <div>
          <h4 className="text-xs uppercase tracking-wider font-semibold mb-4 text-white/80">
            {lang === "fr" ? "Nos gâteaux" : "Our cakes"}
          </h4>
          <ul className="space-y-2 text-sm text-white/60">
            <li><Link to="/catalog?category=anniversaires" className="hover:text-brand">{t("jerseys")}</Link></li>
            <li><Link to="/catalog?category=mariages" className="hover:text-brand">{t("boots")}</Link></li>
            <li><Link to="/catalog?category=personnalises" className="hover:text-brand">{t("equipment")}</Link></li>
            <li><Link to="/catalog?on_sale=true" className="hover:text-brand">{t("promotions")}</Link></li>
          </ul>
        </div>

        {/* Colonne 3 : Service client */}
        <div>
          <h4 className="text-xs uppercase tracking-wider font-semibold mb-4 text-white/80">{t("customerService")}</h4>
          <ul className="space-y-2 text-sm text-white/60">
            <li><Link to="/page/shipping" className="hover:text-brand">{t("shippingPolicy")}</Link></li>
            <li><Link to="/page/returns" className="hover:text-brand">{t("returnsPolicy")}</Link></li>
            <li><Link to="/page/faq" className="hover:text-brand">{t("faq")}</Link></li>
            <li><Link to="/page/contact" className="hover:text-brand">{t("contact")}</Link></li>
            <li><Link to="/suivi" className="hover:text-brand" data-testid="footer-track-link">{t("trackTitle")}</Link></li>
          </ul>
        </div>

        {/* Colonne 4 : Marque (nom dynamique) */}
        <div>
          <h4 className="text-xs uppercase tracking-wider font-semibold mb-4 text-white/80">
            {brand.part1}{brand.part2}
          </h4>
          <ul className="space-y-2 text-sm text-white/60">
            <li><Link to="/page/about" className="hover:text-brand">{t("about")}</Link></li>
            <li><Link to="/page/terms" className="hover:text-brand">{t("terms")}</Link></li>
            <li><Link to="/page/privacy" className="hover:text-brand">{t("privacy")}</Link></li>
            <li><Link to="/page/cookies" className="hover:text-brand">{t("cookies")}</Link></li>
            <li><Link to="/page/legal" className="hover:text-brand">{t("legalNotice")}</Link></li>
            <li>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event("strykos:open-cookies"))}
                className="hover:text-brand text-left"
              >
                {lang === "fr" ? "Gérer les cookies" : "Manage cookies"}
              </button>
            </li>
          </ul>
        </div>
      </div>

      {/* Bas du footer : copyright + contact */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/50">
          <span>© {new Date().getFullYear()} {brand.part1}{brand.part2}. {t("allRightsReserved")}.</span>
          <span>{t("independentStore")}</span>
          <span className="flex gap-3">
            {site.email && <a href={`mailto:${site.email}`} className="hover:text-white" data-testid="footer-email">{site.email}</a>}
            {site.phone && <a href={`tel:${site.phone.replace(/ /g, "")}`} className="hover:text-white" data-testid="footer-phone">{site.phone}</a>}
          </span>
        </div>
      </div>
    </footer>
  );
}