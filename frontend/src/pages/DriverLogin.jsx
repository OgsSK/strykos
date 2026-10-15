import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, apiError, setAuthToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Truck, LogIn } from "lucide-react";
import { useStore } from "@/context/StoreProvider";

export default function DriverLogin() {
  const nav = useNavigate();
  const { setUser } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/driver/login", { email, password });
      if (data.token) setAuthToken(data.token);
      if (data.user && setUser) setUser(data.user);
      toast.success("Connexion réussie");
      setTimeout(() => nav("/livreur", { replace: true }), 400);
    } catch (e) {
      toast.error(apiError(e) || "E-mail ou mot de passe incorrect");
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
          <div className="text-center mb-6">
            <h1 className="font-heading text-2xl font-bold text-ink mb-2">
              Espace livreur
            </h1>
            <p className="text-sm text-ink-soft">
              Connectez-vous pour accéder à votre interface de livraison.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                className="mt-1 rounded-none h-11"
                autoFocus
                required
              />
            </div>

            <div>
              <Label>Mot de passe</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Votre mot de passe"
                className="mt-1 rounded-none h-11"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-brand hover:bg-brand-dark text-white rounded-none h-12 uppercase font-bold tracking-wide"
            >
              {loading ? "Connexion…" : (
                <>
                  <LogIn className="w-4 h-4 mr-2" />
                  Se connecter
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-ink-muted mt-6">
            Mot de passe oublié ?{" "}
            <Link to="/forgot-password" className="text-brand font-semibold hover:underline">
              Réinitialiser
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-ink-muted mt-6">
          Vous êtes un client ?{" "}
          <Link to="/login" className="text-brand font-semibold hover:underline">
            Connexion client
          </Link>
        </p>
      </div>
    </div>
  );
}