import React from "react";
import { useParams, Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { Button } from "@/components/ui/button";

const PAGES = {
  about: {
    fr: { title: "A propos de STRYKOS", body: "STRYKOS est une boutique en ligne multimarque independante specialisee dans le football, basee a Bamako au Mali. Nous proposons des maillots authentiques, des chaussures, des equipements et des accessoires des plus grandes marques internationales ainsi que de marques locales et africaines selectionnees.\n\nSTRYKOS n'est le site officiel d'aucune marque, club ou federation. Tous les produits presentes comme authentiques sont approvisionnes aupres de fournisseurs fiables." },
    en: { title: "About STRYKOS", body: "STRYKOS is an independent multi-brand online store specialized in football, based in Bamako, Mali. We offer authentic jerseys, boots, equipment and accessories from the biggest international brands as well as selected local and African brands.\n\nSTRYKOS is not the official website of any brand, club or federation. All products presented as authentic are sourced from reliable suppliers." },
  },
  shipping: {
    fr: { title: "Politique de livraison", body: "Nous livrons au Mali, en Belgique, en France et a l'international. Les delais et tarifs dependent de la destination et sont indiques lors de la commande.\n\nMali: 3-6 jours ouvres (standard) ou 1-2 jours (express Bamako).\nBelgique: 2-4 jours ouvres.\nFrance: 3-5 jours ouvres.\n\nLes frais de livraison sont calcules automatiquement au moment du paiement." },
    en: { title: "Shipping policy", body: "We ship to Mali, Belgium, France and internationally. Delivery times and rates depend on destination and are shown at checkout.\n\nMali: 3-6 business days (standard) or 1-2 days (Bamako express).\nBelgium: 2-4 business days.\nFrance: 3-5 business days.\n\nShipping fees are calculated automatically at checkout." },
  },
  returns: {
    fr: { title: "Retours et remboursements", body: "Vous disposez de 14 jours apres reception pour demander un retour. Les articles doivent etre non portes, dans leur etat et emballage d'origine. Les articles personnalises (nom/numero) ne sont pas repris sauf defaut.\n\nLe remboursement est effectue sur le moyen de paiement initial apres reception et controle de l'article." },
    en: { title: "Returns & refunds", body: "You have 14 days after delivery to request a return. Items must be unworn, in original condition and packaging. Customized items (name/number) cannot be returned unless defective.\n\nRefunds are issued to the original payment method after the item is received and checked." },
  },
  faq: {
    fr: { title: "FAQ", body: "Les produits sont-ils authentiques ? Oui, tous nos produits sont approvisionnes aupres de fournisseurs fiables.\n\nQuels moyens de paiement acceptez-vous ? Stripe (carte bancaire) pour le moment. CinetPay et PawaPay (mobile money) arriveront prochainement.\n\nDans quelles devises puis-je payer ? L'affichage est disponible en EUR, USD et XOF. Le paiement par carte est traite en EUR ou USD." },
    en: { title: "FAQ", body: "Are the products authentic? Yes, all our products are sourced from reliable suppliers.\n\nWhich payment methods do you accept? Stripe (card) for now. CinetPay and PawaPay (mobile money) are coming soon.\n\nIn which currencies can I pay? Prices are shown in EUR, USD and XOF. Card payment is processed in EUR or USD." },
  },
  contact: {
    fr: { title: "Contact", body: "Pour toute question, ecrivez-nous a contact@strykos.com. Nous repondons sous 24-48h ouvrees.\n\nSTRYKOS - Bamako, Mali." },
    en: { title: "Contact", body: "For any question, email us at contact@strykos.com. We reply within 24-48 business hours.\n\nSTRYKOS - Bamako, Mali." },
  },
  terms: {
    fr: { title: "Conditions generales de vente", body: "Les presentes conditions regissent les ventes realisees sur STRYKOS. En passant commande, le client accepte ces conditions. Les prix sont indiques dans la devise selectionnee. STRYKOS se reserve le droit de modifier ses prix a tout moment, le prix applicable etant celui en vigueur au moment de la commande." },
    en: { title: "Terms & conditions", body: "These terms govern sales made on STRYKOS. By placing an order, the customer accepts these terms. Prices are shown in the selected currency. STRYKOS reserves the right to change prices at any time, the applicable price being the one in effect at the time of the order." },
  },
  privacy: {
    fr: { title: "Politique de confidentialite", body: "Nous collectons uniquement les donnees necessaires au traitement de vos commandes et a la livraison. Vos donnees ne sont jamais revendues. Vous pouvez demander la suppression de votre compte a tout moment." },
    en: { title: "Privacy policy", body: "We only collect the data necessary to process your orders and deliveries. Your data is never resold. You can request the deletion of your account at any time." },
  },
  cookies: {
    fr: { title: "Politique relative aux cookies", body: "STRYKOS utilise des cookies techniques necessaires au fonctionnement du site (panier, session, preferences de langue et devise). Aucun cookie publicitaire tiers n'est utilise sans votre consentement." },
    en: { title: "Cookies policy", body: "STRYKOS uses technical cookies necessary for the website to work (cart, session, language and currency preferences). No third-party advertising cookie is used without your consent." },
  },
};

export default function StaticPage() {
  const { slug } = useParams();
  const { lang, t } = useStore();
  const page = PAGES[slug];
  if (!page) return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <h1 className="font-heading text-2xl font-bold">404</h1>
      <Link to="/"><Button className="mt-4 rounded-none">STRYKOS</Button></Link>
    </div>
  );
  const content = page[lang] || page.fr;
  return (
    <div className="max-w-3xl mx-auto px-4 py-12" data-testid={`static-page-${slug}`}>
      <h1 className="font-heading text-3xl sm:text-4xl font-bold uppercase tracking-tight mb-6">{content.title}</h1>
      <div className="prose text-ink-soft whitespace-pre-line leading-relaxed">{content.body}</div>
    </div>
  );
}
