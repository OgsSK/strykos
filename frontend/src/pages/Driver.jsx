import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { useStore } from "@/context/StoreProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Truck, LogOut, CheckCircle2, XCircle, RotateCcw,
  User, Package, Clock, TrendingUp, KeyRound, History,
  Phone, Save, ChevronLeft, ChevronRight, Calendar, MapPin,
  Lock, Mail, AlertTriangle, Eye, EyeOff,
} from "lucide-react";
import PasswordStrength from "@/components/PasswordStrength";

export default function Driver() {
  const nav = useNavigate();
  const { user, logout, setUser } = useStore();

  const [tab, setTab] = useState("scan"); // scan | history | profile

  // État OTP
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState("");
  const inputsRef = useRef([]);

  // Stats
  const [stats, setStats] = useState(null);

  // Historique
  const [history, setHistory] = useState(null);
  const [historyPeriod, setHistoryPeriod] = useState("all");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Profil
  const [profileForm, setProfileForm] = useState({
    first_name: user?.first_name || "",
    last_name: user?.last_name || "",
    phone: user?.phone || "",
  });
  const [profileSaving, setProfileSaving] = useState(false);

  // ⭐ Sécurité : changement mot de passe
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: "", newPwd: "", confirm: "" });

  // ⭐ Sécurité : changement email
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [emailForm, setEmailForm] = useState({ password: "", newEmail: "" });
  const [pendingEmail, setPendingEmail] = useState(null);

  const [settingsBusy, setSettingsBusy] = useState(false);

  // Charge les stats au démarrage et après chaque succès
  useEffect(() => {
    api.get("/driver/stats").then((r) => setStats(r.data)).catch(() => {});
  }, [success]);

  // Auto-focus sur le 1er champ OTP
  useEffect(() => {
    if (tab === "scan" && !success && inputsRef.current[0]) {
      inputsRef.current[0].focus();
    }
  }, [success, tab]);

  // Charge l'historique quand on change d'onglet / filtre / page
  useEffect(() => {
    if (tab !== "history") return;
    setHistoryLoading(true);
    api.get(`/driver/history?period=${historyPeriod}&page=${historyPage}&per_page=20`)
      .then((r) => setHistory(r.data))
      .catch(() => setHistory(null))
      .finally(() => setHistoryLoading(false));
  }, [tab, historyPeriod, historyPage]);

  // Sync profileForm quand user change
  useEffect(() => {
    if (user) {
      setProfileForm({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        phone: user.phone || "",
      });
    }
  }, [user?.id]);

  // Charge le changement d'email en cours
  useEffect(() => {
    if (!user) return;
    api.get("/auth/pending-email-change")
      .then((r) => setPendingEmail(r.data.pending || null))
      .catch(() => setPendingEmail(null));
  }, [user?.id]);

  // ============ OTP ============
  const handleChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError("");
    if (digit && index < 5) inputsRef.current[index + 1]?.focus();
    if (digit && index === 5 && next.every((d) => d)) {
      setTimeout(() => submitCode(next.join("")), 100);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = pasted.split("").concat(["", "", "", "", "", ""]).slice(0, 6);
    setDigits(next);
    if (pasted.length === 6) setTimeout(() => submitCode(pasted), 100);
  };

  const submitCode = async (code) => {
    if (!code || code.length !== 6) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/driver/validate-code", { code });
      setSuccess(data.order);
      setDigits(["", "", "", "", "", ""]);
      toast.success("Livraison validée !");
    } catch (e) {
      setError(apiError(e) || "Code invalide");
      setDigits(["", "", "", "", "", ""]);
      setTimeout(() => inputsRef.current[0]?.focus(), 100);
    }
    setLoading(false);
  };

  const resetAfterSuccess = () => {
    setSuccess(null);
    setError("");
    setDigits(["", "", "", "", "", ""]);
    setTimeout(() => inputsRef.current[0]?.focus(), 100);
  };

  // ============ Profil ============
  const saveProfile = async () => {
    setProfileSaving(true);
    try {
      const { data } = await api.put("/driver/profile", profileForm);
      if (setUser) setUser(data);
      toast.success("Profil mis à jour");
    } catch (e) {
      toast.error(apiError(e));
    }
    setProfileSaving(false);
  };

  // ============ Mot de passe ============
  const submitChangePwd = async () => {
    if (!pwdForm.current || !pwdForm.newPwd || !pwdForm.confirm) {
      return toast.error("Remplissez tous les champs");
    }
    if (pwdForm.newPwd.length < 8) {
      return toast.error("Minimum 8 caractères");
    }
    if (pwdForm.newPwd !== pwdForm.confirm) {
      return toast.error("Les mots de passe ne correspondent pas");
    }
    setSettingsBusy(true);
    try {
      await api.post("/auth/change-password", {
        current_password: pwdForm.current,
        new_password: pwdForm.newPwd,
      });
      toast.success("Mot de passe modifié");
      setShowChangePwd(false);
      setPwdForm({ current: "", newPwd: "", confirm: "" });
    } catch (e) {
      toast.error(apiError(e));
    }
    setSettingsBusy(false);
  };

  // ============ Email ============
  const submitChangeEmail = async () => {
    if (!emailForm.password || !emailForm.newEmail) {
      return toast.error("Remplissez tous les champs");
    }
    if (emailForm.newEmail.toLowerCase() === (user.email || "").toLowerCase()) {
      return toast.error("C'est votre email actuel");
    }
    setSettingsBusy(true);
    try {
      await api.post("/auth/request-email-change", {
        password: emailForm.password,
        new_email: emailForm.newEmail,
      });
      toast.success(
        "2 emails envoyés. Confirmez depuis vos deux adresses.",
        { duration: 7000 }
      );
      setShowChangeEmail(false);
      setEmailForm({ password: "", newEmail: "" });
      // Recharge le pending
      api.get("/auth/pending-email-change")
        .then((r) => setPendingEmail(r.data.pending || null))
        .catch(() => {});
    } catch (e) {
      toast.error(apiError(e));
    }
    setSettingsBusy(false);
  };

  const cancelPendingEmail = async () => {
    if (!window.confirm("Annuler le changement d'email en cours ?")) return;
    try {
      await api.post("/auth/cancel-email-change");
      toast.success("Changement annulé");
      setPendingEmail(null);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const onLogout = async () => {
    if (!window.confirm("Se déconnecter ?")) return;
    await logout();
    nav("/livreur/login", { replace: true });
  };

  // ============ Écran succès (après validation OTP) ============
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-cream to-green-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-green-200 animate-fade-up">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-12 h-12 text-green-600" />
            </div>
            <h1 className="font-heading text-3xl font-bold text-green-900 mb-2">
              Livraison confirmée !
            </h1>
            <div className="mt-6 space-y-3 text-left bg-green-50 rounded-lg p-4 border border-green-200">
              <div className="flex items-center gap-2 text-sm text-green-900">
                <Package className="w-4 h-4 text-green-700 shrink-0" />
                <span className="text-ink-muted">Commande :</span>
                <strong className="font-mono">{success.order_number}</strong>
              </div>
              <div className="flex items-center gap-2 text-sm text-green-900">
                <User className="w-4 h-4 text-green-700 shrink-0" />
                <span className="text-ink-muted">Client :</span>
                <strong>{success.first_name || "Client"}</strong>
              </div>
              {success.city && (
                <div className="flex items-center gap-2 text-sm text-green-900">
                  <MapPin className="w-4 h-4 text-green-700 shrink-0" />
                  <span className="text-ink-muted">Ville :</span>
                  <strong>{success.city}</strong>
                </div>
              )}
            </div>
            {stats && (
              <div className="mt-6 flex items-center justify-center gap-2 text-sm text-green-700 bg-green-100 px-4 py-2 rounded-full">
                <TrendingUp className="w-4 h-4" />
                <span className="font-semibold">{stats.today}</span>
                <span>livraison{stats.today > 1 ? "s" : ""} aujourd'hui</span>
              </div>
            )}
            <Button
              onClick={resetAfterSuccess}
              className="mt-8 w-full bg-green-600 hover:bg-green-700 text-white rounded-none h-12 uppercase font-bold tracking-wide"
            >
              <Package className="w-4 h-4 mr-2" />
              Nouvelle livraison
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ============ Interface principale ============
  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-cream-dark to-cream pb-20">
      {/* Header */}
      <header className="bg-ink text-cream sticky top-0 z-20">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="inline-flex items-center gap-2">
            <Truck className="w-5 h-5" />
            <span className="font-heading text-sm font-bold uppercase tracking-wider">
              CAKESSHOP <span className="text-brand">Livreur</span>
            </span>
          </div>
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 text-xs text-cream/70 hover:text-cream transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>

        {/* Onglets */}
        <div className="max-w-md mx-auto px-4 flex border-t border-cream/10">
          {[
            { key: "scan", label: "Valider", icon: KeyRound },
            { key: "history", label: "Historique", icon: History },
            { key: "profile", label: "Profil", icon: User },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 inline-flex items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 ${
                  tab === t.key
                    ? "text-brand border-brand"
                    : "text-cream/60 border-transparent hover:text-cream"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6">
        {/* ============ ONGLET : SCAN ============ */}
        {tab === "scan" && (
          <>
            <div className="text-center mb-6">
              <h1 className="font-heading text-2xl font-bold text-ink">
                Bonjour {user?.first_name || "chauffeur"} 👋
              </h1>
              <p className="text-sm text-ink-soft mt-1">
                Prêt à valider une livraison ?
              </p>
            </div>

            {stats && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white rounded-xl p-3 border border-border shadow-sm text-center">
                  <div className="text-2xl font-bold text-brand">{stats.today}</div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-muted mt-0.5">Aujourd'hui</div>
                </div>
                <div className="bg-white rounded-xl p-3 border border-border shadow-sm text-center">
                  <div className="text-2xl font-bold text-ink">{stats.week}</div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-muted mt-0.5">Cette semaine</div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-xl p-6 border border-border">
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-brand/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <KeyRound className="w-7 h-7 text-brand" />
                </div>
                <h2 className="font-heading text-lg font-bold text-ink">
                  Code de livraison
                </h2>
                <p className="text-xs text-ink-muted mt-1">
                  Demandez au client son code à 6 chiffres
                </p>
              </div>

              <div className="grid grid-cols-6 gap-2 mb-6" onPaste={handlePaste}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => (inputsRef.current[i] = el)}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={d}
                    disabled={loading}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className={`w-full aspect-square text-center text-2xl font-bold rounded-lg border-2 outline-none transition-all ${
                      d
                        ? "border-brand bg-brand/5 text-brand"
                        : "border-border bg-white text-ink"
                    } focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50`}
                  />
                ))}
              </div>

              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-red-700 text-sm font-semibold mb-1">
                    <XCircle className="w-4 h-4" />
                    Code invalide
                  </div>
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}

              <Button
                onClick={() => submitCode(digits.join(""))}
                disabled={loading || digits.some((d) => !d)}
                className="w-full bg-brand hover:bg-brand-dark text-white rounded-none h-12 uppercase font-bold tracking-wide disabled:opacity-40"
              >
                {loading ? (
                  <>
                    <RotateCcw className="w-4 h-4 mr-2 animate-spin" />
                    Validation…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Valider la livraison
                  </>
                )}
              </Button>

              <button
                onClick={() => {
                  const phone = "+223 00000000"; // ← À personnaliser avec le vrai numéro admin
                  window.location.href = `tel:${phone}`;
                }}
                className="mt-4 w-full text-xs text-ink-muted hover:text-brand inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                Contacter l'administrateur
              </button>
            </div>
          </>
        )}

        {/* ============ ONGLET : HISTORIQUE ============ */}
        {tab === "history" && (
          <>
            <h1 className="font-heading text-2xl font-bold text-ink mb-4">
              Mon historique
            </h1>

            <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
              {[
                { k: "today", l: "Aujourd'hui" },
                { k: "week", l: "Semaine" },
                { k: "month", l: "Mois" },
                { k: "all", l: "Tout" },
              ].map((p) => (
                <button
                  key={p.k}
                  onClick={() => { setHistoryPeriod(p.k); setHistoryPage(1); }}
                  className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                    historyPeriod === p.k
                      ? "bg-brand text-white"
                      : "bg-white border border-border text-ink-muted hover:border-brand"
                  }`}
                >
                  {p.l}
                </button>
              ))}
            </div>

            {stats && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-white rounded-lg p-3 border border-border text-center">
                  <div className="text-xl font-bold text-brand">{stats.today}</div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-muted">Aujourd'hui</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-border text-center">
                  <div className="text-xl font-bold text-ink">{stats.month}</div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-muted">Ce mois</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-border text-center">
                  <div className="text-xl font-bold text-green-700">{stats.total}</div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-muted">Total</div>
                </div>
              </div>
            )}

            {historyLoading ? (
              <div className="text-center py-12 text-ink-muted">
                <RotateCcw className="w-6 h-6 animate-spin mx-auto mb-2" />
                Chargement…
              </div>
            ) : !history || history.orders.length === 0 ? (
              <div className="bg-white rounded-xl border border-border p-8 text-center">
                <Package className="w-10 h-10 text-ink-muted mx-auto mb-3 opacity-50" />
                <p className="text-sm text-ink-muted">
                  Aucune livraison sur cette période
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.orders.map((o, i) => (
                  <div key={i} className="bg-white rounded-xl p-4 border border-border">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-ink flex items-center gap-2">
                          <Package className="w-4 h-4 text-brand shrink-0" />
                          <span className="font-mono text-xs">{o.order_number}</span>
                        </div>
                        <div className="text-xs text-ink-soft mt-1 flex items-center gap-3 flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {o.first_name} {o.last_name}
                          </span>
                          {o.city && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {o.city}
                            </span>
                          )}
                        </div>
                        {o.delivered_at && (
                          <div className="text-[11px] text-ink-muted mt-2 inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(o.delivered_at).toLocaleString("fr-FR", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] uppercase tracking-wider px-2 py-1 bg-green-100 text-green-800 rounded-full whitespace-nowrap">
                        ✓ Livré
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {history && history.pages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-5">
                <button
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={history.page <= 1}
                  className="w-9 h-9 rounded-full bg-white border border-border flex items-center justify-center hover:border-brand disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-ink-muted">
                  Page {history.page} / {history.pages}
                </span>
                <button
                  onClick={() => setHistoryPage((p) => Math.min(history.pages, p + 1))}
                  disabled={history.page >= history.pages}
                  className="w-9 h-9 rounded-full bg-white border border-border flex items-center justify-center hover:border-brand disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}

        {/* ============ ONGLET : PROFIL ============ */}
        {tab === "profile" && (
          <>
            <h1 className="font-heading text-2xl font-bold text-ink mb-4">
              Mon profil
            </h1>

            {/* Bandeau changement d'email en cours */}
            {pendingEmail && (
              <div className="border-2 border-amber-300 bg-amber-50 p-4 rounded-xl mb-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-bold text-amber-900 mb-1 text-sm">
                      Changement d'email en cours
                    </div>
                    <p className="text-xs text-amber-800 mb-3">
                      Un changement de <strong>{pendingEmail.old_email}</strong> vers{" "}
                      <strong>{pendingEmail.new_email}</strong> est en attente.
                      Confirmez depuis les 2 emails reçus.
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3 text-xs">
                      <span className={`px-2 py-1 border rounded ${pendingEmail.old_confirmed ? "bg-green-100 border-green-300 text-green-800" : "bg-white border-amber-300 text-amber-800"}`}>
                        {pendingEmail.old_confirmed ? "✅" : "⏳"} Ancien email
                      </span>
                      <span className={`px-2 py-1 border rounded ${pendingEmail.new_confirmed ? "bg-green-100 border-green-300 text-green-800" : "bg-white border-amber-300 text-amber-800"}`}>
                        {pendingEmail.new_confirmed ? "✅" : "⏳"} Nouvel email
                      </span>
                    </div>
                    <button
                      onClick={cancelPendingEmail}
                      className="text-xs text-red-600 hover:underline font-semibold"
                    >
                      Annuler le changement
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Avatar + infos */}
            <div className="bg-white rounded-2xl border border-border p-6 mb-4">
              <div className="flex flex-col items-center mb-6">
                <div className="w-20 h-20 rounded-full bg-brand/10 flex items-center justify-center mb-3">
                  <User className="w-10 h-10 text-brand" />
                </div>
                <div className="font-heading text-lg font-bold text-ink">
                  {user?.first_name} {user?.last_name}
                </div>
                <div className="text-xs text-ink-muted mt-0.5">
                  {user?.email}
                </div>
                <span className="mt-3 text-[10px] uppercase tracking-wider px-3 py-1 bg-brand/10 text-brand rounded-full font-semibold">
                  🚚 Livreur CAKESSHOP
                </span>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Prénom</Label>
                    <Input
                      value={profileForm.first_name}
                      onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })}
                      className="mt-1 h-10"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Nom</Label>
                    <Input
                      value={profileForm.last_name}
                      onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })}
                      className="mt-1 h-10"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Téléphone</Label>
                  <Input
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    placeholder="+223 XX XX XX XX"
                    className="mt-1 h-10"
                  />
                </div>

                <Button
                  onClick={saveProfile}
                  disabled={profileSaving}
                  className="w-full bg-brand hover:bg-brand-dark text-white rounded-none h-11 uppercase font-bold tracking-wide"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {profileSaving ? "Enregistrement…" : "Enregistrer"}
                </Button>
              </div>
            </div>

            {/* ⭐ Sécurité */}
            <div className="bg-white rounded-2xl border border-border p-5 mb-4">
              <h2 className="font-heading font-bold text-ink mb-4 text-sm uppercase tracking-wider">
                🔒 Sécurité
              </h2>

              {/* Mot de passe */}
              <div className="flex items-center justify-between gap-3 py-3 border-b border-border">
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4 text-brand" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-ink">Mot de passe</div>
                    <div className="text-xs text-ink-muted mt-0.5">
                      Modifiez votre mot de passe régulièrement
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowChangePwd(true)}
                  className="shrink-0 text-xs uppercase font-bold px-3 py-2 border border-border hover:bg-secondary transition-colors"
                >
                  Modifier
                </button>
              </div>

              {/* Email */}
              <div className="flex items-center justify-between gap-3 py-3 border-b border-border">
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-brand" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-ink">Adresse email</div>
                    <div className="text-xs text-ink-muted mt-0.5 truncate">
                      {user?.email}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowChangeEmail(true)}
                  className="shrink-0 text-xs uppercase font-bold px-3 py-2 border border-border hover:bg-secondary transition-colors"
                >
                  Modifier
                </button>
              </div>

              {/* Mot de passe oublié */}
              <div className="pt-3">
                <Link
                  to="/forgot-password"
                  className="text-xs text-brand hover:underline font-semibold inline-flex items-center gap-1"
                >
                  Mot de passe oublié ?
                </Link>
              </div>
            </div>

            {/* Stats globales */}
            {stats && (
              <div className="bg-white rounded-2xl border border-border p-5 mb-4">
                <h2 className="font-heading font-bold text-ink mb-4 text-sm uppercase tracking-wider">
                  📊 Ma performance
                </h2>
                <div className="space-y-3">
                  {[
                    { label: "Aujourd'hui", value: stats.today, color: "text-brand" },
                    { label: "Cette semaine", value: stats.week, color: "text-ink" },
                    { label: "Ce mois", value: stats.month, color: "text-ink" },
                    { label: "Total", value: stats.total, color: "text-green-700" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <span className="text-sm text-ink-soft">{s.label}</span>
                      <span className={`font-bold text-lg ${s.color}`}>
                        {s.value}
                        <span className="text-xs text-ink-muted ml-1 font-normal">
                          livraison{s.value > 1 ? "s" : ""}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Déconnexion */}
            <Button
              onClick={onLogout}
              variant="outline"
              className="w-full rounded-none border-red-300 text-red-600 hover:bg-red-50 h-11 uppercase font-bold tracking-wide"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Se déconnecter
            </Button>
          </>
        )}
      </main>

      {/* ⭐ Modale : Changer mot de passe */}
      {showChangePwd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowChangePwd(false)}>
          <div className="bg-white max-w-md w-full p-6 border border-border rounded-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-1">Changer le mot de passe</h3>
            <p className="text-xs text-ink-muted mb-4">
              Saisissez votre mot de passe actuel puis votre nouveau mot de passe.
            </p>

            <Label className="text-xs uppercase tracking-wider text-ink-muted">Mot de passe actuel</Label>
            <Input type="password" value={pwdForm.current} onChange={(e) => setPwdForm({ ...pwdForm, current: e.target.value })} className="mt-1 rounded-none" />

            <Label className="text-xs uppercase tracking-wider text-ink-muted mt-3">Nouveau mot de passe</Label>
            <Input type="password" value={pwdForm.newPwd} onChange={(e) => setPwdForm({ ...pwdForm, newPwd: e.target.value })} className="mt-1 rounded-none" />
            <PasswordStrength password={pwdForm.newPwd} lang="fr" />

            <Label className="text-xs uppercase tracking-wider text-ink-muted mt-3">Confirmer</Label>
            <Input type="password" value={pwdForm.confirm} onChange={(e) => setPwdForm({ ...pwdForm, confirm: e.target.value })} className="mt-1 rounded-none" />

            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setShowChangePwd(false)} className="px-4 py-2 border border-border text-xs font-bold uppercase hover:bg-secondary">
                Annuler
              </button>
              <button onClick={submitChangePwd} disabled={settingsBusy} className="px-4 py-2 bg-brand hover:bg-brand-dark text-white text-xs font-bold uppercase disabled:opacity-50">
                {settingsBusy ? "..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⭐ Modale : Changer email */}
      {showChangeEmail && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowChangeEmail(false)}>
          <div className="bg-white max-w-md w-full p-6 border border-border rounded-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-1">Changer d'email</h3>
            <p className="text-xs text-ink-muted mb-4">
              Email actuel : <strong>{user.email}</strong>
            </p>

            <div className="bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900 rounded mb-4">
              ℹ️ Vous devrez confirmer ce changement depuis <strong>votre ancien ET votre nouvel email</strong>.
              Deux emails de confirmation vont être envoyés.
            </div>

            <Label className="text-xs uppercase tracking-wider text-ink-muted">Mot de passe</Label>
            <Input type="password" value={emailForm.password} onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })} className="mt-1 rounded-none" />

            <Label className="text-xs uppercase tracking-wider text-ink-muted mt-3">Nouvel email</Label>
            <Input type="email" value={emailForm.newEmail} onChange={(e) => setEmailForm({ ...emailForm, newEmail: e.target.value })} className="mt-1 rounded-none" />

            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setShowChangeEmail(false)} className="px-4 py-2 border border-border text-xs font-bold uppercase hover:bg-secondary">
                Annuler
              </button>
              <button onClick={submitChangeEmail} disabled={settingsBusy} className="px-4 py-2 bg-brand hover:bg-brand-dark text-white text-xs font-bold uppercase disabled:opacity-50">
                {settingsBusy ? "..." : "Envoyer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}