import { useCallback, useRef, useState } from 'react';
import type { Offer } from '../types';
import type { CreateOfferInput } from '../repositories/apiRepository';
import {
  createOfferAttemptTracker,
  newOfferIdempotencyKey,
  submitOfferForm,
  type OfferFormField,
  type OfferFormValues,
} from './offerCreationForm';

export interface OfferPublisherState {
  form: OfferFormValues;
  fieldErrors: Partial<Record<OfferFormField, string>>;
  formError: string | null;
  submitting: boolean;
  confirmation: string | null;
  patch: (values: Partial<OfferFormValues>) => void;
  /** Renvoie `true` seulement si le serveur a confirmé la création. */
  publish: () => Promise<boolean>;
  dismissConfirmation: () => void;
}

/**
 * État de publication d'une offre : aucune confirmation avant réponse serveur,
 * erreurs visibles, une seule requête en vol, reprise sans doublon.
 */
export function useOfferPublisher(
  createOffer: (payload: CreateOfferInput, idempotencyKey?: string) => Promise<Offer>,
  initialValues: OfferFormValues,
): OfferPublisherState {
  const [form, setForm] = useState<OfferFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<OfferFormField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const inFlight = useRef(false);
  const attempt = useRef(createOfferAttemptTracker(newOfferIdempotencyKey));

  const patch = useCallback((values: Partial<OfferFormValues>) => {
    setForm(prev => ({ ...prev, ...values }));
  }, []);

  const publish = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const outcome = await submitOfferForm(form, attempt.current, createOffer);
      if (outcome.kind === 'invalid') {
        setFieldErrors(outcome.errors);
        setFormError('Corrigez les champs signalés avant de publier.');
        return false;
      }
      if (outcome.kind === 'failed') {
        setFormError(outcome.message);
        return false;
      }
      setConfirmation(`Offre « ${outcome.offer.title} » enregistrée par le serveur (référence ${outcome.offer.id}, statut ${outcome.offer.status}).`);
      setForm(initialValues);
      return true;
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, [form, createOffer]);

  const dismissConfirmation = useCallback(() => setConfirmation(null), []);

  return { form, fieldErrors, formError, submitting, confirmation, patch, publish, dismissConfirmation };
}
