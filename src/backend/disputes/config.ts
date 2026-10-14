/** P0-DISPUTE-1 — configuration volontairement sans durée par défaut. */

export interface ClaimEvidenceDeadlineConfiguration {
  /** Milliseconds, or null when the operator has not configured a deadline. */
  deadlineMs: number | null;
  configured: boolean;
  valid: boolean;
  detail: string;
}

export function resolveClaimEvidenceDeadline(value: string | undefined | null): ClaimEvidenceDeadlineConfiguration {
  const raw = value?.trim();
  if (!raw) {
    return {
      deadlineMs: null,
      configured: false,
      valid: true,
      detail: 'Aucune durée de réponse à une demande de preuve n’est configurée.',
    };
  }

  if (!/^\d+$/.test(raw)) {
    return {
      deadlineMs: null,
      configured: false,
      valid: false,
      detail: 'CLAIM_EVIDENCE_DEADLINE_MS doit être un entier positif en millisecondes.',
    };
  }

  const deadlineMs = Number(raw);
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1) {
    return {
      deadlineMs: null,
      configured: false,
      valid: false,
      detail: 'CLAIM_EVIDENCE_DEADLINE_MS doit être un entier positif représentable en millisecondes.',
    };
  }

  return {
    deadlineMs,
    configured: true,
    valid: true,
    detail: `Durée de réponse Claim configurée par l’exploitant (${deadlineMs} ms).`,
  };
}
