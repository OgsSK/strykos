import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LOGIN, REGISTER, EMAIL_CONFIRMATION } from "@/constants/testIds/auth";

export default function Auth({ mode }) {
  const { t, login, register } = useStore();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();

  // ⭐ Récupère la page d'origine pour y retourner après connexion
  // Ex : /login?redirect=/product/le-classique-chocolat
  const redirectTo = searchParams.get("redirect") || "";

  // ⭐ NOUVEAU : paramètres du flux de confirmation d'email
  const emailFromUrl = searchParams.get("email") || "";
  const justRegistered = searchParams.get("registered") === "1";

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", first_name: "", last_name: "", phone: "" });
  const isLogin = mode === "login";
  const setF = (k, v) => setForm({ ...form, [k]: v });

  // ⭐ Pré-remplit l'email si on arrive depuis l'inscription (?email=...)
  useEffect(() => {
    if (emailFromUrl && isLogin && !form.email) {
      setForm((f) => ({ ...f, email: emailFromUrl }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailFromUrl, isLogin]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        // ⭐ Connexion classique
        const u = await login(form.email, form.password);
        toast.success(t("welcome"));

        // Redirection intelligente :
        // 1. Admin → /admin
        // 2. redirectTo présent → page d'origine
        // 3. Sinon → /account
        if (u.role === "admin") {
          nav("/admin", { replace: true });
        } else if (redirectTo) {
          nav(redirectTo, { replace: true });
        } else {
          nav("/account", { replace: true });
        }
      } else {
        // ⭐ NOUVEAU FLUX INSCRIPTION :
        //   1. Le backend crée le compte + envoie l'email de confirmation
        //   2. Le backend NE connecte PAS (requires_confirmation: true)
        //   3. On redirige vers /login avec l'email pré-rempli + un bandeau info
        await register(form);
        toast.success(
          "Compte créé ! Vérifiez votre e-mail pour le confirmer.",
          { duration: 5000 }
        );
        nav(
          `/login?email=${encodeURIComponent(form.email)}&registered=1` +
            (redirectTo ? `&redirect=${encodeURIComponent(redirectTo)}` : ""),
          { replace: true }
        );
      }
    } catch (err) {
      toast.error(apiError(err));
    }
    setLoading(false);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16" data-testid="auth-page">
      <h1 className="font-heading text-3xl font-bold uppercase tracking-tight text-center mb-8">
        {isLogin ? t("loginTitle") : t("registerTitle")}
      </h1>

      {/* ⭐ NOUVEAU : Bandeau "Vérifiez votre boîte mail" après inscription */}
      {justRegistered && isLogin && (
        <div
          className="bg-cream-dark border-l-4 border-brand px-4 py-3 mb-5 rounded"
          data-testid={EMAIL_CONFIRMATION.registeredBanner}
        >
          <p className="text-sm text-ink font-semibold">📩 Vérifiez votre boîte mail</p>
          <p
            className="text-xs text-ink-soft mt-1"
            data-testid={EMAIL_CONFIRMATION.registeredBannerEmail}
          >
            Un lien de confirmation vient d'être envoyé à <strong>{emailFromUrl}</strong>.
            Cliquez dessus pour activer votre compte, puis connectez-vous ici.
          </p>
        </div>
      )}

      {/* Bandeau informatif quand l'utilisateur a été redirigé depuis une autre page */}
      {redirectTo && !justRegistered && (
        <p className="text-center text-sm text-ink-soft bg-secondary/50 border border-border rounded-md px-3 py-2 mb-5">
          {isLogin
            ? "Connectez-vous pour continuer votre commande"
            : "Créez votre compte pour continuer votre commande"}
        </p>
      )}

      <form onSubmit={submit} className="space-y-4">
        {!isLogin && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("firstName")}</Label>
              <Input
                value={form.first_name}
                onChange={(e) => setF("first_name", e.target.value)}
                data-testid={REGISTER.nameInput}
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t("lastName")}</Label>
              <Input
                value={form.last_name}
                onChange={(e) => setF("last_name", e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        )}

        <div>
          <Label>{t("email")}</Label>
          <Input
            type="email"
            required
            value={form.email}
            onChange={(e) => setF("email", e.target.value)}
            data-testid={isLogin ? LOGIN.emailInput : REGISTER.emailInput}
            className="mt-1"
          />
        </div>

        {!isLogin && (
          <div>
            <Label>{t("phone")}</Label>
            <Input
              value={form.phone}
              onChange={(e) => setF("phone", e.target.value)}
              className="mt-1"
            />
          </div>
        )}

        <div>
          <Label>{t("passwordLabel")}</Label>
          <Input
            type="password"
            required
            value={form.password}
            onChange={(e) => setF("password", e.target.value)}
            data-testid={isLogin ? LOGIN.passwordInput : REGISTER.passwordInput}
            className="mt-1"
          />
          {isLogin && (
            <Link
              to="/forgot-password"
              className="block text-right text-xs text-ink-muted hover:text-brand mt-1"
              data-testid={LOGIN.forgotPasswordLink}
            >
              {t("forgotPassword")}
            </Link>
          )}
        </div>

        <Button
          type="submit"
          disabled={loading}
          data-testid={isLogin ? LOGIN.submitButton : REGISTER.submitButton}
          className="w-full bg-brand hover:bg-brand-dark text-white rounded-none h-12 uppercase font-bold tracking-wide"
        >
          {loading ? t("loading") : isLogin ? t("signIn") : t("signUp")}
        </Button>
      </form>

      <p className="text-center text-sm text-ink-muted mt-6">
        {isLogin ? t("noAccount") : t("haveAccount")}{" "}
        {/* ⭐ Préserve ?redirect= et ?email= lors du changement login ↔ register */}
        <Link
          to={
            (isLogin ? "/register" : "/login") +
            (redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : "")
          }
          data-testid={isLogin ? LOGIN.registerLink : REGISTER.loginLink}
          className="text-brand font-semibold hover:underline"
        >
          {isLogin ? t("register") : t("signIn")}
        </Link>
      </p>
    </div>
  );
}