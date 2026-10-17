// ⭐ Version european-focused
// - Inclut : tous les pays de l'UE + EEA + Suisse + Royaume-Uni + Irlande
// - Inclut : "ML" (legacy) — Mali est encore dans shipping.methods backend
// - Retire : Afrique subsaharienne, Maghreb/Moyen-Orient, Amériques, Asie, Océanie

export const COUNTRIES_MAP = {
  // ⭐ LEGACY : Mali reste actif dans shipping.methods backend
  // Retirer cette ligne UNIQUEMENT si tu retires ML du backend aussi (voir section "Pour aller plus loin")
  ML: { fr: "Mali", en: "Mali" },

  // ─── Cœur UE (membres fondateurs + majeurs) ───
  FR: { fr: "France", en: "France" },
  BE: { fr: "Belgique", en: "Belgium" },
  DE: { fr: "Allemagne", en: "Germany" },
  IT: { fr: "Italie", en: "Italy" },
  ES: { fr: "Espagne", en: "Spain" },
  NL: { fr: "Pays-Bas", en: "Netherlands" },
  LU: { fr: "Luxembourg", en: "Luxembourg" },
  AT: { fr: "Autriche", en: "Austria" },
  PT: { fr: "Portugal", en: "Portugal" },
  IE: { fr: "Irlande", en: "Ireland" },
  DK: { fr: "Danemark", en: "Denmark" },
  SE: { fr: "Suède", en: "Sweden" },
  FI: { fr: "Finlande", en: "Finland" },
  PL: { fr: "Pologne", en: "Poland" },
  CZ: { fr: "Tchéquie", en: "Czechia" },
  SK: { fr: "Slovaquie", en: "Slovakia" },
  HU: { fr: "Hongrie", en: "Hungary" },
  RO: { fr: "Roumanie", en: "Romania" },
  BG: { fr: "Bulgarie", en: "Bulgaria" },
  GR: { fr: "Grèce", en: "Greece" },
  HR: { fr: "Croatie", en: "Croatia" },
  SI: { fr: "Slovénie", en: "Slovenia" },
  EE: { fr: "Estonie", en: "Estonia" },
  LV: { fr: "Lettonie", en: "Latvia" },
  LT: { fr: "Lituanie", en: "Lithuania" },
  MT: { fr: "Malte", en: "Malta" },
  CY: { fr: "Chypre", en: "Cyprus" },

  // ─── EEA + Suisse (marché unique élargi) ───
  NO: { fr: "Norvège", en: "Norway" },
  IS: { fr: "Islande", en: "Iceland" },
  LI: { fr: "Liechtenstein", en: "Liechtenstein" },
  CH: { fr: "Suisse", en: "Switzerland" },

  // ─── Royaume-Uni (post-Brexit, toujours partenaire commercial majeur) ───
  GB: { fr: "Royaume-Uni", en: "United Kingdom" },

  // ─── Micro-États / territoires européens ───
  MC: { fr: "Monaco", en: "Monaco" },
  AD: { fr: "Andorre", en: "Andorra" },
  SM: { fr: "Saint-Marin", en: "San Marino" },
  VA: { fr: "Vatican", en: "Vatican" },
};

export const countryName = (code, lang = "fr") => {
  if (!code) return "";
  const c = COUNTRIES_MAP[code.toUpperCase()];
  if (!c) return code;
  return lang === "fr" ? c.fr : c.en;
};

// Reverse geocoding via Nominatim (OpenStreetMap, gratuit)
export async function reverseGeocode(lat, lon, lang = "fr") {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&accept-language=${lang}`;
  const res = await fetch(url, {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();
  const addr = data.address || {};
  const code = (addr.country_code || "").toUpperCase();
  const city =
    addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
  return { country: code, city };
}