import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";

export function ForgotPassword() {
  const { t, lang } = useStore();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setLoading(true);
    try { await api.post("/auth/forgot-password", { email, lang }); setSent(true); } catch (err) { toast.error(apiError(err)); }
    setLoading(false);
  };
  return (
    <div className="max-w-md mx-auto px-4 py-16" data-testid="forgot-page">
      <h1 className="font-heading text-3xl font-bold uppercase tracking-tight text-center mb-3">{t("forgotTitle")}</h1>
      {sent ? (
        <div className="text-center border border-border p-6" data-testid="forgot-sent">
          <MailCheck className="w-10 h-10 mx-auto text-green-600 mb-3" />
          <p className="text-sm text-ink-soft">{t("forgotSent")}</p>
          <Link to="/login" className="inline-block mt-4 text-sm text-brand font-semibold hover:underline">{t("signIn")}</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-ink-soft text-center">{t("forgotIntro")}</p>
          <div><Label>{t("email")}</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" data-testid="forgot-email" /></div>
          <Button type="submit" disabled={loading} className="w-full bg-brand hover:bg-brand-dark rounded-none h-12 uppercase font-bold" data-testid="forgot-submit">{loading ? t("loading") : t("sendLink")}</Button>
          <Link to="/login" className="block text-center text-sm text-ink-muted hover:text-brand">{t("signIn")}</Link>
        </form>
      )}
    </div>
  );
}

export function ResetPassword() {
  const { t } = useStore();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get("token") || "";
  const [pw, setPw] = useState({ a: "", b: "" });
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (pw.a !== pw.b) return toast.error(t("passwordsMismatch"));
    setLoading(true);
    try { await api.post("/auth/reset-password", { token, password: pw.a }); toast.success(t("resetDone")); nav("/login"); }
    catch (err) { toast.error(apiError(err)); }
    setLoading(false);
  };
  return (
    <div className="max-w-md mx-auto px-4 py-16" data-testid="reset-page">
      <h1 className="font-heading text-3xl font-bold uppercase tracking-tight text-center mb-6">{t("resetTitle")}</h1>
      <form onSubmit={submit} className="space-y-4">
        <div><Label>{t("newPassword")}</Label><Input type="password" required minLength={8} value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} className="mt-1" data-testid="reset-password" /></div>
        <div><Label>{t("confirmPassword")}</Label><Input type="password" required minLength={8} value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} className="mt-1" data-testid="reset-password-confirm" /></div>
        <Button type="submit" disabled={loading || !token} className="w-full bg-brand hover:bg-brand-dark rounded-none h-12 uppercase font-bold" data-testid="reset-submit">{loading ? t("loading") : t("resetBtn")}</Button>
      </form>
    </div>
  );
}
