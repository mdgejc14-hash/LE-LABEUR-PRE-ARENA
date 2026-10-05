import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Plus,
  Paperclip,
  Receipt,
  RotateCcw,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EditorialButton } from '../components/common/EditorialButton';
import { EditorialSheet } from '../components/common/EditorialSheet';
import { HairlineDivider } from '../components/common/HairlineDivider';
import {
  PAYMENT_HISTORY_LABELS,
  PAYMENT_KIND_LABELS,
  PAYMENT_METHODS,
  PAYMENT_STATUS_LABELS,
  isPaymentAwaitingAdminAction,
} from '../domain/paymentDeclarations';
import type { PaymentDeclaration, PaymentDeclarationKind, PaymentDeclarationStatus, PaymentMethod } from '../types';

const STATUS_STYLES: Record<PaymentDeclarationStatus, string> = {
  DRAFT: 'bg-[#17233B]/5 text-[#17233B]/70 border-[#17233B]/10',
  SUBMITTED: 'bg-[#FFA800]/10 text-[#7B5B00] border-[#FFA800]/25',
  UNDER_REVIEW: 'bg-[#B5CEDB]/40 text-[#17233B] border-[#17233B]/15',
  APPROVED: 'bg-[#1BA64B]/10 text-[#14662F] border-[#1BA64B]/25',
  REJECTED: 'bg-[#E23D3D]/8 text-[#A33A2B] border-[#E23D3D]/25',
  RESUBMITTED: 'bg-[#B5CEDB]/40 text-[#17233B] border-[#17233B]/15',
};

const formatDateTime = (value?: string): string =>
  value ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const formatDay = (value?: string): string =>
  value ? new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const toDatetimeLocal = (value?: string): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

interface DeclarationFormState {
  contractId: string;
  monthNumber: number;
  kind: PaymentDeclarationKind;
  amount: string;
  paymentMethod: PaymentMethod;
  transactionId: string;
  reference: string;
  paidAt: string;
  proofFileName: string;
  proofUri: string;
  proofMimeType: string;
  comment: string;
}

const emptyForm = (): DeclarationFormState => ({
  contractId: '',
  monthNumber: 1,
  kind: 'COMMISSION',
  amount: '',
  paymentMethod: 'MTN_MOMO',
  transactionId: '',
  reference: '',
  paidAt: toDatetimeLocal(new Date().toISOString()),
  proofFileName: '',
  proofUri: '',
  proofMimeType: '',
  comment: '',
});

export const EmployerPaymentsScreen: React.FC = () => {
  const {
    currentUser,
    contracts,
    paymentDeclarations,
    createPaymentDeclaration,
    updatePaymentDeclaration,
    submitPaymentDeclaration,
    resubmitPaymentDeclaration,
  } = useApp();

  const [createOpen, setCreateOpen] = useState(false);
  const [resubmitting, setResubmitting] = useState<PaymentDeclaration | null>(null);
  const [form, setForm] = useState<DeclarationFormState>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState('');

  const myContracts = useMemo(
    () => contracts.filter(contract => contract.employerId === currentUser?.id),
    [contracts, currentUser?.id],
  );

  const selectedContract = useMemo(
    () => myContracts.find(contract => contract.id === form.contractId),
    [myContracts, form.contractId],
  );

  const availableMonths = useMemo(
    () => selectedContract?.paymentSchedule ?? [],
    [selectedContract],
  );

  const expectedAmount = useMemo(() => {
    const entry = availableMonths.find(item => item.monthNumber === form.monthNumber);
    if (!entry) return 0;
    return form.kind === 'COMMISSION' ? entry.commissionAmount : entry.employeeShareAmount;
  }, [availableMonths, form.monthNumber, form.kind]);

  const totals = useMemo(() => {
    const declared = paymentDeclarations.reduce((sum, item) => sum + item.amount, 0);
    const approved = paymentDeclarations.filter(item => item.status === 'APPROVED').reduce((sum, item) => sum + item.amount, 0);
    const pending = paymentDeclarations.filter(item => isPaymentAwaitingAdminAction(item.status)).length;
    const toRegularize = paymentDeclarations.filter(item => item.status === 'REJECTED').length;
    return { declared, approved, pending, toRegularize };
  }, [paymentDeclarations]);

  const openCreate = () => {
    setError('');
    setMessage('');
    const firstContract = myContracts[0];
    const firstMonth = firstContract?.paymentSchedule?.[0];
    setForm({
      ...emptyForm(),
      contractId: firstContract?.id ?? '',
      monthNumber: firstMonth?.monthNumber ?? 1,
      amount: firstMonth ? String(firstMonth.commissionAmount > 0 ? firstMonth.commissionAmount : firstMonth.employeeShareAmount) : '',
      kind: firstMonth && firstMonth.commissionAmount > 0 ? 'COMMISSION' : 'SALARY',
    });
    setCreateOpen(true);
  };

  const openResubmit = (declaration: PaymentDeclaration) => {
    setError('');
    setMessage('');
    setResubmitting(declaration);
    setForm({
      contractId: declaration.contractId,
      monthNumber: declaration.monthNumber,
      kind: declaration.kind,
      amount: String(declaration.amount),
      paymentMethod: declaration.paymentMethod,
      transactionId: declaration.transactionId,
      reference: declaration.reference,
      paidAt: toDatetimeLocal(declaration.paidAt),
      proofFileName: declaration.proof.fileName,
      proofUri: declaration.proof.uri,
      proofMimeType: declaration.proof.mimeType ?? '',
      comment: declaration.comment ?? '',
    });
    setCreateOpen(true);
  };

  const closeSheet = () => {
    setCreateOpen(false);
    setResubmitting(null);
    setForm(emptyForm());
  };

  const patchForm = (patch: Partial<DeclarationFormState>) => setForm(prev => ({ ...prev, ...patch }));

  const buildInput = () => ({
    contractId: form.contractId,
    monthNumber: form.monthNumber,
    kind: form.kind,
    amount: Number(form.amount),
    paymentMethod: form.paymentMethod,
    transactionId: form.transactionId.trim(),
    ...(form.reference.trim() ? { reference: form.reference.trim() } : {}),
    paidAt: new Date(form.paidAt).toISOString(),
    proof: {
      fileName: form.proofFileName.trim(),
      uri: form.proofUri.trim() || `blob:${form.proofFileName.trim()}`,
      ...(form.proofMimeType ? { mimeType: form.proofMimeType } : {}),
    },
    ...(form.comment.trim() ? { comment: form.comment.trim() } : {}),
  });

  const runCreate = async (submit: boolean) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const created = await createPaymentDeclaration(buildInput());
      if (submit) {
        await submitPaymentDeclaration(created.id);
        setMessage('Déclaration soumise à la vérification de LE LABEUR.');
      } else {
        setMessage('Brouillon enregistré. Il reste à soumettre la déclaration.');
      }
      closeSheet();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Déclaration impossible.');
    } finally {
      setBusy(false);
    }
  };

  const runResubmit = async () => {
    if (!resubmitting) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await resubmitPaymentDeclaration(resubmitting.id, buildInput());
      setMessage('Régularisation transmise : le dossier repart en vérification.');
      closeSheet();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Régularisation impossible.');
    } finally {
      setBusy(false);
    }
  };

  const runSubmitDraft = async (declarationId: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await submitPaymentDeclaration(declarationId);
      setMessage('Déclaration soumise à la vérification de LE LABEUR.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Soumission impossible.');
    } finally {
      setBusy(false);
    }
  };

  const runDiscardDraft = async (declaration: PaymentDeclaration) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await updatePaymentDeclaration(declaration.id, { comment: '' });
      setMessage('Brouillon conservé : complétez-le puis soumettez-le.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mise à jour impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-5 bg-[#F3F3EC] select-none pb-28 font-operational text-xs text-[#17233B]">
      <div className="space-y-1">
        <span className="editorial-kicker">ESPACE EMPLOYEUR · PAIEMENTS</span>
        <h1 className="font-editorial text-2xl font-bold text-[#17233B] tracking-tight">Mes paiements</h1>
        <p className="text-[11px] text-[#17233B]/60 leading-relaxed">
          Déclarez vos règlements effectués hors application (Mobile Money, virement, guichet). LE LABEUR
          vérifie la preuve fournie : aucun encaissement n’est traité dans l’application.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-[#17233B]/10 bg-white p-3.5 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-[#17233B]/50 shrink-0 mt-0.5" />
        <p className="text-[11px] text-[#17233B]/70 leading-relaxed">
          Vous payez LE LABEUR <strong>extérieurement</strong>, puis vous déclarez le paiement ici avec l’ID de
          transaction et le justificatif. En cas de rejet, le montant reste dû : corrigez puis régularisez.
        </p>
      </div>

      {message && (
        <div className="mt-3 rounded-2xl px-3.5 py-2.5 bg-emerald-50 text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-2xl px-3.5 py-2.5 bg-rose-50 text-[#A33A2B] flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white border border-[#17233B]/10 p-3">
          <div className="text-[10px] uppercase tracking-wide text-[#17233B]/50">Montant déclaré</div>
          <div className="text-lg font-semibold text-[#17233B] mt-1">{totals.declared.toLocaleString()} FCFA</div>
        </div>
        <div className="rounded-2xl bg-white border border-[#17233B]/10 p-3">
          <div className="text-[10px] uppercase tracking-wide text-[#17233B]/50">En vérification</div>
          <div className="text-lg font-semibold text-[#7B5B00] mt-1">{totals.pending}</div>
        </div>
        <div className="rounded-2xl bg-white border border-[#17233B]/10 p-3">
          <div className="text-[10px] uppercase tracking-wide text-[#17233B]/50">Approuvé</div>
          <div className="text-lg font-semibold text-[#14662F] mt-1">{totals.approved.toLocaleString()} FCFA</div>
        </div>
        <div className="rounded-2xl bg-white border border-[#17233B]/10 p-3">
          <div className="text-[10px] uppercase tracking-wide text-[#17233B]/50">À régulariser</div>
          <div className="text-lg font-semibold text-[#A33A2B] mt-1">{totals.toRegularize}</div>
        </div>
      </div>

      <EditorialButton variant="primary" fullWidth className="mt-4" onClick={openCreate}>
        <Plus className="w-4 h-4 mr-2" />
        Nouvelle déclaration de paiement
      </EditorialButton>

      <HairlineDivider className="my-4" />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#17233B]">Historique de mes déclarations</h2>
        <span className="text-[11px] text-[#17233B]/50">{paymentDeclarations.length} dossier(s)</span>
      </div>

      <div className="mt-3 space-y-3">
        {paymentDeclarations.map(declaration => {
          const expanded = expandedId === declaration.id;
          const mismatch = declaration.amount !== declaration.amountDue;
          return (
            <article key={declaration.id} className="rounded-2xl bg-white border border-[#17233B]/10 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-[#17233B]/50">{declaration.id}</p>
                  <h3 className="font-semibold text-[#17233B] truncate">{declaration.reference}</h3>
                  <p className="text-[11px] text-[#17233B]/60 mt-0.5 truncate">
                    {declaration.contractTitle} · {declaration.periodKey}
                  </p>
                </div>
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-[4px] border text-[10px] font-semibold uppercase ${STATUS_STYLES[declaration.status]}`}>
                  {PAYMENT_STATUS_LABELS[declaration.status]}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                <div>
                  <dt className="text-[#17233B]/50">Montant déclaré</dt>
                  <dd className="font-semibold text-[#17233B]">
                    {declaration.amount.toLocaleString()} {declaration.currency}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#17233B]/50">Montant attendu</dt>
                  <dd className={`font-semibold ${mismatch ? 'text-[#A33A2B]' : 'text-[#17233B]'}`}>
                    {declaration.amountDue.toLocaleString()} {declaration.currency}
                    {mismatch && <span className="ml-1 text-[10px] font-normal">écart constaté</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#17233B]/50">Nature</dt>
                  <dd className="text-[#17233B]">{PAYMENT_KIND_LABELS[declaration.kind]}</dd>
                </div>
                <div>
                  <dt className="text-[#17233B]/50">Moyen</dt>
                  <dd className="text-[#17233B]">
                    {PAYMENT_METHODS.find(m => m.id === declaration.paymentMethod)?.label ?? declaration.paymentMethod}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#17233B]/50">Transaction</dt>
                  <dd className="font-mono text-[#17233B] break-all">{declaration.transactionId}</dd>
                </div>
                <div>
                  <dt className="text-[#17233B]/50">Payé le</dt>
                  <dd className="text-[#17233B]">{formatDateTime(declaration.paidAt)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[#17233B]/50">Justificatif</dt>
                  <dd className="flex items-center gap-1.5 text-[#17233B]">
                    <Paperclip className="w-3.5 h-3.5 text-[#17233B]/40 shrink-0" />
                    <span className="truncate">{declaration.proof.fileName}</span>
                  </dd>
                </div>
              </dl>

              {declaration.comment && (
                <p className="text-[11px] text-[#17233B]/60 italic">« {declaration.comment} »</p>
              )}

              {declaration.status === 'REJECTED' && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-[#A33A2B] flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5" /> Paiement rejeté — montant toujours dû
                  </p>
                  <p className="text-[11px] text-[#A33A2B]/90 leading-relaxed">{declaration.rejectionReason}</p>
                  <p className="text-[10px] text-[#A33A2B]/70">
                    Rejet prononcé par {declaration.reviewedByName ?? 'l’administration'} le{' '}
                    {formatDateTime(declaration.reviewedAt)}
                  </p>
                  <EditorialButton variant="danger" size="sm" onClick={() => openResubmit(declaration)} disabled={busy}>
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Régulariser et resoumettre
                  </EditorialButton>
                </div>
              )}

              {declaration.status === 'APPROVED' && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                  <p className="text-[11px] font-semibold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Paiement vérifié et approuvé
                  </p>
                  <p className="text-[10px] text-emerald-700/90 mt-1">
                    Par {declaration.reviewedByName ?? 'l’administration'} le {formatDateTime(declaration.reviewedAt)}
                  </p>
                </div>
              )}

              {declaration.status === 'DRAFT' && (
                <div className="flex flex-wrap gap-2">
                  <EditorialButton variant="primary" size="sm" onClick={() => void runSubmitDraft(declaration.id)} disabled={busy}>
                    <Send className="w-3.5 h-3.5 mr-1.5" /> Soumettre la déclaration
                  </EditorialButton>
                  <EditorialButton variant="secondary" size="sm" onClick={() => openResubmit(declaration)} disabled={busy}>
                    Modifier le brouillon
                  </EditorialButton>
                  <EditorialButton variant="outline" size="sm" onClick={() => void runDiscardDraft(declaration)} disabled={busy}>
                    Conserver
                  </EditorialButton>
                </div>
              )}

              {isPaymentAwaitingAdminAction(declaration.status) && (
                <p className="text-[11px] text-[#7B5B00] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Dossier transmis au contrôle LE LABEUR le {formatDateTime(declaration.submittedAt ?? declaration.resubmittedAt)}
                </p>
              )}

              <button
                type="button"
                onClick={() => setExpandedId(expanded ? '' : declaration.id)}
                className="w-full flex items-center justify-between text-[11px] font-semibold text-[#17233B]/70 hover:text-[#17233B] pt-1 border-t border-[#17233B]/5 cursor-pointer"
              >
                <span>Historique du dossier ({declaration.history.length})</span>
                <ArrowRight className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
              </button>

              {expanded && (
                <ol className="space-y-2 border-l border-[#17233B]/10 pl-3">
                  {declaration.history.map(event => (
                    <li key={event.id} className="relative">
                      <span className="absolute -left-[17px] top-1.5 w-2 h-2 rounded-full bg-[#17233B]/30" />
                      <p className="text-[11px] font-semibold text-[#17233B]">
                        {PAYMENT_HISTORY_LABELS[event.type]}
                      </p>
                      <p className="text-[10px] text-[#17233B]/55">
                        {formatDateTime(event.occurredAt)} · {event.actorName}
                        {event.fromStatus && event.toStatus ? ` · ${event.fromStatus} → ${event.toStatus}` : ''}
                      </p>
                      {event.reason && (
                        <p className="text-[10px] text-[#17233B]/70 mt-0.5 italic">« {event.reason} »</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </article>
          );
        })}

        {paymentDeclarations.length === 0 && (
          <div className="rounded-2xl bg-white border border-[#17233B]/10 p-6 text-center text-[11px] text-[#17233B]/55">
            Aucune déclaration de paiement pour le moment.
          </div>
        )}
      </div>

      <EditorialSheet
        isOpen={createOpen}
        onClose={closeSheet}
        title={resubmitting ? 'Régulariser ma déclaration' : 'Nouvelle déclaration de paiement'}
        subtitle={
          resubmitting
            ? `${resubmitting.reference} · ${resubmitting.contractTitle}`
            : 'Paiement effectué hors application, preuve à fournir'
        }
        footer={
          resubmitting ? (
            <EditorialButton variant="primary" fullWidth onClick={() => void runResubmit()} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
              Soumettre la régularisation
            </EditorialButton>
          ) : (
            <div className="flex gap-2">
              <EditorialButton variant="secondary" fullWidth onClick={() => void runCreate(false)} disabled={busy}>
                Enregistrer le brouillon
              </EditorialButton>
              <EditorialButton variant="primary" fullWidth onClick={() => void runCreate(true)} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Soumettre
              </EditorialButton>
            </div>
          )
        }
      >
        <div className="space-y-3 font-operational text-xs">
          <p className="text-[11px] text-[#17233B]/70 leading-relaxed">
            Renseignez les informations du règlement effectué hors application. Le justificatif est obligatoire :
            l’administration s’en sert pour valider la déclaration.
          </p>

          <div>
            <label className="block font-medium text-[#17233B] mb-1">Contrat concerné</label>
            <select
              value={form.contractId}
              onChange={e => {
                const contract = myContracts.find(c => c.id === e.target.value);
                const firstMonth = contract?.paymentSchedule?.[0];
                patchForm({
                  contractId: e.target.value,
                  monthNumber: firstMonth?.monthNumber ?? 1,
                  amount: firstMonth
                    ? String(firstMonth.commissionAmount > 0 ? firstMonth.commissionAmount : firstMonth.employeeShareAmount)
                    : '',
                });
              }}
              className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded-[4px] text-xs"
            >
              <option value="">Sélectionner un contrat</option>
              {myContracts.map(contract => (
                <option key={contract.id} value={contract.id}>
                  {contract.offerTitle} — {contract.employeeName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-medium text-[#17233B] mb-1">Mois</label>
              <select
                value={form.monthNumber}
                onChange={e => {
                  const monthNumber = Number(e.target.value);
                  const entry = availableMonths.find(item => item.monthNumber === monthNumber);
                  patchForm({
                    monthNumber,
                    amount: entry
                      ? String(form.kind === 'COMMISSION' ? entry.commissionAmount : entry.employeeShareAmount)
                      : '',
                  });
                }}
                className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded-[4px] text-xs"
              >
                {availableMonths.map(entry => (
                  <option key={entry.id} value={entry.monthNumber}>
                    {entry.periodKey}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-[#17233B] mb-1">Nature du versement</label>
              <select
                value={form.kind}
                onChange={e => {
                  const kind = e.target.value as PaymentDeclarationKind;
                  const entry = availableMonths.find(item => item.monthNumber === form.monthNumber);
                  patchForm({
                    kind,
                    amount: entry
                      ? String(kind === 'COMMISSION' ? entry.commissionAmount : entry.employeeShareAmount)
                      : '',
                  });
                }}
                className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded-[4px] text-xs"
              >
                <option value="COMMISSION">Commission LE LABEUR</option>
                <option value="SALARY">Salaire du travailleur</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-medium text-[#17233B] mb-1">Montant réglé (FCFA)</label>
              <input
                type="number"
                value={form.amount}
                onChange={e => patchForm({ amount: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded-[4px] text-xs font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-[#17233B] mb-1">Montant attendu</label>
              <div className="h-10 px-3 flex items-center bg-[#F3F3EC] border border-[#17233B]/10 rounded-[4px] text-xs font-mono text-[#17233B]/70">
                {expectedAmount.toLocaleString()} FCFA
              </div>
            </div>
          </div>
          {Number(form.amount) > 0 && expectedAmount > 0 && Number(form.amount) !== expectedAmount && (
            <p className="text-[10px] text-[#A33A2B] flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Écart de montant : la déclaration pourra être rejetée par le contrôle.
            </p>
          )}

          <div>
            <label className="block font-medium text-[#17233B] mb-1">Moyen de paiement</label>
            <select
              value={form.paymentMethod}
              onChange={e => patchForm({ paymentMethod: e.target.value as PaymentMethod })}
              className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded-[4px] text-xs"
            >
              {PAYMENT_METHODS.map(method => (
                <option key={method.id} value={method.id}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-medium text-[#17233B] mb-1">ID de transaction</label>
              <input
                type="text"
                value={form.transactionId}
                onChange={e => patchForm({ transactionId: e.target.value })}
                placeholder="Ex. TXN-MTN-20261004-4471"
                className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded-[4px] text-xs font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-[#17233B] mb-1">Référence</label>
              <input
                type="text"
                value={form.reference}
                onChange={e => patchForm({ reference: e.target.value })}
                placeholder="Générée automatiquement si vide"
                className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded-[4px] text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#17233B] mb-1">Date et heure du paiement</label>
            <input
              type="datetime-local"
              value={form.paidAt}
              onChange={e => patchForm({ paidAt: e.target.value })}
              className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded-[4px] text-xs font-mono"
            />
          </div>

          <div>
            <label className="block font-medium text-[#17233B] mb-1">Justificatif de paiement</label>
            <div className="flex items-center gap-2 p-2 bg-white border border-[#17233B]/20 rounded-[4px]">
              <FileText className="w-4 h-4 text-[#17233B]/40 shrink-0" />
              <span className="font-mono text-[11px] text-[#17233B]/80 truncate flex-1">
                {form.proofFileName || 'Aucun fichier'}
              </span>
              <label className="px-2.5 py-1 bg-[#17233B]/10 hover:bg-[#17233B]/20 rounded text-[11px] font-semibold cursor-pointer">
                Parcourir
                <input
                  type="file"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      patchForm({
                        proofFileName: file.name,
                        proofUri: `blob:${file.name}`,
                        proofMimeType: file.type,
                      });
                    }
                  }}
                />
              </label>
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#17233B] mb-1">Remarque (facultative)</label>
            <textarea
              rows={2}
              value={form.comment}
              onChange={e => patchForm({ comment: e.target.value })}
              placeholder="Précisions utiles au contrôle (ex. complément de paiement)"
              className="w-full p-2 bg-white border border-[#17233B]/20 rounded-[4px] text-xs"
            />
          </div>

          {resubmitting && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3">
              <p className="text-[11px] font-semibold text-[#A33A2B]">Motif du dernier rejet</p>
              <p className="text-[11px] text-[#A33A2B]/90 mt-1 leading-relaxed">{resubmitting.rejectionReason}</p>
              <p className="text-[10px] text-[#A33A2B]/70 mt-1">
                L’historique complet du dossier est conservé ({resubmitting.history.length} événement(s)).
              </p>
            </div>
          )}

          {selectedContract && (
            <p className="text-[10px] text-[#17233B]/50 flex items-center gap-1">
              <Receipt className="w-3 h-3" />
              Échéance contractuelle de référence : {formatDay(
                form.kind === 'COMMISSION'
                  ? availableMonths.find(item => item.monthNumber === form.monthNumber)?.commissionDueDate
                  : availableMonths.find(item => item.monthNumber === form.monthNumber)?.salaryDueDate,
              )}
            </p>
          )}
        </div>
      </EditorialSheet>
    </div>
  );
};

export default EmployerPaymentsScreen;
