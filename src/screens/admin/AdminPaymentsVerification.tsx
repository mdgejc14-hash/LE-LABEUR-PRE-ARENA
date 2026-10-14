/**
 * PHASES 4C/4D — ADMIN « Paiements à vérifier ».
 *
 * Liste les déclarations de paiement externes soumises par les employeurs
 * (statut SUBMITTED) et permet d'en ouvrir le détail : employeur, contrat,
 * montant, moyen de paiement, transaction, référence, dates, justificatif,
 * commentaire et historique.
 *
 * Le détail porte la décision administrative (PHASE 4D) : « Approuver » ou
 * « Rejeter » avec un motif obligatoire, uniquement quand les callbacks sont
 * fournis par l'écran. Sans callback — ni sur la liste, qui reste une
 * consultation — le dossier demeure en lecture seule. Les composants sont
 * pilotés par leurs props (aucune donnée n'est lue ni modifiée par l'UI).
 */

import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  Eye,
  FileCheck2,
  FileText,
  Gavel,
  Hash,
  History,
  Landmark,
  MessageSquare,
  Receipt,
  ScrollText,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type {
  Contract,
  PaymentDeclaration,
  PaymentDeclarationStatus,
  SystemAuditLog,
  UserProfile,
} from '../../types';
import { EditorialButton } from '../../components/common/EditorialButton';
import {
  buildAdminPaymentDeclarationHistory,
  buildAdminPaymentDeclarationView,
  normalizeRejectionReason,
  resolveDeclarationContract,
  resolveDeclarationEmployer,
  resolveDeclarationReviewer,
  type AdminPaymentDeclarationView,
} from '../../domain/adminPaymentReview';

/** Réutilise la palette employeur pour que le même statut se lise partout pareil. */
const STATUS_STYLES: Record<PaymentDeclarationStatus, string> = {
  DRAFT: 'text-[#17233B]/70 bg-[#17233B]/5 border-[#17233B]/12',
  SUBMITTED: 'text-[#340C24] bg-[#340C24]/8 border-[#340C24]/20',
  UNDER_REVIEW: 'text-[#17233B] bg-[#FFA800]/12 border-[#FFA800]/30',
  APPROVED: 'text-[#17233B] bg-[#1BA64B]/10 border-[#1BA64B]/25',
  REJECTED: 'text-[#E23D3D] bg-[#E23D3D]/8 border-[#E23D3D]/20',
  RESUBMITTED: 'text-[#340C24] bg-[#340C24]/8 border-[#340C24]/20',
};

const StatusBadge: React.FC<{ status: PaymentDeclarationStatus; label: string }> = ({ status, label }) => (
  <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-[4px] border shrink-0 ${STATUS_STYLES[status]}`}>
    {label}
  </span>
);

const Field: React.FC<{
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  icon?: React.ReactNode;
}> = ({ label, value, mono = false, icon }) => (
  <div className="min-w-0">
    <span className="text-[10px] font-mono uppercase text-[#17233B]/50 block font-medium">{label}</span>
    <span className={`${mono ? 'font-mono text-[11px]' : 'text-xs font-medium'} text-[#17233B] mt-0.5 flex items-start gap-1.5 break-all`}>
      {icon}
      <span className="min-w-0">{value}</span>
    </span>
  </div>
);

const Panel: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <section className="rounded-[4px] bg-white border border-[#17233B]/10 p-4 space-y-3">
    <div className="flex items-center gap-2">
      {icon}
      <h3 className="font-editorial text-base font-bold text-[#17233B]">{title}</h3>
    </div>
    {children}
  </section>
);

export interface AdminPaymentsVerificationProps {
  declarations: PaymentDeclaration[];
  contracts: Contract[];
  employers: UserProfile[];
  loading?: boolean;
  error?: string;
  onOpenDeclaration: (paymentId: string) => void;
  openingId?: string;
}

export const AdminPaymentsVerification: React.FC<AdminPaymentsVerificationProps> = ({
  declarations,
  contracts,
  employers,
  loading = false,
  error = '',
  onOpenDeclaration,
  openingId = '',
}) => {
  const views = useMemo(
    () => declarations.map(declaration => buildAdminPaymentDeclarationView(
      declaration,
      resolveDeclarationContract(declaration, contracts),
      resolveDeclarationEmployer(declaration, employers),
    )),
    [declarations, contracts, employers],
  );

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-[#17233B]/55" />
          <h2 className="text-sm font-semibold text-[#17233B]">Paiements à vérifier</h2>
        </div>
        <span className="text-xs text-[#17233B]/50">{views.length}</span>
      </div>
      <p className="text-[11px] text-[#17233B]/55">
        Déclarations de paiement externes soumises par les employeurs — consultation en lecture seule.
      </p>

      {error && (
        <div className="rounded-2xl bg-red-50 text-red-700 px-4 py-3 text-xs">{error}</div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-white border border-[#17233B]/10 p-4 text-sm text-[#17233B]/55">Chargement des paiements soumis…</div>
      ) : views.length === 0 ? (
        <div className="rounded-2xl bg-white border border-[#17233B]/10 p-4 text-sm text-[#17233B]/55">Aucune déclaration de paiement soumise pour le moment.</div>
      ) : (
        views.map(view => (
          <article key={view.paymentId} className="rounded-2xl bg-white border border-[#17233B]/10 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-[#17233B] truncate">{view.employerName}</p>
                <p className="text-[11px] font-mono text-[#17233B]/50 mt-0.5">
                  {view.employerPublicId} · {view.paymentId}
                </p>
                {view.employerAccountName && view.employerAccountName !== view.employerName && (
                  <p className="text-[11px] text-[#17233B]/55 mt-0.5">Compte employeur : {view.employerAccountName}</p>
                )}
              </div>
              <StatusBadge status={view.status} label={view.statusLabel} />
            </div>

            <div className="rounded-[4px] bg-[#F3F3EC] p-3 grid grid-cols-2 gap-2.5">
              <Field label="Contrat" value={view.contractId} mono icon={<FileCheck2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#17233B]/45" />} />
              <Field label="Mission" value={view.contractOfferTitle} />
              <Field label="Montant" value={view.amountLabel} mono icon={<Landmark className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#17233B]/45" />} />
              <Field label="Moyen de paiement" value={view.paymentMethodLabel} />
              <Field label="Transaction" value={view.transactionId} mono icon={<Hash className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#17233B]/45" />} />
              <Field label="Référence" value={view.reference} mono icon={<ScrollText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#17233B]/45" />} />
              <Field label="Payé le" value={view.paidAtLabel} icon={<CalendarClock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#17233B]/45" />} />
              <Field label="Soumis le" value={view.submittedAtLabel} icon={<CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#17233B]/45" />} />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1 border-t border-[#17233B]/10">
              <span className="text-[10px] font-mono text-[#17233B]/50 truncate">{view.proofLabel}</span>
              <EditorialButton
                variant="outline"
                size="sm"
                disabled={openingId === view.paymentId}
                onClick={() => onOpenDeclaration(view.paymentId)}
              >
                {openingId === view.paymentId ? 'Ouverture…' : 'Ouvrir le détail'}
              </EditorialButton>
            </div>
          </article>
        ))
      )}
    </section>
  );
};

export interface AdminPaymentRejectionFormProps {
  value: string;
  /** Erreur remontée par le Repository lors d'une tentative précédente. */
  error?: string;
  busy?: boolean;
  onChange: (value: string) => void;
  onConfirm: (rejectionReason: string) => void;
  onCancel: () => void;
}

/**
 * PHASE 4D — formulaire de motif de rejet. Le motif est obligatoire : la même
 * règle pure que le Repository (`normalizeRejectionReason`) bloque une
 * confirmation vide, côté UI comme côté données.
 */
export const AdminPaymentRejectionForm: React.FC<AdminPaymentRejectionFormProps> = ({
  value,
  error = '',
  busy = false,
  onChange,
  onConfirm,
  onCancel,
}) => {
  const [reasonError, setReasonError] = useState('');

  const confirm = () => {
    let reason = '';
    try {
      reason = normalizeRejectionReason(value);
    } catch (validationError) {
      setReasonError(validationError instanceof Error ? validationError.message : 'Le motif du rejet est obligatoire.');
      return;
    }
    setReasonError('');
    onConfirm(reason);
  };

  return (
    <div className="space-y-2">
      <div className="min-w-0">
        <span className="text-[10px] font-mono uppercase text-[#17233B]/50 block font-medium">Motif du rejet (obligatoire)</span>
        <textarea
          value={value}
          onChange={event => { onChange(event.target.value); setReasonError(''); }}
          rows={3}
          placeholder="Ex. montant déclaré non concordant avec l’échéance du contrat"
          className="mt-1 w-full px-3 py-2 bg-white border border-[#E23D3D]/30 rounded-[4px] text-xs text-[#17233B] placeholder-[#17233B]/35 focus:outline-none focus:border-[#E23D3D]"
        />
      </div>
      {(reasonError || error) && (
        <p className="text-[11px] text-[#E23D3D]">{reasonError || error}</p>
      )}
      <div className="flex items-center gap-2">
        <EditorialButton variant="danger" size="sm" disabled={busy} onClick={confirm}>
          {busy ? 'Enregistrement…' : 'Confirmer le rejet'}
        </EditorialButton>
        <EditorialButton variant="outline" size="sm" disabled={busy} onClick={onCancel}>
          Annuler
        </EditorialButton>
      </div>
    </div>
  );
};

export interface AdminPaymentDeclarationDetailProps {
  declaration: PaymentDeclaration;
  contracts: Contract[];
  employers: UserProfile[];
  auditLogs: SystemAuditLog[];
  onBack: () => void;
  /** PHASE 4D — callbacks de décision ; absents, le dossier reste en lecture seule. */
  onApprove?: (paymentId: string) => void;
  onReject?: (paymentId: string, rejectionReason: string) => void;
  /** Identifiant du dossier en cours de décision : désactive les actions. */
  decidingId?: string;
  /** Erreur renvoyée par la dernière tentative de décision. */
  decisionError?: string;
}

export const AdminPaymentDeclarationDetail: React.FC<AdminPaymentDeclarationDetailProps> = ({
  declaration,
  contracts,
  employers,
  auditLogs,
  onBack,
  onApprove,
  onReject,
  decidingId = '',
  decisionError = '',
}) => {
  const view: AdminPaymentDeclarationView = useMemo(
    () => buildAdminPaymentDeclarationView(
      declaration,
      resolveDeclarationContract(declaration, contracts),
      resolveDeclarationEmployer(declaration, employers),
    ),
    [declaration, contracts, employers],
  );
  const history = useMemo(
    () => buildAdminPaymentDeclarationHistory(declaration, auditLogs),
    [declaration, auditLogs],
  );
  const reviewerName = useMemo(
    () => resolveDeclarationReviewer(view.reviewedBy, employers),
    [view.reviewedBy, employers],
  );

  // Décision possible seulement sur un dossier encore soumis, et seulement si
  // l'écran fournit les opérations du Repository.
  const decidable = Boolean(onApprove) && Boolean(onReject) && view.status === 'SUBMITTED';
  const isApproved = view.status === 'APPROVED';
  const isRejected = view.status === 'REJECTED';
  const decided = isApproved || isRejected;
  const busy = Boolean(decidingId) && decidingId === view.paymentId;

  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const startRejection = () => {
    setRejecting(true);
    setRejectionReason('');
  };

  const cancelRejection = () => {
    setRejecting(false);
    setRejectionReason('');
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-operational font-medium text-[#17233B]/60 hover:text-[#17233B] tap-feedback cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Retour aux paiements à vérifier</span>
      </button>

      <div className="rounded-[4px] bg-white border border-[#17233B]/10 p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="editorial-kicker">Dossier de paiement · {view.contractId}</span>
            <h2 className="font-editorial text-2xl font-bold text-[#17233B] mt-1 leading-snug">
              {view.amountLabel}
            </h2>
            <p className="text-[11px] font-mono text-[#17233B]/50 mt-1">{view.paymentId}</p>
          </div>
          <StatusBadge status={view.status} label={view.statusLabel} />
        </div>
        <p className="text-[11px] text-[#17233B]/60 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#17233B]/45 shrink-0" />
          <span>
            {decided
              ? `${view.decisionLabel} le ${view.reviewedAtLabel}.`
              : decidable
                ? 'Décision administrative attendue : approuver ou rejeter la déclaration soumise par l’employeur.'
                : 'Consultation administrative en lecture seule : aucune décision n’est possible à cette étape.'}
          </span>
        </p>
      </div>

      {/* PHASE 4D — décision administrative sur la déclaration soumise */}
      <Panel title="Décision administrative" icon={<Gavel className="w-4 h-4 text-[#17233B]/55" />}>
        {decided ? (
          <div className="space-y-2">
            <div className={`rounded-[4px] border px-3 py-2.5 flex items-start gap-2 ${
              isApproved
                ? 'border-[#1BA64B]/25 bg-[#1BA64B]/8'
                : 'border-[#E23D3D]/20 bg-[#E23D3D]/6'
            }`}>
              {isApproved
                ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#1BA64B]" />
                : <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#E23D3D]" />}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#17233B]">
                  {`Nouveau statut : ${view.statusLabel}`}
                </p>
                <p className="text-[11px] text-[#17233B]/65 mt-0.5">
                  {`Décision enregistrée par ${reviewerName} le ${view.reviewedAtLabel}.`}
                </p>
                {isRejected && (
                  <p className="text-[11px] text-[#17233B]/80 mt-1">
                    {`Motif du rejet : ${view.rejectionReason || 'Non renseigné'}`}
                  </p>
                )}
              </div>
            </div>
            <p className="text-[10px] font-mono text-[#17233B]/45">
              Dossier clos : aucune nouvelle décision n’est possible sur cette déclaration.
            </p>
          </div>
        ) : decidable ? (
          rejecting ? (
            <AdminPaymentRejectionForm
              value={rejectionReason}
              error={decisionError}
              busy={busy}
              onChange={setRejectionReason}
              onConfirm={reason => { setRejectionReason(''); onReject?.(view.paymentId, reason); }}
              onCancel={cancelRejection}
            />
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-[#17233B]/60">
                Le rejet exige un motif : il est conservé avec l’auteur et l’horodatage de la décision dans l’historique du dossier.
              </p>
              <div className="flex items-center gap-2">
                <EditorialButton variant="primary" size="sm" disabled={busy} onClick={() => onApprove?.(view.paymentId)}>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  {busy ? 'Enregistrement…' : 'Approuver'}
                </EditorialButton>
                <EditorialButton variant="danger" size="sm" disabled={busy} onClick={startRejection}>
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />
                  Rejeter
                </EditorialButton>
              </div>
              {decisionError && <p className="text-[11px] text-[#E23D3D]">{decisionError}</p>}
            </div>
          )
        ) : (
          <p className="text-xs text-[#17233B]/60">
            Aucune décision administrative enregistrée sur ce dossier.
          </p>
        )}
      </Panel>

      <Panel title="Employeur" icon={<Building2 className="w-4 h-4 text-[#17233B]/55" />}>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Raison sociale" value={view.employerName} />
          <Field label="Compte employeur" value={view.employerAccountName || '—'} />
          <Field label="Identifiant public" value={view.employerPublicId} mono />
          {view.employerEmail && <Field label="Email" value={view.employerEmail} />}
          <Field label="Référence interne" value={view.employerId} mono />
        </div>
      </Panel>

      <Panel title="Contrat & mission" icon={<FileText className="w-4 h-4 text-[#17233B]/55" />}>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Contrat" value={view.contractId} mono />
          <Field label="Statut du contrat" value={view.contractStatus || '—'} />
          <Field label="Mission" value={view.contractOfferTitle} />
          <Field label="Salarié" value={view.contractEmployeeName} />
          <Field label="Salaire mensuel" value={view.contractMonthlySalaryLabel} />
          <Field label="Début de mission" value={view.contractStartDate || '—'} />
        </div>
      </Panel>

      <Panel title="Règlement déclaré" icon={<Receipt className="w-4 h-4 text-[#17233B]/55" />}>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Montant déclaré" value={view.amountLabel} mono />
          <Field label="Moyen de paiement" value={view.paymentMethodLabel} />
          <Field label="ID de transaction" value={view.transactionId} mono />
          <Field label="Référence" value={view.reference} mono />
          <Field label="Payé le" value={view.paidAtLabel} />
          <Field label="Soumis le" value={view.submittedAtLabel} />
        </div>
      </Panel>

      <Panel title="Justificatif & commentaire" icon={<FileCheck2 className="w-4 h-4 text-[#17233B]/55" />}>
        <div className="space-y-2.5">
          <Field label="Justificatif" value={view.proofLabel} />
          {view.proofDocumentId && <Field label="Document lié" value={view.proofDocumentId} mono />}
          {view.proofReference && <Field label="Référence du justificatif" value={view.proofReference} mono />}
          <div className="min-w-0">
            <span className="text-[10px] font-mono uppercase text-[#17233B]/50 block font-medium">Commentaire de l’employeur</span>
            <p className="text-xs text-[#17233B]/80 mt-0.5 leading-relaxed flex items-start gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#17233B]/45" />
              <span>{view.comment || 'Aucun commentaire transmis.'}</span>
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="Historique" icon={<History className="w-4 h-4 text-[#17233B]/55" />}>
        {history.length === 0 ? (
          <p className="text-xs text-[#17233B]/60">Aucun historique disponible pour cette déclaration.</p>
        ) : (
          <ol className="space-y-2">
            {history.map(entry => (
              <li key={entry.id} className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#17233B]/30 mt-1.5 shrink-0" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[#17233B]">{entry.label}</span>
                    <span className="text-[10px] font-mono text-[#17233B]/50">{entry.atLabel}</span>
                    <span className="text-[9px] font-mono uppercase text-[#17233B]/40 border border-[#17233B]/10 rounded-[3px] px-1 py-0.5">
                      {entry.origin === 'AUDIT' ? 'Journal d’audit' : 'Horodatage déclaration'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#17233B]/65 mt-0.5">{entry.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <div className="text-[10px] font-mono text-[#17233B]/40">
        Créée le {view.createdAtLabel} · Dernière mise à jour le {view.updatedAtLabel}
      </div>
    </div>
  );
};

export default AdminPaymentsVerification;
