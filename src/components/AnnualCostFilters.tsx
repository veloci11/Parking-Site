export default function AnnualCostFilters({
  annualChargesMax,
  setAnnualChargesMax,
  propertyTaxMax,
  setPropertyTaxMax,
}: {
  annualChargesMax: string;
  setAnnualChargesMax: (value: string) => void;
  propertyTaxMax: string;
  setPropertyTaxMax: (value: string) => void;
}) {
  return (
    <fieldset className="explorer-filter-group">
      <legend>Frais annuels</legend>
      <label className="field">
        Charges maximum · €/an
        <input
          className="input"
          type="number"
          inputMode="decimal"
          min="0"
          max="1000000"
          step="0.01"
          placeholder="Sans limite"
          value={annualChargesMax}
          onChange={(event) => setAnnualChargesMax(event.target.value)}
        />
      </label>
      <label className="field">
        Taxe foncière maximum · €/an
        <input
          className="input"
          type="number"
          inputMode="decimal"
          min="0"
          max="1000000"
          step="0.01"
          placeholder="Sans limite"
          value={propertyTaxMax}
          onChange={(event) => setPropertyTaxMax(event.target.value)}
        />
      </label>
      <p className="explorer-filter-hint">
        Les montants non renseignés sont exclus lorsqu’une limite est choisie.
      </p>
    </fieldset>
  );
}
