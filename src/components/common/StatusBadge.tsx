import React from 'react';
import { CheckCircle2, AlertCircle, Clock, XCircle, ShieldCheck, FileSignature } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  type?: 'success' | 'warning' | 'error' | 'neutral' | 'info';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, type = 'neutral', className = '' }) => {
  let icon = <Clock className="w-3 h-3 mr-1 shrink-0 text-[#17233B]/50" />;
  let styles = 'text-[#17233B]/70 bg-[#17233B]/5 border-[#17233B]/10';

  if (
    type === 'success' ||
    status.includes('ACTIF') ||
    status.includes('ACTIVE') ||
    status.includes('PAYÉ') ||
    status.includes('ACCEPTÉ') ||
    status.includes('PAID') ||
    status.includes('CONFIRM') ||
    status.includes('SHORTLISTED') ||
    status.includes('FINALIZED') ||
    status.includes('RESOLVED')
  ) {
    icon = <CheckCircle2 className="w-3 h-3 mr-1 shrink-0 text-[#1BA64B]" />;
    styles = 'text-[#17233B] bg-[#1BA64B]/8 border-[#1BA64B]/20 font-medium';
  } else if (status.includes('SIGNATURE') || status.includes('PENDING_EMPLOYER') || status.includes('PENDING_EMPLOYEE')) {
    icon = <FileSignature className="w-3 h-3 mr-1 shrink-0 text-[#340C24]" />;
    styles = 'text-[#340C24] bg-[#340C24]/8 border-[#340C24]/20 font-semibold';
  } else if (
    type === 'warning' ||
    status.includes('DUE') ||
    status.includes('ATTENTE') ||
    status.includes('PENDING') ||
    status.includes('RÉVISER') ||
    status.includes('REVIEW') ||
    status.includes('SOURCING') ||
    status.includes('UNDER_REVIEW')
  ) {
    icon = <AlertCircle className="w-3 h-3 mr-1 shrink-0 text-[#FFA800]" />;
    styles = 'text-[#17233B] bg-[#FFA800]/10 border-[#FFA800]/25 font-medium';
  } else if (
    type === 'error' ||
    status.includes('INCIDENT') ||
    status.includes('REFUSÉ') ||
    status.includes('REJETÉ') ||
    status.includes('REJECTED') ||
    status.includes('TERMINÉ') ||
    status.includes('TERMINATED') ||
    status.includes('DECLINED') ||
    status.includes('WITHDRAWN') ||
    status.includes('CANCELLED')
  ) {
    icon = <XCircle className="w-3 h-3 mr-1 shrink-0 text-[#E23D3D]" />;
    styles = 'text-[#E23D3D] bg-[#E23D3D]/8 border-[#E23D3D]/20 font-medium';
  } else if (
    type === 'info' ||
    status.includes('LE LABEUR') ||
    status.includes('URGENTE') ||
    status.includes('REPLACEMENT') ||
    status.includes('REMPLACÉ') ||
    status.includes('FILLED')
  ) {
    icon = <ShieldCheck className="w-3 h-3 mr-1 shrink-0 text-[#17233B]" />;
    styles = 'text-[#17233B] bg-[#B5CEDB]/35 border-[#17233B]/15 font-semibold';
  }

  // Format label for display
  let displayLabel = status;
  if (status === 'ACTIVE') displayLabel = 'Actif';
  else if (status === 'SIGNATURE') displayLabel = 'En signature';
  else if (status === 'INCIDENT') displayLabel = 'Incident / Arbitrage';
  else if (status === 'TERMINATED') displayLabel = 'Terminé';
  else if (status === 'COMPLETED') displayLabel = 'Complété';
  else if (status === 'FILLED') displayLabel = 'Poste pourvu';
  else if (status === 'PENDING') displayLabel = 'En attente';
  else if (status === 'REVIEW') displayLabel = 'En examen';
  else if (status === 'SHORTLISTED') displayLabel = 'Retenue';
  else if (status === 'REJECTED') displayLabel = 'Refusée';
  else if (status === 'WITHDRAWN') displayLabel = 'Retirée';

  return (
    <span className={`inline-flex items-center text-[11px] font-operational tracking-tight px-2 py-0.5 rounded-[4px] border ${styles} ${className}`}>
      {icon}
      <span>{displayLabel}</span>
    </span>
  );
};
