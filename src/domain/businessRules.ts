/**
 * Business Rules Centralisées LE LABEUR
 * RÈGLE ABSOLUE & NON NÉGOCIABLE :
 * - LE LABEUR est payé par L'EMPLOYEUR.
 * - Le salarié / candidat NE PAIE JAMAIS LA COMMISSION.
 * - IL N'EXISTE AUCUN SEUIL DE SALAIRE pour appliquer la règle 25%/0%.
 *
 * Premier salaire (M1) :
 *   - 25% du salaire convenu = LE LABEUR (payé par employeur)
 *   - 75% du salaire convenu = salarié (versé directement par employeur)
 *
 * Mois suivants (M2+) :
 *   - 0% = LE LABEUR
 *   - 100% = salarié (versé directement par employeur)
 */

import type { PaymentScheduleEntry } from '../types';

export interface SalaryBreakdown {
  salary: number;
  monthNumber: number;
  commissionRate: number; // 0.25 pour M1, 0.0 pour M2+
  commissionAmount: number;
  employeeShareAmount: number;
}

export function calculateFirstMonthCommission(salary: number, percentage = 25): number {
  if (salary <= 0) return 0;
  return Math.round(salary * percentage / 100);
}

export function calculateFirstMonthEmployeeShare(salary: number, percentage = 25): number {
  if (salary <= 0) return 0;
  return salary - calculateFirstMonthCommission(salary, percentage);
}

export function calculateLaterMonthCommission(): number {
  return 0;
}

export function calculateLaterMonthEmployeeShare(salary: number): number {
  if (salary <= 0) return 0;
  return salary;
}

export function getSalaryBreakdown(salary: number, monthNumber: number): SalaryBreakdown {
  const safeSalary = Math.max(0, salary);
  if (monthNumber <= 1) {
    const commission = calculateFirstMonthCommission(safeSalary);
    return {
      salary: safeSalary,
      monthNumber: 1,
      commissionRate: 0.25,
      commissionAmount: commission,
      employeeShareAmount: safeSalary - commission,
    };
  }
  return {
    salary: safeSalary,
    monthNumber,
    commissionRate: 0,
    commissionAmount: calculateLaterMonthCommission(),
    employeeShareAmount: calculateLaterMonthEmployeeShare(safeSalary),
  };
}


export type PaymentScheduleBuildContext = {
  contractId: string;
  startDate: string;
  durationMonths: number;
  monthlySalary: number;
  currency: string;
  /** Contract-configured rate; defaults to the existing 25% M1 rule. */
  commissionPercentage?: number;
  createdAt?: string;
};

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11, decembre: 11
};

function createValidatedUtcDate(year: number, monthIndex: number, day: number, original: string): Date {
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Date de début invalide : ${original}`);
  }
  return date;
}

export function parseContractStartDate(value: string): Date {
  if (!value || !value.trim()) {
    throw new Error('La date de début du contrat est obligatoire.');
  }
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    return createValidatedUtcDate(y, m - 1, d, value);
  }
  const dmY = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (dmY) {
    const [, d, m, y] = dmY;
    return createValidatedUtcDate(Number(y), Number(m) - 1, Number(d), value);
  }
  const fr = raw.toLowerCase().match(/^(\d{1,2})\s+([a-zéèêàûîôùç]+)\s+(\d{4})$/i);
  if (fr) {
    const [, day, monthName, year] = fr;
    const month = FRENCH_MONTHS[monthName];
    if (month !== undefined) {
      return createValidatedUtcDate(Number(year), month, Number(day), value);
    }
    throw new Error(`Date de début invalide : ${value}`);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Date de début invalide : ${value}`);
  }
  return createValidatedUtcDate(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), value);
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addMonthsClamped(source: Date, months: number): Date {
  const result = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), 1));
  result.setUTCMonth(result.getUTCMonth() + months);
  const targetMonth = result.getUTCMonth();
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(source.getUTCDate(), lastDay));
  return result;
}

export function buildPaymentSchedule(context: PaymentScheduleBuildContext): PaymentScheduleEntry[] {
  const {
    contractId,
    startDate,
    durationMonths,
    monthlySalary,
    currency,
    commissionPercentage = 25,
    createdAt = new Date().toISOString()
  } = context;
  const start = parseContractStartDate(startDate);
  const safeDuration = Math.max(1, Math.floor(durationMonths));

  return Array.from({ length: safeDuration }, (_, index) => {
    const monthNumber = index + 1;
    const periodStart = addMonthsClamped(start, index);
    const dueDate = addMonthsClamped(start, monthNumber);
    const safeSalary = Math.max(0, monthlySalary);
    const commissionAmount = monthNumber === 1
      ? calculateFirstMonthCommission(safeSalary, commissionPercentage)
      : 0;
    const employeeShareAmount = monthNumber === 1
      ? calculateFirstMonthEmployeeShare(safeSalary, commissionPercentage)
      : calculateLaterMonthEmployeeShare(safeSalary);

    return {
      id: `PSE-${contractId}-M${monthNumber}`,
      contractId,
      monthNumber,
      periodKey: `Mois ${String(monthNumber).padStart(2, '0')}`,
      periodStartDate: toIsoDate(periodStart),
      salaryDueDate: toIsoDate(dueDate),
      commissionDueDate: toIsoDate(dueDate),
      salaryAmount: safeSalary,
      employeeShareAmount,
      commissionAmount,
      commissionPercentage: monthNumber === 1 ? commissionPercentage : 0,
      currency,
      salaryStatus: 'SCHEDULED',
      commissionStatus: monthNumber === 1 ? 'SCHEDULED' : 'NOT_APPLICABLE',
      createdAt
    };
  });
}

export function isPaymentDue(dateValue: string, referenceDate = new Date()): boolean {
  const due = new Date(`${dateValue}T00:00:00.000Z`);
  const ref = new Date(Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate()));
  return !Number.isNaN(due.getTime()) && due.getTime() <= ref.getTime();
}
