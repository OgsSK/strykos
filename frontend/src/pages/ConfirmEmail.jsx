import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, apiError, setAuthToken } from "@/lib/api";
import { useStore } from "@/context/StoreProvider";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { EMAIL_CONFIRMATION } from "@/constants/testIds/auth";

export default function ConfirmEmail() {
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const { setUser } = useStore();
  const [status, setStatus] = useState("loading"); // loading | success | error
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setError("Lien invalide : aucun token fourni.");
      return;
    }
    api.post("/auth/confirm-email", { token })
      .then(({ data }) => {
        // ⭐ Connecte l'utilisateur automatiquement
        if (data.token) setAuthToken(data.token);
        if (data.user && setUser) setUser(data.user);
        toast.success("Compte confirmé ! Bienvenue 🎉");
        setStatus("success");
        // Redirection auto vers /account après 1,5s
        setTimeout(() => nav("/account", { replace: true }), 1500);
      })
      .catch((e) => {
        setStatus("error");
        setError(apiError(e) || "Lien invalide ou expiré.");
      });
  }, [searchParams, nav, setUser]);

  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center" data-testid={EMAIL_CONFIRMATION.page}>
      {status === "loading" && (
        <div data-testid={EMAIL_CONFIRMATION.loading}>
          <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <h1 className="font-heading text-2xl font-bold text-ink mb-2">
            Confirmation en cours...
          </h1>
          <p className="text-ink-soft text-sm">Nous vérifions votre lien, un instant.</p>
        </div>
      )}

      {status === "success" && (
        <div data-testid={EMAIL_CONFIRMATION.success}>
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">✅</span>
          </div>
          <h1 className="font-heading text-2xl font-bold text-ink mb-2">Compte confirmé !</h1>
          <p className="text-ink-soft text-sm mb-6">
            Votre compte est maintenant actif. Redirection vers votre espace...
          </p>
          <Button
            onClick={() => nav("/account")}
            className="bg-brand hover:bg-brand-dark text-white rounded-none"
            data-testid={EMAIL_CONFIRMATION.goToAccountButton}
          >
            Aller à mon compte
          </Button>
        </div>
      )}

      {status === "error" && (
        <div data-testid={EMAIL_CONFIRMATION.error}>
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">⚠️</span>
          </div>
          <h1 className="font-heading text-2xl font-bold text-ink mb-2">Lien invalide</h1>
          <p className="text-ink-soft text-sm mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <Link to="/login" data-testid={EMAIL_CONFIRMATION.loginLink}>
              <Button variant="outline" className="rounded-none">Se connecter</Button>
            </Link>
            <Link to="/register" data-testid={EMAIL_CONFIRMATION.registerLink}>
              <Button className="bg-brand hover:bg-brand-dark text-white rounded-none">
                Créer un compte
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}