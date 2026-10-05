/**
 * PHASE 4A — Espace EMPLOYEUR « Mes Paiements ».
 *
 * L'employeur déclare un règlement effectué HORS plateforme (Mobile Money,
 * virement, espèces…) : contrat concerné, montant, moyen de paiement, ID de
 * transaction, référence, date/heure, justificatif et commentaire.
 *
 * Périmètre de cette étape : création, modification d'un brouillon et liste des
 * déclarations. Le contrôle administratif (validation / rejet) est l'étape
 * suivante et n'est volontairement pas exposé ici.
 */

import React, { useMemo, useState } from 'react';
import {
  Banknote,
  CalendarClock,
  FileCheck2,
  Hash,
  Pencil,
  Plus,
  Receipt,
  ScrollText
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  EXTERNAL_PAYMENT_METHODS,
  EXTERNAL_PAYMENT_METHOD_LABELS,
  PAYMENT_DECLARATION_STATUS_LABELS,
  PaymentDeclaration,
  PaymentDeclarationInput,
  PaymentDeclarationStatus,
  ExternalPaymentMethod
} from '../types';
import { EditorialButton } from '../components/common/EditorialButton';
import { EditorialSheet } from '../components/common/EditorialSheet';

type ListFilter = 'ALL' | 'DRAFT' | 'SUBMITTED' | 'DECIDED';

export interface PaymentFormState {
  contractId: string;
  amount: string;
  paymentMethod: ExternalPaymentMethod;
  transactionId: string;
  reference: string;
  paymentDate: string;
  paymentTime: string;
  proofDocumentId: string;
  proofReference: string;
  comment: string;
}

export const EMPTY_PAYMENT_FORM: PaymentFormState = {
  contractId: '',
  amount: '',
  paymentMethod: 'MOBILE_MONEY',
  transactionId: '',
  reference: '',
  paymentDate: '',
  paymentTime: '',
  proofDocumentId: '',
  proofReference: '',
  comment: ''
};

const STATUS_STYLES: Record<PaymentDeclarationStatus, string> = {
  DRAFT: 'text-[#17233B]/70 bg-[#17233B]/5 border-[#17233B]/12',
  SUBMITTED: 'text-[#340C24] bg-[#340C24]/8 border-[#340C24]/20',
  UNDER_REVIEW: 'text-[#17233B] bg-[#FFA800]/12 border-[#FFA800]/30',
  APPROVED: 'text-[#17233B] bg-[#1BA64B]/10 border-[#1BA64B]/25',
  REJECTED: 'text-[#E23D3D] bg-[#E23D3D]/8 border-[#E23D3D]/20',
  RESUBMITTED: 'text-[#340C24] bg-[#340C24]/8 border-[#340C24]/20'
};

const formatDate = (iso?: string): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatDateTime = (iso?: string): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${formatDate(iso)} à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};

const toLocalDate = (iso?: string): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-CA');
};

const toLocalTime = (iso?: string): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false });
};

/**
 * Conversion du formulaire vers le modèle métier. Fonction pure exportée pour
 * être testée telle qu'elle est exécutée par l'écran (montant texte → nombre,
 * date + heure → ISO, champs vides → champs absents).
 */
export function buildPaymentDeclarationPayload(form: PaymentFormState): PaymentDeclarationInput {
  const paidAt = form.paymentDate && form.paymentTime
    ? new Date(`${form.paymentDate}T${form.paymentTime}:00`).toISOString()
    : '';
  return {
    contractId: form.contractId,
    amount: Number(form.amount),
    paymentMethod: form.paymentMethod,
    transactionId: form.transactionId.trim(),
    reference: form.reference.trim(),
    paidAt,
    proofDocumentId: form.proofDocumentId.trim() || undefined,
    proofReference: form.proofReference.trim() || undefined,
    comment: form.comment.trim() || undefined
  };
}

const filterGroups: Record<ListFilter, PaymentDeclarationStatus[]> = {
  ALL: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMITTED'],
  DRAFT: ['DRAFT'],
  SUBMITTED: ['SUBMITTED', 'RESUBMITTED'],
  DECIDED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED']
};

export const EmployerPaymentsScreen: React.FC = () => {
  const {
    currentUser,
    contracts,
    paymentDeclarations,
    createPaymentDeclaration,
    updatePaymentDeclaration,
    refreshPaymentDeclarations
  } = useApp();

  const [filter, setFilter] = useState<ListFilter>('ALL');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PaymentFormState>(EMPTY_PAYMENT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const myContracts = useMemo(
    () => contracts.filter(contract => contract.employerId === currentUser?.id),
    [contracts, currentUser?.id]
  );

  const contractLabel = (contractId: string): string => {
    const contract = myContracts.find(item => item.id === contractId);
    return contract ? contract.offerTitle : 'Contrat indisponible';
  };

  const visibleDeclarations = paymentDeclarations.filter(declaration =>
    filterGroups[filter].includes(declaration.status)
  );

  const countFor = (key: ListFilter): number =>
    paymentDeclarations.filter(declaration => filterGroups[key].includes(declaration.status)).length;

  const openCreateSheet = () => {
    const today = new Date();
    setEditingId(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    setForm({
      ...EMPTY_PAYMENT_FORM,
      contractId: myContracts[0]?.id || '',
      paymentDate: today.toLocaleDateString('fr-CA'),
      paymentTime: today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false })
    });
    setSheetOpen(true);
  };

  const openEditSheet = (declaration: PaymentDeclaration) => {
    setEditingId(declaration.paymentId);
    setErrorMessage(null);
    setSuccessMessage(null);
    setForm({
      contractId: declaration.contractId,
      amount: String(declaration.amount),
      paymentMethod: declaration.paymentMethod,
      transactionId: declaration.transactionId,
      reference: declaration.reference,
      paymentDate: toLocalDate(declaration.paidAt),
      paymentTime: toLocalTime(declaration.paidAt),
      proofDocumentId: declaration.proofDocumentId || '',
      proofReference: declaration.proofReference || '',
      comment: declaration.comment || ''
    });
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setEditingId(null);
    setErrorMessage(null);
  };

  const canSubmitForm = Boolean(
    form.contractId &&
    form.amount.trim() &&
    form.transactionId.trim() &&
    form.reference.trim() &&
    form.paymentDate &&
    form.paymentTime &&
    (form.proofDocumentId.trim() || form.proofReference.trim())
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmitForm) {
      setErrorMessage('Tous les champs obligatoires doivent être renseignés, justificatif compris.');
      return;
    }
    const payload = buildPaymentDeclarationPayload(form);

    setSubmitting(true);
    setErrorMessage(null);
    try {
      if (editingId) {
        await updatePaymentDeclaration(editingId, payload);
      } else {
        await createPaymentDeclaration(payload);
      }
      await refreshPaymentDeclarations();
      setSuccessMessage(editingId
        ? 'Déclaration mise à jour. Elle reste enregistrée en brouillon.'
        : 'Déclaration enregistrée en brouillon dans « Mes Paiements ».');
      setEditingId(null);
      setForm(EMPTY_PAYMENT_FORM);
      setTimeout(() => {
        setSuccessMessage(null);
        setSheetOpen(false);
      }, 1600);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = <K extends keyof PaymentFormState>(field: K, value: PaymentFormState[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#F3F3EC] p-5 pb-24 font-operational text-[#17233B] select-none no-scrollbar">
      {/* En-tête éditorial (même registre que « Mes Contrats ») */}
      <div className="mb-5 space-y-1">
        <div className="flex items-center justify-between gap-3">
          <span className="editorial-kicker">ESPACE RECRUTEUR — RÈGLEMENTS</span>
          <span className="font-mono text-[10px] text-[#17233B]/60 bg-white border border-[#17233B]/10 px-2 py-0.5 rounded">
            {currentUser?.publicId || 'Identifiant indisponible'}
          </span>
        </div>
        <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-[#17233B] tracking-tight leading-tight">
          Mes Paiements
        </h1>
        <p className="text-xs text-[#17233B]/70 leading-relaxed pt-0.5">
          Déclarez les règlements effectués hors plateforme et rattachez-y leur justificatif.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1 border-b border-[#17233B]/10">
          {([
            ['ALL', 'Tous'],
            ['DRAFT', 'Brouillons'],
            ['SUBMITTED', 'Soumis'],
            ['DECIDED', 'Traités']
          ] as Array<[ListFilter, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors shrink-0 cursor-pointer ${
                filter === key
                  ? 'bg-[#17233B] text-[#F3F3EC]'
                  : 'bg-white border border-[#17233B]/10 text-[#17233B]/70 hover:text-[#17233B]'
              }`}
            >
              {label} ({countFor(key)})
            </button>
          ))}
        </div>
        <EditorialButton variant="primary" size="sm" onClick={openCreateSheet} disabled={myContracts.length === 0}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          <span>Nouveau paiement</span>
        </EditorialButton>
      </div>

      {successMessage && !sheetOpen && (
        <div className="mb-4 p-3 bg-[#1BA64B]/10 border border-[#1BA64B]/30 rounded-[4px] text-xs text-[#1BA64B] font-medium">
          {successMessage}
        </div>
      )}

      <div className="space-y-4">
        {visibleDeclarations.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-[4px] border border-[#17233B]/10 space-y-2">
            <Receipt className="w-8 h-8 text-[#17233B]/30 mx-auto" />
            <h3 className="font-editorial text-lg font-bold text-[#17233B]">
              {paymentDeclarations.length === 0 ? 'Aucune déclaration de paiement' : 'Aucune déclaration dans cette section'}
            </h3>
            <p className="text-xs text-[#17233B]/60 max-w-xs mx-auto">
              {myContracts.length === 0
                ? 'Vos contrats signés permettent de déclarer un règlement. Aucun contrat employeur n’est encore disponible.'
                : 'Utilisez « Nouveau paiement » pour enregistrer un règlement effectué hors plateforme.'}
            </p>
          </div>
        ) : (
          visibleDeclarations.map(declaration => (
            <article key={declaration.paymentId} className="bg-white rounded-[4px] border border-[#17233B]/12 p-5 shadow-xs space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-[#17233B]/50 uppercase font-semibold">
                      {declaration.paymentId}
                    </span>
                    <span className="text-[10px] text-[#17233B]/40 font-mono">·</span>
                    <span className="font-mono text-[10px] text-[#340C24] font-bold">{declaration.contractId}</span>
                  </div>
                  <h3 className="font-editorial text-xl font-bold text-[#17233B] mt-0.5 leading-snug">
                    {contractLabel(declaration.contractId)}
                  </h3>
                  <p className="text-xs text-[#17233B]/70 mt-0.5">
                    {EXTERNAL_PAYMENT_METHOD_LABELS[declaration.paymentMethod]} · payé le {formatDateTime(declaration.paidAt)}
                  </p>
                </div>
                <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-[4px] border shrink-0 ${STATUS_STYLES[declaration.status]}`}>
                  {PAYMENT_DECLARATION_STATUS_LABELS[declaration.status]}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 p-3.5 bg-[#F3F3EC] rounded-[4px] text-xs">
                <div>
                  <span className="text-[10px] font-mono uppercase text-[#17233B]/50 block font-medium">Montant déclaré</span>
                  <span className="font-mono font-bold text-sm text-[#17233B] mt-0.5 block">
                    {declaration.amount.toLocaleString()} {declaration.currency}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase text-[#17233B]/50 block font-medium">Moyen de paiement</span>
                  <span className="font-medium text-[#17233B] mt-0.5 block">
                    {EXTERNAL_PAYMENT_METHOD_LABELS[declaration.paymentMethod]}
                  </span>
                </div>
                <div className="flex items-start gap-1.5 min-w-0">
                  <Hash className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#17233B]/45" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono uppercase text-[#17233B]/50 block font-medium">ID transaction</span>
                    <span className="font-mono text-[11px] text-[#17233B] break-all">{declaration.transactionId}</span>
                  </div>
                </div>
                <div className="flex items-start gap-1.5 min-w-0">
                  <ScrollText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#17233B]/45" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono uppercase text-[#17233B]/50 block font-medium">Référence</span>
                    <span className="font-mono text-[11px] text-[#17233B] break-all">{declaration.reference}</span>
                  </div>
                </div>
                <div className="col-span-2 pt-1 border-t border-[#17233B]/8 flex items-center gap-1.5 text-[11px] text-[#17233B]/70">
                  <FileCheck2 className="w-3.5 h-3.5 shrink-0 text-[#17233B]/50" />
                  <span className="truncate">
                    Justificatif : {declaration.proofDocumentId ? `document ${declaration.proofDocumentId}` : `référence ${declaration.proofReference || '—'}`}
                  </span>
                </div>
                {declaration.comment && (
                  <div className="col-span-2 text-[11px] text-[#17233B]/70 leading-relaxed">
                    <span className="text-[10px] font-mono uppercase text-[#17233B]/50 block font-medium mb-0.5">Commentaire</span>
                    {declaration.comment}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-[#17233B]/10 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-[10px] font-mono text-[#17233B]/50">
                  <span className="flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" />
                    Créé le {formatDateTime(declaration.createdAt)}
                  </span>
                  {declaration.submittedAt && <span>Soumis le {formatDateTime(declaration.submittedAt)}</span>}
                  {declaration.updatedAt !== declaration.createdAt && <span>Modifié le {formatDateTime(declaration.updatedAt)}</span>}
                </div>
                {declaration.status === 'DRAFT' && (
                  <EditorialButton variant="outline" size="sm" onClick={() => openEditSheet(declaration)}>
                    <Pencil className="w-3.5 h-3.5 mr-1 text-[#17233B]/60" />
                    <span>Modifier</span>
                  </EditorialButton>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      {/* Formulaire de déclaration (création / modification d'un brouillon) */}
      <EditorialSheet
        isOpen={sheetOpen}
        onClose={closeSheet}
        title={editingId ? 'Modifier la déclaration' : 'Nouveau paiement'}
        subtitle={editingId ? `Réf. ${editingId}` : 'Règlement effectué hors plateforme LE LABEUR'}
        footer={
          <div className="flex items-center gap-3">
            <EditorialButton variant="outline" className="flex-1" disabled={submitting} onClick={closeSheet}>
              Annuler
            </EditorialButton>
            <EditorialButton variant="primary" className="flex-1" disabled={submitting || !canSubmitForm} onClick={handleSubmit}>
              {submitting ? 'Enregistrement...' : 'Enregistrer'}
            </EditorialButton>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4 font-operational text-xs">
          {errorMessage && (
            <div className="p-3 bg-[#E23D3D]/8 border border-[#E23D3D]/25 rounded text-[#E23D3D] font-medium leading-relaxed">
              {errorMessage}
            </div>
          )}
          {successMessage && (
            <div className="p-3 bg-[#1BA64B]/10 border border-[#1BA64B]/30 rounded text-[#1BA64B] font-medium leading-relaxed">
              {successMessage}
            </div>
          )}

          <div className="p-3 bg-white rounded border border-[#17233B]/10 text-xs text-[#17233B]/80 leading-relaxed flex items-start gap-2">
            <Banknote className="w-4 h-4 text-[#17233B]/50 shrink-0 mt-0.5" />
            <span>
              Le paiement est réalisé <strong>hors LE LABEUR</strong>. Cette déclaration enregistre la preuve de l'opération :
              elle est sauvegardée en <strong>brouillon</strong> et reste modifiable tant qu'elle n'est pas soumise.
            </span>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-[#17233B]/70 font-semibold mb-1">
              Contrat concerné *
            </label>
            <select
              value={form.contractId}
              onChange={event => updateField('contractId', event.target.value)}
              className="w-full h-10 px-3 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
            >
              {myContracts.length === 0 && <option value="">Aucun contrat disponible</option>}
              {myContracts.map(contract => (
                <option key={contract.id} value={contract.id}>
                  {contract.id} — {contract.offerTitle} ({contract.employeeName})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-mono uppercase text-[#17233B]/70 font-semibold mb-1">
                Montant (FCFA) *
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={form.amount}
                onChange={event => updateField('amount', event.target.value)}
                placeholder="7500"
                className="w-full h-10 px-3 bg-white rounded border border-[#17233B]/15 text-xs font-mono text-[#17233B] focus:outline-none focus:border-[#17233B]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase text-[#17233B]/70 font-semibold mb-1">
                Moyen de paiement *
              </label>
              <select
                value={form.paymentMethod}
                onChange={event => updateField('paymentMethod', event.target.value as ExternalPaymentMethod)}
                className="w-full h-10 px-3 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
              >
                {EXTERNAL_PAYMENT_METHODS.map(method => (
                  <option key={method} value={method}>
                    {EXTERNAL_PAYMENT_METHOD_LABELS[method]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-[#17233B]/70 font-semibold mb-1">
              ID de transaction *
            </label>
            <input
              type="text"
              value={form.transactionId}
              onChange={event => updateField('transactionId', event.target.value)}
              placeholder="Ex. TXN-MTN-20261005-4471"
              className="w-full h-10 px-3 bg-white rounded border border-[#17233B]/15 text-xs font-mono text-[#17233B] focus:outline-none focus:border-[#17233B]"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-[#17233B]/70 font-semibold mb-1">
              Référence du paiement *
            </label>
            <input
              type="text"
              value={form.reference}
              onChange={event => updateField('reference', event.target.value)}
              placeholder="Ex. REF-LABEUR-CTR001-M1"
              className="w-full h-10 px-3 bg-white rounded border border-[#17233B]/15 text-xs font-mono text-[#17233B] focus:outline-none focus:border-[#17233B]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-mono uppercase text-[#17233B]/70 font-semibold mb-1">
                Date du paiement *
              </label>
              <input
                type="date"
                value={form.paymentDate}
                onChange={event => updateField('paymentDate', event.target.value)}
                className="w-full h-10 px-3 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase text-[#17233B]/70 font-semibold mb-1">
                Heure du paiement *
              </label>
              <input
                type="time"
                value={form.paymentTime}
                onChange={event => updateField('paymentTime', event.target.value)}
                className="w-full h-10 px-3 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
              />
            </div>
          </div>

          <div className="p-3 bg-white rounded border border-[#17233B]/10 space-y-3">
            <span className="editorial-kicker block">Justificatif *</span>
            <div>
              <label className="block text-[10px] font-mono uppercase text-[#17233B]/70 font-semibold mb-1">
                Identifiant du document (facultatif)
              </label>
              <input
                type="text"
                value={form.proofDocumentId}
                onChange={event => updateField('proofDocumentId', event.target.value)}
                placeholder="Ex. DOC-REC-MTN-0001"
                className="w-full h-10 px-3 bg-white rounded border border-[#17233B]/15 text-xs font-mono text-[#17233B] focus:outline-none focus:border-[#17233B]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase text-[#17233B]/70 font-semibold mb-1">
                Référence du justificatif (reçu, bordereau…)
              </label>
              <input
                type="text"
                value={form.proofReference}
                onChange={event => updateField('proofReference', event.target.value)}
                placeholder="Ex. RECU-MTN-4471-20261003"
                className="w-full h-10 px-3 bg-white rounded border border-[#17233B]/15 text-xs font-mono text-[#17233B] focus:outline-none focus:border-[#17233B]"
              />
            </div>
            <p className="text-[10px] text-[#17233B]/55 leading-relaxed">
              Renseignez au moins l'un des deux champs : l'envoi du fichier signé (R2) arrive avec l'étape de contrôle.
            </p>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-[#17233B]/70 font-semibold mb-1">
              Commentaire (facultatif)
            </label>
            <textarea
              rows={3}
              value={form.comment}
              onChange={event => updateField('comment', event.target.value)}
              placeholder="Précisions utiles au contrôle : émetteur, agence, motif du règlement…"
              className="w-full p-3 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
            />
          </div>
        </form>
      </EditorialSheet>
    </div>
  );
};
