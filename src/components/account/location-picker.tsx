"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, MapPin, Search } from "lucide-react";
import {
  locationFromSuggestion,
  type AddressSuggestion,
} from "@/lib/address-search";
import type { Listing } from "@/lib/types";
import "@/styles/location-picker.css";

export default function LocationPicker({
  value,
  onChange,
}: {
  value: Listing;
  onChange: (patch: Partial<Listing>) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState(
    value.address ||
      [value.city, value.commercialDetails?.postalCode]
        .filter(Boolean)
        .join(" "),
  );
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [active, setActive] = useState(-1);
  const [exact, setExact] = useState(
    value.locationPrecision === "exact_opt_in",
  );
  const [chosen, setChosen] = useState<AddressSuggestion | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open || query.trim().length < 3) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((body) => {
          if (!controller.signal.aborted) {
            setResults(body.data || []);
            setUnavailable(body.addressSearchAvailable === false);
            setActive(-1);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setUnavailable(true);
            setResults([]);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);
  function select(item: AddressSuggestion) {
    setChosen(item);
    setQuery(item.label);
    setOpen(false);
    setResults([]);
    if (item.kind === "municipality") setExact(false);
    onChange(locationFromSuggestion(item, exact, value));
  }
  function precision(next: boolean) {
    setExact(next);
    if (chosen && (!next || chosen.kind === "address"))
      onChange(locationFromSuggestion(chosen, next, value));
    else if (!next) {
      const current: AddressSuggestion = {
        id: "current",
        label: value.address || value.city,
        city: value.city,
        postalCode: value.commercialDetails?.postalCode || "",
        district: value.district,
        coordinates: value.coordinates,
        kind: value.address ? "address" : "municipality",
        source: "Référentiel communal",
      };
      onChange(locationFromSuggestion(current, false, value));
    } else if (value.address) onChange({ locationPrecision: "exact_opt_in" });
    else {
      setQuery("");
      setOpen(true);
      searchRef.current?.focus();
    }
  }
  return (
    <div className="gp-location-picker">
      <label className="field" htmlFor={`${id}-search`}>
        Où se trouve le parking ?
      </label>
      <div
        className="gp-address-search"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setOpen(false);
        }}
      >
        <Search size={19} aria-hidden="true" />
        <input
          ref={searchRef}
          id={`${id}-search`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && results.length > 0}
          aria-controls={`${id}-results`}
          aria-activedescendant={
            active >= 0 ? `${id}-result-${active}` : undefined
          }
          value={query}
          autoComplete="off"
          placeholder={
            exact
              ? "Rechercher une adresse en Île-de-France"
              : "Adresse, ville ou code postal"
          }
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((v) => Math.min(results.length - 1, v + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((v) => Math.max(0, v - 1));
            } else if (e.key === "Enter" && open) {
              e.preventDefault();
              if (results[active >= 0 ? active : 0])
                select(results[active >= 0 ? active : 0]);
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
        {open && query.trim().length >= 3 ? (
          <div className="gp-address-results">
            {loading ? (
              <p role="status">Recherche…</p>
            ) : results.length ? (
              <ul
                role="listbox"
                id={`${id}-results`}
                aria-label="Adresses et secteurs proposés"
              >
                {results.map((item, index) => (
                  <li
                    key={item.id}
                    role="option"
                    id={`${id}-result-${index}`}
                    aria-selected={index === active}
                  >
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => select(item)}
                    >
                      <MapPin size={17} />
                      <span>
                        {item.label}
                        <small>
                          {item.kind === "municipality"
                            ? "Localisation approximative"
                            : item.source}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status">
                {unavailable
                  ? "La recherche d’adresse est indisponible. Essayez le nom de la ville ou son code postal."
                  : "Aucun résultat en Île-de-France. Essayez une ville ou une adresse plus complète."}
              </p>
            )}
          </div>
        ) : null}
      </div>
      <p className="muted gp-location-help">
        Choisissez un résultat : la ville et le code postal se remplissent
        automatiquement.
      </p>
      <div
        className="gp-location-precision"
        role="group"
        aria-label="Localisation visible dans l’annonce"
      >
        <button
          type="button"
          aria-pressed={!exact}
          onClick={() => precision(false)}
        >
          <span>
            Le secteur seulement<small>L’adresse exacte reste masquée.</small>
          </span>
          {!exact ? <Check size={18} /> : null}
        </button>
        <button
          type="button"
          aria-pressed={exact}
          onClick={() => precision(true)}
        >
          <span>
            L’adresse précise
            <small>Je souhaite l’afficher dans l’annonce.</small>
          </span>
          {exact ? <Check size={18} /> : null}
        </button>
      </div>
      {value.city && value.commercialDetails?.postalCode ? (
        <p className="gp-location-summary">
          <MapPin size={17} />
          <span>
            {value.locationPrecision === "exact_opt_in" && value.address
              ? value.address
              : `${value.city} · ${value.commercialDetails.postalCode} · position approximative`}
          </span>
        </p>
      ) : null}
      {exact && !value.address ? (
        <p className="muted">
          Sélectionnez une adresse précise dans la recherche.
        </p>
      ) : null}
      <p className="gp-location-credit">
        Recherche d’adresses : IGN / Base Adresse Nationale. Vous pouvez choisir
        uniquement une ville, sans renseigner d’adresse.
      </p>
    </div>
  );
}
