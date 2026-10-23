import { listingIssues } from "./listing-issues";
import type { Listing } from "./types";

export interface WizardIssue {
  step: number;
  field: string;
  message: string;
  confirmationOnly?: boolean;
}

/** Map publication guidance to the three visible steps and their real controls. */
export function wizardIssues(
  value: Listing,
  locationSelectionPending = false,
): WizardIssue[] {
  const issues: WizardIssue[] = [];
  if (
    locationSelectionPending ||
    !value.city.trim() ||
    !value.district.trim() ||
    !value.commercialDetails?.postalCode.trim()
  ) {
    issues.push({
      step: 0,
      field: "listing-location",
      message:
        "Recherchez puis choisissez une adresse ou une commune en Île-de-France.",
    });
  } else if (!value.locationConfirmedAt) {
    issues.push({
      step: 0,
      field: "listing-location",
      message:
        "Confirmez la localisation avec le bouton Continuer de la première étape.",
      confirmationOnly: true,
    });
  }

  for (const issue of listingIssues(value)) {
    if (issue.step === 1) continue;
    issues.push({
      ...issue,
      step: issue.step === 4 || issue.step === 6 ? 1 : issue.step === 7 ? 2 : 0,
    });
  }

  const numbers = new Set<string>();
  for (const space of value.spaces) {
    const number = space.number.trim().normalize("NFKC").toLowerCase();
    if (!number) continue;
    const key = `${space.level}:${number}`;
    if (numbers.has(key)) {
      issues.push({
        step: 0,
        field: "listing-units",
        message: `Le numéro « ${space.number.trim()} » est répété au même niveau. Corrigez le numéro ou précisez des niveaux différents.`,
      });
      break;
    }
    numbers.add(key);
  }
  return issues;
}

/** Continue confirms a chosen location; only final submission needs that stamp. */
export function wizardStepIssues(
  value: Listing,
  step: number,
  locationSelectionPending = false,
): WizardIssue[] {
  const issues = wizardIssues(value, locationSelectionPending);
  return step === 2
    ? issues
    : issues.filter((issue) => issue.step === step && !issue.confirmationOnly);
}
