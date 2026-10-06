import type { PostgreSqlDatabase } from '../services/database';
import type { ApiRouteHandler } from '../api/worker';
import { ApiError } from '../api/errors';
import type { AutomationStores } from '../automation/records';
import type { SqlQueryExecutor } from '../services/database';

const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const random = (size: number) => hex(crypto.getRandomValues(new Uint8Array(size)));
async function digest(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}
type Payment = { id: string; contract_id: string; candidate_id: string; employer_id: string; period_key: string; month_number: number; schedule_entry_id: string; amount: string; currency: string; payment_type: string; status: string };
type Proof = { payment_id: string; contract_id: string; candidate_id: string; employer_id: string; period_key: string; amount: string; currency: string; nonce: string; otp_digest: string; expires_at: Date | string; confirmed_at: Date | string | null; confirmed_by: string | null; confirmation_event_id: string | null; request_key: string; confirm_key: string | null };
class SalaryRejection extends Error { constructor(readonly action: string) { super(action); } }
const invalid = () => new ApiError('BUSINESS_RULE_VIOLATION', 'Confirmation salariale non admissible.');

/** OTP is never returned by production endpoints. A test-only sink may deliver it locally. */
export function createSalaryConfirmationHandlers(db: PostgreSqlDatabase, testOtpSink?: (paymentId: string, otp: string) => void, createSqlAutomationStores?: (tx: SqlQueryExecutor) => AutomationStores) {
  if (!createSqlAutomationStores) throw new Error('Automation stores required');
  const createRequest = async (paymentId: string, actorId: string, key: string, automated = false) => {
    let result;
    try { result = await db.run(async tx => {
      const p = (await tx.query<Payment>('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId])).rows[0];
      if (!p || p.payment_type !== 'SALARY' || p.status !== 'PAID' || (!automated && p.employer_id !== actorId)) throw invalid();
      const contract = (await tx.query<{ id: string }>(`SELECT id FROM contracts WHERE id = $1 AND employer_id = $2 AND candidate_id = $3 AND currency = $4
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(payment_schedule) entry WHERE entry->>'id' = $5 AND entry->>'periodKey' = $6
          AND (entry->>'monthNumber')::integer = $7 AND (entry->>'employeeShareAmount')::numeric = $8::numeric AND entry->>'currency' = $4)`,
        [p.contract_id, p.employer_id, p.candidate_id, p.currency, p.schedule_entry_id, p.period_key, p.month_number, p.amount])).rows[0];
      if (!contract) throw invalid();
      const existing = (await tx.query<Proof>('SELECT * FROM salary_confirmations WHERE payment_id = $1', [p.id])).rows[0];
      if (existing) {
        if (existing.request_key !== key && !automated && existing.request_key !== `auto:${p.id}`) throw new ApiError('IDEMPOTENCY_CONFLICT', 'Demande déjà créée.');
        return { paymentId: p.id, contractId: p.contract_id, periodKey: p.period_key, amount: p.amount, currency: p.currency, nonce: existing.nonce, expiresAt: existing.expires_at };
      }
      const otp = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
      const nonce = random(32);
      const hashed = await digest(`${p.id}:${p.contract_id}:${p.candidate_id}:${p.period_key}:${nonce}:${otp}`);
      const row = (await tx.query<Proof>(`INSERT INTO salary_confirmations (payment_id,contract_id,candidate_id,employer_id,period_key,amount,currency,nonce,otp_digest,expires_at,request_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now() + interval '10 minutes',$10) RETURNING *`,
        [p.id,p.contract_id,p.candidate_id,p.employer_id,p.period_key,p.amount,p.currency,nonce,hashed,key])).rows[0];
      const stores = createSqlAutomationStores(tx);
      const eventId = `salary-request:${p.id}`;
      const timestamp = new Date().toISOString();
      await stores.outbox.append({ eventId, eventType: 'SALARY_CONFIRMATION_REQUESTED', aggregateType: 'PAYMENT', aggregateId: p.id, actorId, timestamp, payload: { paymentId: p.id, contractId: p.contract_id, candidateId: p.candidate_id, periodKey: p.period_key }, source: 'SALARY_CONFIRMATION', version: 1 });
      await stores.audit.append({ id: `audit:${eventId}`, eventId, actorId, timestamp, entityId: p.id, action: 'SALARY_CONFIRMATION_REQUESTED', source: 'SALARY_CONFIRMATION', afterState: { contractId: p.contract_id, periodKey: p.period_key } });
      await stores.audit.append({ id: `audit:otp:${p.id}`, actorId, timestamp, entityId: p.id, action: 'OTP_CREATED', source: 'SALARY_CONFIRMATION' });
      // Delivery only after commit is the caller's responsibility; no external channel is installed.
      return { otpForTest: otp, paymentId: p.id, contractId: p.contract_id, periodKey: p.period_key, amount: p.amount, currency: p.currency, nonce, expiresAt: row.expires_at };
    }); } catch (error) {
      if (error instanceof ApiError && error.code === 'IDEMPOTENCY_CONFLICT') {
        await db.run(async tx => createSqlAutomationStores(tx).audit.append({
          id: `audit:request-conflict:${random(16)}`, actorId, timestamp: new Date().toISOString(),
          entityId: paymentId, action: 'SALARY_CONFIRMATION_CONFLICT', source: 'SALARY_CONFIRMATION',
          afterState: { result: 'REJECTED', code: error.code },
        }));
      }
      throw error;
    }
    if ('otpForTest' in result && result.otpForTest && testOtpSink) testOtpSink(result.paymentId, result.otpForTest);
    const { otpForTest: _secret, ...publicResult } = result as typeof result & { otpForTest?: string };
    return publicResult;
  };
  const request: ApiRouteHandler = async ({ actor, command, params, request: http }) => {
    if (!actor || !command) throw invalid();
    const body = await http.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Array.isArray(body) || Object.keys(body).length !== 0) throw new ApiError('VALIDATION_ERROR', 'La demande ne reçoit aucune donnée client.');
    return createRequest(params.paymentId, actor.id, command.idempotencyKey);
  };
  const confirm: ApiRouteHandler = async ({ actor, command, params, request: http }) => {
    if (!actor || !command) throw invalid();
    const body = await http.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.otp !== 'string' || !/^\d{6}$/.test(body.otp) || typeof body.nonce !== 'string') throw new ApiError('VALIDATION_ERROR', 'OTP et nonce requis.');
    try { return await db.run(async tx => {
      const p = (await tx.query<Payment>('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [params.paymentId])).rows[0];
      if (!p || p.payment_type !== 'SALARY' || p.status !== 'PAID' || p.candidate_id !== actor.id) throw invalid();
      const proof = (await tx.query<Proof>('SELECT * FROM salary_confirmations WHERE payment_id = $1 FOR UPDATE', [p.id])).rows[0];
      if (!proof || proof.contract_id !== p.contract_id || proof.candidate_id !== p.candidate_id || proof.employer_id !== p.employer_id || proof.period_key !== p.period_key || Number(proof.amount) !== Number(p.amount) || proof.currency !== p.currency) throw invalid();
      const stores = createSqlAutomationStores(tx);
      const timestamp = new Date().toISOString();
      const audit = async (action: string) => stores.audit.append({ id: `audit:${action}:${random(16)}`, actorId: actor.id, timestamp, entityId: p.id, action, source: 'SALARY_CONFIRMATION', afterState: { contractId: p.contract_id, periodKey: p.period_key } });
      if (proof.confirmed_at) {
        if (proof.confirm_key !== command.idempotencyKey || proof.nonce !== body.nonce || proof.otp_digest !== await digest(`${p.id}:${p.contract_id}:${p.candidate_id}:${p.period_key}:${proof.nonce}:${body.otp}`)) throw new SalaryRejection('SALARY_CONFIRMATION_REPLAY');
        await audit('SALARY_CONFIRMATION_REPLAY');
        return { status: 'SALARY_CONFIRMED', paymentId: p.id, confirmedAt: proof.confirmed_at, eventId: proof.confirmation_event_id };
      }
      if (proof.nonce !== body.nonce) throw new SalaryRejection('SALARY_CONFIRMATION_CONFLICT');
      if (new Date(proof.expires_at).getTime() <= Date.now()) throw new SalaryRejection('OTP_EXPIRED');
      if (proof.otp_digest !== await digest(`${p.id}:${p.contract_id}:${p.candidate_id}:${p.period_key}:${proof.nonce}:${body.otp}`)) throw new SalaryRejection('OTP_REJECTED');
      const eventId = `salary-confirmed:${p.id}`;
      const updated = (await tx.query<Proof>(`UPDATE salary_confirmations SET confirmed_at = now(), confirmed_by = $2, confirmation_event_id = $3, confirm_key = $4 WHERE payment_id = $1 AND confirmed_at IS NULL RETURNING *`, [p.id,actor.id,eventId,command.idempotencyKey])).rows[0];
      if (!updated) throw invalid();
      await stores.outbox.append({ eventId, eventType: 'SALARY_CONFIRMED', aggregateType: 'PAYMENT', aggregateId: p.id, actorId: actor.id, timestamp, payload: { paymentId: p.id, contractId: p.contract_id, periodKey: p.period_key, amount: String(p.amount), currency: p.currency, nonce: proof.nonce }, source: 'SALARY_CONFIRMATION', version: 1 });
      await audit('SALARY_CONFIRMATION_SUCCESS');
      return { status: 'SALARY_CONFIRMED', paymentId: p.id, confirmedAt: updated.confirmed_at, eventId };
    }); } catch (error) {
      // A failed business transaction rolls back; audit independently using the existing ledger.
      if (error instanceof SalaryRejection) {
        await db.run(async tx => createSqlAutomationStores(tx).audit.append({
          id: `audit:${error.action}:${random(16)}`, actorId: actor.id, timestamp: new Date().toISOString(),
          entityId: params.paymentId, action: error.action, source: 'SALARY_CONFIRMATION',
          afterState: { result: 'REJECTED' },
        }));
        throw invalid();
      }
      if (error instanceof ApiError && error.status < 500) {
        await db.run(async tx => createSqlAutomationStores(tx).audit.append({
          id: `audit:refused:${random(16)}`, actorId: actor.id, timestamp: new Date().toISOString(),
          entityId: params.paymentId, action: 'SALARY_CONFIRMATION_REFUSED', source: 'SALARY_CONFIRMATION',
          afterState: { result: 'REJECTED', code: error.code },
        }));
      }
      throw error;
    }
  };
  return { 'payments.salary.confirmation.request': request, 'payments.salary.confirmation.confirm': confirm, createRequest };
}
