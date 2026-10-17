import { api } from "@/lib/api";

export const BACKEND = process.env.REACT_APP_BACKEND_URL;

// Supabase Storage publique
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || "https://ynyzeryepumaqunvspoy.supabase.co";
const SUPABASE_BUCKET = "strykos-media";

// Transforme /api/media/strykos/images/xxx.jpg en URL Supabase Storage directe (CDN rapide)
export const mediaSrc = (url) => {
  if (!url) return "";
  if (url.startsWith("/api/media/")) {
    const path = url.replace("/api/media/", "");
    return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${path}`;
  }
  return url;
};

// ⭐ MODIFIÉ : locale-aware + GBP supporté + XOF conservé (legacy)
// Usage :
//   money(34.9, "EUR")             → "34,90 €" (fr-FR par défaut)
//   money(34.9, "EUR", "en-GB")    → "€34.90"
//   money(34.9, "GBP")             → "34,90 £GB"
//   money(34.9, "GBP", "en-GB")    → "£34.90"
//   money(34.9, "USD", "en-US")    → "$34.90"
//   money(22855, "XOF")            → "22 900 F CFA" (arrondi centaine, legacy)
export const money = (v, cur = "EUR", locale = "fr-FR") => {
  if (v == null) return "";
  let num = Number(v);
  if (isNaN(num)) return "";

  // ⭐ Arrondi spécial pour XOF (arrondi à la centaine) — legacy uniquement
  if (cur === "XOF") {
    num = Math.round(num / 100) * 100;
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: cur,
      minimumFractionDigits: cur === "XOF" ? 0 : 2,
      maximumFractionDigits: cur === "XOF" ? 0 : 2,
    }).format(num);
  } catch {
    // Fallback safe si la devise n'est pas supportée par Intl (very old browsers)
    return `${num.toFixed(2)} ${cur}`;
  }
};

export const fmtDate = (d, withTime = false, locale = "fr-FR") => {
  if (!d) return "-";
  const dt = new Date(d);
  return withTime ? dt.toLocaleString(locale) : dt.toLocaleDateString(locale);
};

// ⭐ Statuts disponibles dans les flux CAKESSHOP
// Note : "return_shipped" et "exchange_sent" sont gardés pour compat historique
// mais ne sont plus utilisés dans les nouveaux flux.
export const STATUSES = [
  "pending_payment",
  "paid",
  "preparing",
  "cancellation_requested",
  "shipped",
  "in_transit",
  "delivered",
  "return_requested",
  "return_approved",
  "return_received",
  "cancelled",
  "returned",
  "refunded",
];

export const STATUS_LABELS = {
  // Flux principal
  pending_payment: "En attente de paiement",
  paid: "Payée",
  preparing: "En préparation",
  cancellation_requested: "Annulation demandée",
  shipped: "Expédiée",
  in_transit: "En transit",
  delivered: "Livrée",
  cancelled: "Annulée",
  // ⭐ Réclamation client (ex "retour")
  return_requested: "Réclamation reçue",
  return_approved: "Réclamation acceptée",
  return_received: "Réclamation en traitement",
  // Compat ancien flux (legacy)
  return_shipped: "Réclamation en cours",
  exchange_sent: "Échange envoyé",
  // Finaux
  returned: "Retournée",
  refunded: "Remboursée",
};

export const STATUS_COLORS = {
  // Flux principal
  pending_payment: "bg-amber-100 text-amber-800",
  paid: "bg-blue-100 text-blue-800",
  preparing: "bg-indigo-100 text-indigo-800",
  cancellation_requested: "bg-red-100 text-red-800 ring-1 ring-red-300",
  shipped: "bg-cyan-100 text-cyan-800",
  in_transit: "bg-cyan-100 text-cyan-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-gray-200 text-gray-700",
  // Réclamation (ex "retour") — orange pour attirer l'attention
  return_requested: "bg-orange-100 text-orange-800 ring-1 ring-orange-300",
  return_approved: "bg-orange-100 text-orange-800",
  return_received: "bg-orange-200 text-orange-900",
  return_shipped: "bg-orange-100 text-orange-800",
  exchange_sent: "bg-purple-100 text-purple-800",
  // Finaux
  returned: "bg-gray-200 text-gray-700",
  refunded: "bg-red-100 text-red-800",
};

// ⭐ MODIFIÉ : transporteurs alignés sur le marché européen
// Ordre : internationaux EU → nationaux FR/BE/NL/DE/ES/IT → local
export const CARRIERS = [
  // Transporteurs internationaux majeurs (tous basés/opérant en Europe)
  "DHL Express",
  "UPS",
  "FedEx",
  "GLS",
  "DPD",
  "TNT",
  // Transporteurs nationaux — France
  "Chronopost",
  "Colissimo",
  "Mondial Relay",
  // Transporteurs nationaux — Benelux / Allemagne / Europe du Sud
  "bpost",
  "PostNL",
  "Deutsche Post",
  "Correos",
  "Poste Italiane",
  // Local
  "Coursier local",
  "Autre",
];

const CHUNK = 4 * 1024 * 1024;

export async function uploadMedia(file, onProgress = () => {}) {
  if (file.size <= CHUNK) {
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await api.post("/admin/media/upload", fd, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => onProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 50),
    });
    return data;
  }
  const upload_id = crypto.randomUUID();
  const total = Math.ceil(file.size / CHUNK);
  for (let i = 0; i < total; i++) {
    const fd = new FormData();
    fd.append("upload_id", upload_id);
    fd.append("index", String(i));
    fd.append("chunk", file.slice(i * CHUNK, (i + 1) * CHUNK), `part-${i}`);
    await api.post("/admin/media/upload/chunk", fd, { headers: { "Content-Type": "multipart/form-data" } });
    onProgress(Math.round(((i + 1) / total) * 95));
  }
  const { data } = await api.post("/admin/media/upload/complete", {
    upload_id, filename: file.name, content_type: file.type, total_chunks: total,
  });
  onProgress(100);
  return data;
}

export async function downloadCsv(path, filename) {
  const { data } = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}