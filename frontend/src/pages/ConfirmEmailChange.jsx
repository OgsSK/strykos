import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { api, apiError } from "@/lib/api";
import { CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ConfirmEmailChange() {
  const { lang } = useStore();
  const [params] = useSearchParams();
  const token = params.get("token");
  const type = params.get("type") || "old";
  const [state, setState] = useState("loading"); // loading | completed | partial | error
  const [message, setMessage] = useState("");
  const [waitingOld, setWaitingOld] = useState(false);
  const [waitingNew, setWaitingNew] = useState(false);

  useEffect(() => {
    if (!token) { setState("error"); setMessage(lang === "fr" ? "Lien invalide." : "Invalid link."); return; }
    api.get(`/auth/confirm-email-change/${token}?type=${type}`)
      .then((r) => {
        if (r.data.completed) {
          setState("completed");
        } else if (r.data.already) {
          setState("completed");
        } else {
          setState("partial");
          setWaitingOld(!!r.data.waiting_for_old);
          setWaitingNew(!!r.data.waiting_for_new);
        }
      })
      .catch((e) => {
        setState("error");
        setMessage(apiError(e));
      });
  }, [token, type]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center" data-testid="confirm-email-change">
      {state === "loading" && (
        <div><Loader2 className="w-14 h-14 mx-auto text-brand animate-spin mb-4" />
          <h1 className="font-heading text-2xl font-bold uppercase">{lang === "fr" ? "Verification..." : "Verifying..."}</h1></div>
      )}

      {state === "completed" && (
        <div>
          <CheckCircle2 className="w-16 h-16 mx-auto text-green-600 mb-4" />
          <h1 className="font-heading text-3xl font-bold uppercase mb-3">
            {lang === "fr" ? "Email modifie" : "Email updated"}
          </h1>
          <p className="text-ink-soft mb-6">
            {lang === "fr"
              ? "Votre adresse email a ete mise a jour avec succes. Toutes les futures communications seront envoyees a la nouvelle adresse."
              : "Your email address was successfully updated. All future communications will be sent to the new address."}
          </p>
          <Link to="/account"><Button className="bg-ink hover:bg-ink/90 rounded-none uppercase">{lang === "fr" ? "Mon compte" : "My account"}</Button></Link>
        </div>
      )}

      {state === "partial" && (
        <div>
          <Clock className="w-16 h-16 mx-auto text-amber-500 mb-4" />
          <h1 className="font-heading text-3xl font-bold uppercase mb-3">
            {lang === "fr" ? "Confirmation partielle" : "Partial confirmation"}
          </h1>
          <p className="text-ink-soft mb-4">
            {lang === "fr"
              ? "Un cote est confirme. Il reste a confirmer l'autre email pour que le changement prenne effet."
              : "One side is confirmed. You still need to confirm the other email for the change to take effect."}
          </p>
          <div className="flex flex-wrap gap-2 justify-center mb-6 text-xs">
            <span className={`px-3 py-1.5 border ${!waitingOld ? "bg-green-100 border-green-300 text-green-800" : "bg-white border-amber-300 text-amber-800"}`}>
              {!waitingOld ? "✅" : "⏳"} {lang === "fr" ? "Ancien email" : "Old email"}
            </span>
            <span className={`px-3 py-1.5 border ${!waitingNew ? "bg-green-100 border-green-300 text-green-800" : "bg-white border-amber-300 text-amber-800"}`}>
              {!waitingNew ? "✅" : "⏳"} {lang === "fr" ? "Nouvel email" : "New email"}
            </span>
          </div>
          <p className="text-xs text-ink-muted">
            {lang === "fr"
              ? "Verifiez la boite de reception de l'email manquant (et les spams)."
              : "Check the inbox of the missing email (and spam folder)."}
          </p>
        </div>
      )}

      {state === "error" && (
        <div>
          <XCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
          <h1 className="font-heading text-3xl font-bold uppercase mb-3">
            {lang === "fr" ? "Lien invalide" : "Invalid link"}
          </h1>
          <p className="text-ink-soft mb-6">{message}</p>
          <Link to="/account"><Button className="bg-ink hover:bg-ink/90 rounded-none uppercase">{lang === "fr" ? "Mon compte" : "My account"}</Button></Link>
        </div>
      )}
    </div>
  );
}