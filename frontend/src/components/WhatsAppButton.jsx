import React from "react";
import { MessageCircle } from "lucide-react";
import { useStore } from "@/context/StoreProvider";

export default function WhatsAppButton() {
  const { settings, lang } = useStore();
  const whatsapp = settings?.site?.whatsapp;

  // Affiche uniquement si un numéro est renseigné dans l'admin
  if (!whatsapp || !whatsapp.trim()) return null;

  const phone = whatsapp.replace(/[^0-9]/g, "");
  const message = lang === "fr"
    ? "Bonjour, je voudrais des informations sur vos gâteaux 🎂"
    : "Hello, I'd like information about your cakes 🎂";

  return (
    <a
      href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-6 right-6 z-40 bg-[#25D366] hover:bg-[#1EBE5A] text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg transition-all hover:scale-105"
      title={lang === "fr" ? "Nous contacter sur WhatsApp" : "Contact us on WhatsApp"}
      data-testid="whatsapp-btn"
    >
      <MessageCircle className="w-6 h-6" strokeWidth={2.5} />
    </a>
  );
}