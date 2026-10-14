import React from 'react';
import type { OfferFormField, OfferFormValues } from './offerCreationForm';

interface OfferFormFieldsProps {
  values: OfferFormValues;
  errors: Partial<Record<OfferFormField, string>>;
  onChange: (patch: Partial<OfferFormValues>) => void;
  disabled?: boolean;
}

const INPUT = 'w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded text-xs text-[#17233B]';
const LABEL = 'block font-medium text-[#17233B] mb-1';
const ERROR = 'text-[11px] text-red-700 mt-1';

/** Champs réels de `POST /offers` ; chaque erreur de validation est affichée sous son champ. */
export const OfferFormFields: React.FC<OfferFormFieldsProps> = ({ values, errors, onChange, disabled }) => (
  <div className="space-y-3 font-operational text-xs">
    <div>
      <label className={LABEL} htmlFor="offer-title">Intitulé du poste / Métier *</label>
      <input id="offer-title" type="text" placeholder="Ex. Menuisier d'Art & Agencement" disabled={disabled}
        value={values.title} onChange={e => onChange({ title: e.target.value })} className={INPUT} aria-invalid={!!errors.title} />
      {errors.title && <p role="alert" className={ERROR}>{errors.title}</p>}
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className={LABEL} htmlFor="offer-remuneration">Salaire (FCFA/mois) *</label>
        <input id="offer-remuneration" type="number" min={0} disabled={disabled}
          value={values.remuneration} onChange={e => onChange({ remuneration: e.target.value })}
          className={`${INPUT} font-mono`} aria-invalid={!!errors.remuneration} />
        {errors.remuneration && <p role="alert" className={ERROR}>{errors.remuneration}</p>}
      </div>
      <div>
        <label className={LABEL} htmlFor="offer-contract">Type de contrat *</label>
        <input id="offer-contract" type="text" disabled={disabled}
          value={values.contractType} onChange={e => onChange({ contractType: e.target.value })} className={INPUT} aria-invalid={!!errors.contractType} />
        {errors.contractType && <p role="alert" className={ERROR}>{errors.contractType}</p>}
      </div>
    </div>
    <div>
      <label className={LABEL} htmlFor="offer-location">Lieu du chantier au Bénin *</label>
      <input id="offer-location" type="text" disabled={disabled}
        value={values.location} onChange={e => onChange({ location: e.target.value })} className={INPUT} aria-invalid={!!errors.location} />
      {errors.location && <p role="alert" className={ERROR}>{errors.location}</p>}
    </div>
    <div>
      <label className={LABEL} htmlFor="offer-skills">Compétences attendues (séparées par virgules)</label>
      <input id="offer-skills" type="text" disabled={disabled}
        value={values.skills} onChange={e => onChange({ skills: e.target.value })} className={INPUT} />
    </div>
    <div>
      <label className={LABEL} htmlFor="offer-summary">Description du travail</label>
      <textarea id="offer-summary" rows={2} disabled={disabled} placeholder="Précisez ce qui est attendu..."
        value={values.summary} onChange={e => onChange({ summary: e.target.value })} className="w-full p-2 bg-white border border-[#17233B]/20 rounded text-xs" />
    </div>
  </div>
);
