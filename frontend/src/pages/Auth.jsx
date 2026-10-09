import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Auth({ mode }) {
  const { t, login, register } = useStore();
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", first_name: "", last_name: "", phone: "" });
  const isLogin = mode === "login";
  const setF = (k, v) => setForm({ ...form, [k]: v });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = isLogin ? await login(form.email, form.password) : await register(form);
      toast.success(t("welcome"));
      nav(u.role === "admin" ? "/admin" : "/account");
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
      <form onSubmit={submit} className="space-y-4">
        {!isLogin && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t("firstName")}</Label><Input value={form.first_name} onChange={(e) => setF("first_name", e.target.value)} data-testid="register-firstname" className="mt-1" /></div>
            <div><Label>{t("lastName")}</Label><Input value={form.last_name} onChange={(e) => setF("last_name", e.target.value)} className="mt-1" /></div>
          </div>
        )}
        <div><Label>{t("email")}</Label><Input type="email" required value={form.email} onChange={(e) => setF("email", e.target.value)} data-testid="auth-email" className="mt-1" /></div>
        {!isLogin && <div><Label>{t("phone")}</Label><Input value={form.phone} onChange={(e) => setF("phone", e.target.value)} className="mt-1" /></div>}
        <div><Label>{t("passwordLabel")}</Label><Input type="password" required value={form.password} onChange={(e) => setF("password", e.target.value)} data-testid="auth-password" className="mt-1" /></div>
        <Button type="submit" disabled={loading} data-testid="auth-submit"
          className="w-full bg-brand hover:bg-brand-dark text-white rounded-none h-12 uppercase font-bold tracking-wide">
          {loading ? t("loading") : isLogin ? t("signIn") : t("signUp")}
        </Button>
      </form>
      <p className="text-center text-sm text-ink-muted mt-6">
        {isLogin ? t("noAccount") : t("haveAccount")}{" "}
        <Link to={isLogin ? "/register" : "/login"} className="text-brand font-semibold hover:underline">
          {isLogin ? t("register") : t("signIn")}
        </Link>
      </p>
    </div>
  );
}
