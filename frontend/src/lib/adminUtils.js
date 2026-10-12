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

export const money = (v, cur) => {
  if (v == null) return "";
  if (cur === "XOF") return `${Math.round(v).toLocaleString("fr-FR")} FCFA`;
  if (cur === "USD") return `$${Number(v).toFixed(2)}`;
  return `${Number(v).toFixed(2)} €`;
};

export const fmtDate = (d, withTime = false) => {
  if (!d) return "-";
  const dt = new Date(d);
  return withTime ? dt.toLocaleString("fr-FR") : dt.toLocaleDateString("fr-FR");
};

export const STATUSES = ["pending_payment", "paid", "preparing", "cancellation_requested", "shipped", "in_transit", "delivered", "return_requested", "return_approved", "return_shipped", "return_received", "exchange_sent", "cancelled", "returned", "refunded"];
export const STATUS_LABELS = {
  pending_payment: "En attente de paiement", paid: "Payee", preparing: "En preparation",
  cancellation_requested: "Annulation demandee",
  shipped: "Expediee",
  in_transit: "En transit", delivered: "Livree",
  return_requested: "Retour demande", return_approved: "Retour approuve",
  return_shipped: "Retour expedie", return_received: "Retour recu",
  exchange_sent: "Echange envoye",
  cancelled: "Annulee", returned: "Retournee", refunded: "Remboursee",
};
export const STATUS_COLORS = {
  pending_payment: "bg-amber-100 text-amber-800", paid: "bg-blue-100 text-blue-800", preparing: "bg-indigo-100 text-indigo-800",
  cancellation_requested: "bg-red-100 text-red-800 ring-1 ring-red-300",
  shipped: "bg-cyan-100 text-cyan-800", in_transit: "bg-cyan-100 text-cyan-800", delivered: "bg-green-100 text-green-800",
  return_requested: "bg-orange-100 text-orange-800 ring-1 ring-orange-300",
  return_approved: "bg-orange-100 text-orange-800",
  return_shipped: "bg-orange-100 text-orange-800",
  return_received: "bg-orange-200 text-orange-900",
  exchange_sent: "bg-purple-100 text-purple-800",
  cancelled: "bg-gray-200 text-gray-700", returned: "bg-gray-200 text-gray-700",
  refunded: "bg-red-100 text-red-800",
};

export const CARRIERS = ["DHL Express", "UPS", "FedEx", "Chronopost", "Colissimo", "bpost", "Coursier local", "Autre"];

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