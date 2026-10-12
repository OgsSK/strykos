import React, { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { api } from "@/lib/api";

const LEVELS = [
  { score: 0, color: "bg-gray-300", label_fr: "Tres faible", label_en: "Very weak" },
  { score: 1, color: "bg-red-500", label_fr: "Faible", label_en: "Weak" },
  { score: 2, color: "bg-orange-500", label_fr: "Moyen", label_en: "Fair" },
  { score: 3, color: "bg-amber-500", label_fr: "Bon", label_en: "Good" },
  { score: 4, color: "bg-green-500", label_fr: "Fort", label_en: "Strong" },
  { score: 5, color: "bg-green-600", label_fr: "Excellent", label_en: "Excellent" },
];

export default function PasswordStrength({ password, lang = "fr", showCriteria = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Debounce : n'appelle l'API que 300ms après la dernière frappe
  useEffect(() => {
    if (!password) {
      setData({ score: 0, label: "empty", criteria: {} });
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      api.post("/auth/check-password-strength", { password })
        .then((r) => setData(r.data))
        .catch(() => setData({ score: 0, label: "empty", criteria: {} }))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [password]);

  if (!data) return null;
  const level = LEVELS[data.score] || LEVELS[0];
  const pct = (data.score / 5) * 100;

  const criteria = data.criteria || {};
  const criteriaList = [
    { key: "length_8", label_fr: "Au moins 8 caracteres", label_en: "At least 8 characters", met: criteria.length_8 },
    { key: "has_lower", label_fr: "Une minuscule", label_en: "One lowercase", met: criteria.has_lower },
    { key: "has_upper", label_fr: "Une majuscule", label_en: "One uppercase", met: criteria.has_upper },
    { key: "has_digit", label_fr: "Un chiffre", label_en: "One digit", met: criteria.has_digit },
    { key: "has_special", label_fr: "Un caractere special (!@#$...)", label_en: "One special char (!@#$...)", met: criteria.has_special },
  ];

  return (
    <div className="mt-2" data-testid="password-strength">
      {/* Barre */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div className={`h-full transition-all ${level.color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-[11px] font-bold uppercase ${data.score >= 4 ? "text-green-600" : data.score >= 3 ? "text-amber-600" : "text-red-600"}`}>
          {lang === "fr" ? level.label_fr : level.label_en}
        </span>
      </div>

      {/* Critères */}
      {showCriteria && password && (
        <ul className="mt-2 space-y-1">
          {criteriaList.map((c) => (
            <li key={c.key} className={`flex items-center gap-1.5 text-[11px] ${c.met ? "text-green-700" : "text-ink-muted"}`}>
              {c.met ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0" />}
              {lang === "fr" ? c.label_fr : c.label_en}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}