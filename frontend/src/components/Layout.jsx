import React from "react";
import { Outlet } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { Loader2 } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NewsletterBox from "@/components/NewsletterBox";
import CookieNotice from "@/components/CookieNotice";
import WhatsAppButton from "@/components/WhatsAppButton";

export default function Layout() {
  const { settings, authChecked } = useStore();

  // ⭐ Si les settings ne sont pas encore chargés depuis l'API, on affiche un écran de chargement
  if (!settings || !authChecked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5EDE0]">
        <Loader2 className="w-10 h-10 animate-spin text-[#C58B58] mb-4" />
        <p className="text-[#4A2C25] font-heading font-bold uppercase tracking-widest text-sm">
          Chargement de la boutique...
        </p>
      </div>
    );
  }

  // ⭐ Une fois les données chargées, on affiche le site normalement
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <NewsletterBox />
      <Footer />
      <CookieNotice />
      <WhatsAppButton />
    </div>
  );
}