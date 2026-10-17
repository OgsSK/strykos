// Motifs de RÉCLAMATION (pas de retour) — gâteaux uniquement
export const RETURN_REASONS = [
  { value: "damaged", label_fr: "Gâteau endommagé à la réception", label_en: "Cake damaged on arrival" },
  { value: "not_conforme", label_fr: "Ne correspond pas à ma commande", label_en: "Does not match my order" },
  { value: "quality", label_fr: "Problème de qualité ou de fraîcheur", label_en: "Quality or freshness issue" },
  { value: "missing", label_fr: "Éléments manquants (bougies, décorations...)", label_en: "Missing items (candles, decorations...)" },
  { value: "late", label_fr: "Livré trop tard / hors délai", label_en: "Delivered too late" },
  { value: "other", label_fr: "Autre problème", label_en: "Other issue" },
];

// Aucun frais de retour applicable (le gâteau est perdu, pas de renvoi)
export const REASONS_AT_CAKESSHOP_EXPENSE = [];
export const isStrykosExpense = () => false;

// Délai de réclamation : 24h après livraison
export const CLAIM_WINDOW_HOURS = 24;