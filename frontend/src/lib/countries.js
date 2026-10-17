// Dictionnaire pays : code ISO2 → { fr, en }
export const COUNTRIES_MAP = {
  ML: { fr: "Mali", en: "Mali" },
  BE: { fr: "Belgique", en: "Belgium" },
  FR: { fr: "France", en: "France" },
  SN: { fr: "Sénégal", en: "Senegal" },
  CI: { fr: "Côte d'Ivoire", en: "Ivory Coast" },
  BF: { fr: "Burkina Faso", en: "Burkina Faso" },
  GN: { fr: "Guinée", en: "Guinea" },
  NE: { fr: "Niger", en: "Niger" },
  TG: { fr: "Togo", en: "Togo" },
  BJ: { fr: "Bénin", en: "Benin" },
  MR: { fr: "Mauritanie", en: "Mauritania" },
  CM: { fr: "Cameroun", en: "Cameroon" },
  GA: { fr: "Gabon", en: "Gabon" },
  CG: { fr: "Congo", en: "Congo" },
  CD: { fr: "Congo (RDC)", en: "Congo (DRC)" },
  DE: { fr: "Allemagne", en: "Germany" },
  NL: { fr: "Pays-Bas", en: "Netherlands" },
  ES: { fr: "Espagne", en: "Spain" },
  IT: { fr: "Italie", en: "Italy" },
  GB: { fr: "Royaume-Uni", en: "United Kingdom" },
  IE: { fr: "Irlande", en: "Ireland" },
  PT: { fr: "Portugal", en: "Portugal" },
  LU: { fr: "Luxembourg", en: "Luxembourg" },
  CH: { fr: "Suisse", en: "Switzerland" },
  AT: { fr: "Autriche", en: "Austria" },
  US: { fr: "États-Unis", en: "United States" },
  CA: { fr: "Canada", en: "Canada" },
  MA: { fr: "Maroc", en: "Morocco" },
  DZ: { fr: "Algérie", en: "Algeria" },
  TN: { fr: "Tunisie", en: "Tunisia" },
  EG: { fr: "Égypte", en: "Egypt" },
  NG: { fr: "Nigéria", en: "Nigeria" },
  GH: { fr: "Ghana", en: "Ghana" },
  KE: { fr: "Kenya", en: "Kenya" },
  ZA: { fr: "Afrique du Sud", en: "South Africa" },
  SA: { fr: "Arabie saoudite", en: "Saudi Arabia" },
  AE: { fr: "Émirats arabes unis", en: "United Arab Emirates" },
  BR: { fr: "Brésil", en: "Brazil" },
  AR: { fr: "Argentine", en: "Argentina" },
  MX: { fr: "Mexique", en: "Mexico" },
  JP: { fr: "Japon", en: "Japan" },
  CN: { fr: "Chine", en: "China" },
  IN: { fr: "Inde", en: "India" },
  AU: { fr: "Australie", en: "Australia" },
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