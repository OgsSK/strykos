import React from "react";
import { Outlet } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NewsletterBox from "@/components/NewsletterBox";
import CookieNotice from "@/components/CookieNotice";
import WhatsAppButton from "@/components/WhatsAppButton";

export default function Layout() {
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