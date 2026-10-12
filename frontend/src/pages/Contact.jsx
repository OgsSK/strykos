import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Send, CheckCircle, MessageSquare, User, AtSign, FileText, AlertCircle
} from "lucide-react";

export default function ContactPage() {
  const { lang } = useStore();
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const onChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name || !form.email || !form.subject || !form.message) {
      setError(lang === "fr" ? "Merci de remplir tous les champs." : "Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/contact", { ...form, lang });
      setSent(true);
    } catch (err) {
      setError(apiError(err));
    }
    setLoading(false);
  };

  if (sent) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center" data-testid="contact-success">
        <div className="inline-flex w-16 h-16 items-center justify-center border-2 border-brand mb-6">
          <CheckCircle className="w-8 h-8 text-brand" />
        </div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold uppercase tracking-tight mb-3">
          {lang === "fr" ? "Message envoyé" : "Message sent"}
        </h1>
        <p className="text-ink-soft leading-relaxed mb-6">
          {lang === "fr"
            ? "Merci de nous avoir contactés. Nous vous répondrons sous 24 à 48 heures ouvrées."
            : "Thanks for reaching out. We'll reply within 24 to 48 business hours."}
        </p>
        <Link to="/" className="inline-block bg-ink text-white px-6 py-3 text-xs font-bold uppercase tracking-wide hover:bg-brand transition-colors">
          {lang === "fr" ? "Retour à l'accueil" : "Back to home"}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12" data-testid="contact-page">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 mb-3">
          <MessageSquare className="w-5 h-5 text-brand" />
          <span className="text-xs uppercase tracking-wider font-semibold text-ink-muted">
            Contact
          </span>
        </div>
        <h1 className="font-heading text-3xl sm:text-4xl font-bold uppercase tracking-tight mb-3">
          {lang === "fr" ? "Contactez-nous" : "Get in touch"}
        </h1>
        <p className="text-ink-soft leading-relaxed">
          {lang === "fr"
            ? "Une question sur une commande, un produit, ou envie d'échanger ? Notre équipe est à votre écoute et vous répond sous 24 à 48 heures ouvrées."
            : "A question about an order, a product, or just want to chat? Our team is here and replies within 24 to 48 business hours."}
        </p>
      </div>

      {/* Formulaire */}
      <form onSubmit={submit} className="border border-border bg-white p-6 sm:p-8" data-testid="contact-form">
        {error && (
          <div className="mb-5 border border-brand/30 bg-brand/5 p-3 flex gap-2 text-sm text-brand">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-5 mb-5">
          <div>
            <Label htmlFor="name" className="flex items-center gap-2 text-xs uppercase tracking-wider text-ink-muted">
              <User className="w-3.5 h-3.5" /> {lang === "fr" ? "Nom complet" : "Full name"}
            </Label>
            <Input id="name" name="name" value={form.name} onChange={onChange}
              placeholder={lang === "fr" ? "Votre nom" : "Your name"} className="mt-2 rounded-none" />
          </div>
          <div>
            <Label htmlFor="email" className="flex items-center gap-2 text-xs uppercase tracking-wider text-ink-muted">
              <AtSign className="w-3.5 h-3.5" /> {lang === "fr" ? "E-mail" : "Email"}
            </Label>
            <Input id="email" name="email" type="email" value={form.email} onChange={onChange}
              placeholder="votre@email.com" className="mt-2 rounded-none" />
          </div>
        </div>

        <div className="mb-5">
          <Label htmlFor="subject" className="flex items-center gap-2 text-xs uppercase tracking-wider text-ink-muted">
            <FileText className="w-3.5 h-3.5" /> {lang === "fr" ? "Sujet" : "Subject"}
          </Label>
          <Input id="subject" name="subject" value={form.subject} onChange={onChange}
            placeholder={lang === "fr" ? "Ex : Question sur ma commande" : "E.g. Question about my order"}
            className="mt-2 rounded-none" />
        </div>

        <div className="mb-6">
          <Label htmlFor="message" className="flex items-center gap-2 text-xs uppercase tracking-wider text-ink-muted">
            <MessageSquare className="w-3.5 h-3.5" /> {lang === "fr" ? "Message" : "Message"}
          </Label>
          <textarea
            id="message" name="message" rows={7} value={form.message} onChange={onChange}
            placeholder={lang === "fr" ? "Décrivez votre demande..." : "Describe your request..."}
            className="mt-2 w-full border border-input bg-white p-3 text-sm focus:outline-none focus:border-brand resize-none"
          />
        </div>

        <Button type="submit" disabled={loading}
          className="w-full bg-brand hover:bg-brand-dark rounded-none h-12 px-8 uppercase font-bold tracking-wide">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          {loading
            ? (lang === "fr" ? "Envoi..." : "Sending...")
            : (lang === "fr" ? "Envoyer le message" : "Send message")}
        </Button>
      </form>
    </div>
  );
}