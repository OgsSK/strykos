import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api, apiError, setAuthToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Truck, CheckCircle2, AlertTriangle, Lock } from "lucide-react";
import { useStore } from "@/context/StoreProvider";

export default function DriverSetup() {
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const { setUser } = useStore();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Lien d'invitation manquant ou invalide.");
    }
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Lien d'invitation invalide.");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (!/[A-Za-z]/.test(password)) {
      setError("Le mot de passe doit contenir au moins une lettre.");
      return;
    }
    if (!/\d/.test(password)) {
      setError("Le mot de passe doit contenir au moins un chiffre.");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post("/driver/setup", { token, password });
      // ⭐ Connecte automatiquement le livreur
      if (data.token) setAuthToken(data.token);
      if (data.user && setUser) setUser(data.user);
      toast.success("Compte activé ! Bienvenue 🎉");
      setTimeout(() => nav("/livreur", { replace: true }), 800);
    } catch (e) {
      setError(apiError(e) || "Lien invalide ou expiré.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-cream-dark to-cream flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 bg-ink text-cream px-5 py-3 rounded-full">
            <Truck className="w-6 h-6" />
            <span className="font-heading text-xl font-bold uppercase tracking-wider">
              CAKESSHOP <span className="text-brand">Livreur</span>
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-border">
          {error && !password ? (
            // Cas : lien invalide
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h1 className="font-heading text-2xl font-bold text-ink mb-2">Lien invalide</h1>
              <p className="text-sm text-ink-soft mb-6">{error}</p>
              <p className="text-xs text-ink-muted">
                Contactez votre administrateur pour recevoir une nouvelle invitation.
              </p>
            </div>
          ) : (
            // Cas : formulaire de création
            <>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-brand/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-8 h-8 text-brand" />
                </div>
                <h1 className="font-heading text-2xl font-bold text-ink mb-2">
                  Créez votre mot de passe
                </h1>
                <p className="text-sm text-ink-soft">
                  Bienvenue dans l'équipe ! Choisissez un mot de passe sécurisé pour votre compte livreur.
                </p>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <div>
                  <Label>Mot de passe</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 caractères"
                    className="mt-1 rounded-none h-11"
                    autoFocus
                    required
                  />
                  <p className="text-[11px] text-ink-muted mt-1">
                    Au moins 8 caractères, une lettre et un chiffre.
                  </p>
                </div>

                <div>
                  <Label>Confirmer le mot de passe</Label>
                  <Input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Retapez le même mot de passe"
                    className="mt-1 rounded-none h-11"
                    required
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 p-3 text-sm text-red-800 rounded">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand hover:bg-brand-dark text-white rounded-none h-12 uppercase font-bold tracking-wide"
                >
                  {loading ? "Activation…" : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Créer mon compte
                    </>
                  )}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-ink-muted mt-6">
          Une fois activé, vous serez redirigé vers votre espace livreur.
        </p>
      </div>
    </div>
  );
}