"use client";
import FilterSelect from "../FilterSelect";
import { useEffect, useState } from "react";
import Link from "next/link";
import { typeLabels, type ParkingType } from "@/lib/types";
import {
  decodePreparation,
  emptyPreparation,
  preparationKey,
  type Preparation,
} from "./preparatory-draft";
export default function PreparationForm() {
  const [value, setValue] = useState<Preparation>(emptyPreparation),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    try {
      const stored = decodePreparation(sessionStorage.getItem(preparationKey));
      if (stored) {
        setValue(stored);
        setSaved(true);
      }
    } catch {
      setError(
        "Le stockage de cet onglet est indisponible. Vos saisies ne peuvent pas être conservées après navigation.",
      );
    }
    setReady(true);
  }, []);
  function change(patch: Partial<Preparation>) {
    const next = { ...value, ...patch };
    setValue(next);
    setSaved(false);
    try {
      sessionStorage.setItem(preparationKey, JSON.stringify(next));
      setSaved(true);
      setError("");
    } catch {
      setError(
        "Enregistrement local impossible. Ces informations ne sont pas enregistrées sur le serveur.",
      );
    }
  }
  return (
    <main id="main" className="page-shell account-wizard-start">
      <span className="badge">PRÉPARATION LOCALE</span>
      <h1>Préparez votre annonce.</h1>
      <p>
        Vous pouvez commencer avant de confirmer votre email. Cette préparation
        reste dans cet onglet, sur cet appareil : elle n’est ni un compte ni une
        annonce enregistrée sur le serveur. Elle peut disparaître à la fermeture
        de l’onglet.
      </p>
      <p className="notice">
        Après inscription, confirmation de l’email et connexion, revenez ici
        pour transférer ces informations dans un vrai brouillon privé. N’ajoutez
        ni adresse précise ni donnée personnelle.
      </p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <fieldset disabled={!ready}>
        <div className="form-grid">
          <div className="field">
            <span>Type d’offre</span>
            <FilterSelect
              label="Type d’offre"
              variant="field"
              value={value.transactionType || "sale"}
              options={[
                { value: "sale", label: "À vendre" },
                { value: "rent", label: "À louer" },
              ]}
              onChange={(transactionType) =>
                change({ transactionType: transactionType as "sale" | "rent" })
              }
            />
          </div>
          <label className="field">
            Titre provisoire
            <input
              className="input"
              maxLength={90}
              value={value.title}
              onChange={(e) => change({ title: e.target.value })}
            />
          </label>
          <label className="field">
            Ville uniquement
            <input
              className="input"
              maxLength={80}
              value={value.city}
              onChange={(e) => change({ city: e.target.value })}
            />
          </label>
          <div className="field">
            <span>{"Type"}</span>
            <FilterSelect
              label={"Type"}
              variant="field"
              value={value.type}
              onChange={(selectedValue) =>
                change({ type: selectedValue as ParkingType })
              }
              options={[
                ...Object.entries(typeLabels).map(([type, label]) => ({
                  value: type,
                  label: label,
                })),
              ]}
            />
          </div>
          <label className="field">
            Nombre de places proposées ensemble
            <input
              className="input"
              type="number"
              min={1}
              max={500}
              value={value.quantity}
              onChange={(e) =>
                change({
                  quantity: Math.min(
                    500,
                    Math.max(1, Number(e.target.value) || 1),
                  ),
                })
              }
            />
          </label>
        </div>
      </fieldset>
      <p className="muted" role="status">
        {!ready
          ? "Chargement de la préparation…"
          : saved
            ? "Préparation enregistrée dans cet onglet uniquement."
            : "Aucune préparation enregistrée pour le moment."}
      </p>
      <div className="account-review-actions">
        <Link
          className="button button-primary"
          href="/inscription?next=%2Fdeposer"
        >
          Créer mon compte
        </Link>
        <Link
          className="button button-secondary"
          href="/connexion?next=%2Fdeposer"
        >
          J’ai déjà un compte
        </Link>
      </div>
    </main>
  );
}
