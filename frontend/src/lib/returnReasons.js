export const RETURN_REASONS = [
  { value: "defect", label_fr: "Produit défectueux", label_en: "Defective product" },
  { value: "wrong_size", label_fr: "Mauvaise taille", label_en: "Wrong size" },
  { value: "not_as_described", label_fr: "Ne correspond pas à la description", label_en: "Not as described" },
  { value: "damaged", label_fr: "Endommagé pendant le transport", label_en: "Damaged in transit" },
  { value: "wrong_item", label_fr: "Mauvais article reçu", label_en: "Wrong item received" },
  { value: "changed_mind", label_fr: "Changement d'avis", label_en: "Change of mind" },
  { value: "other", label_fr: "Autre", label_en: "Other" },
];

// Raisons ou les frais de retour sont PRIS EN CHARGE par STRYKOS
export const REASONS_AT_STRYKOS_EXPENSE = ["defect", "not_as_described", "damaged", "wrong_item"];

export const isStrykosExpense = (reason) => REASONS_AT_STRYKOS_EXPENSE.includes(reason);