import { strict as assert } from 'node:assert';
import {
  AutomationEngine,
  AutomationRegistry,
  InMemoryQueue,
  createDomainEvent,
  deserializeDomainEvent,
  serializeDomainEvent,
} from './foundation';

export interface AutomationFoundationTestResult {
  name: string;
  success: boolean;
  detail: string;
}

export async function runAutomationFoundationContractTests(): Promise<AutomationFoundationTestResult[]> {
  const results: AutomationFoundationTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  const event = createDomainEvent({
    eventType: 'APPLICATION_SUBMITTED',
    aggregateType: 'Application',
    aggregateId: 'application-contract-test',
    payload: { candidateId: 'candidate-contract-test' },
    source: 'foundation.test',
  });

  await check('Automation foundation: DomainEvent serialization round-trip', () => {
    assert.equal(deserializeDomainEvent(serializeDomainEvent(event)).eventId, event.eventId);
  });

  await check('Queue mémoire: enqueue, exclusive claim, retry, acknowledge', async () => {
    const queue = new InMemoryQueue<string>();
    const start = new Date('2026-10-06T00:00:00.000Z');
    const retryAt = new Date(start.getTime() + 1000);
    const message = await queue.enqueue('payload', start, 'queue-contract-test');
    assert.equal((await queue.claim(1, start)).length, 1);
    assert.equal((await queue.claim(1, start)).length, 0, 'un message déjà claimé n’est pas repris simultanément');
    await queue.retry(message.id, 'temporary failure', retryAt);
    assert.equal((await queue.claim(1, new Date(retryAt.getTime() - 1))).length, 0);
    const retried = await queue.claim(1, retryAt);
    assert.equal(retried.length, 1);
    assert.equal(retried[0]?.attempts, 2);
    await queue.acknowledge(message.id);
    assert.equal((await queue.claim(1, retryAt)).length, 0);
  });

  await check('AutomationEngine: handler success and event replay are idempotent', async () => {
    const registry = new AutomationRegistry();
    let calls = 0;
    registry.register('APPLICATION_SUBMITTED', async () => { calls += 1; });
    const engine = new AutomationEngine(registry);
    assert.equal(await engine.execute(event), 'completed');
    assert.equal(await engine.execute(event), 'duplicate');
    assert.equal(calls, 1);
  });

  await check('AutomationEngine: handler failure is propagated and a later retry can succeed', async () => {
    const registry = new AutomationRegistry();
    let calls = 0;
    registry.register('APPLICATION_EXAMINED', async () => {
      calls += 1;
      if (calls === 1) throw new Error('expected handler failure');
    });
    const engine = new AutomationEngine(registry);
    const retryEvent = createDomainEvent({
      eventType: 'APPLICATION_EXAMINED',
      aggregateType: 'Application',
      aggregateId: 'application-retry-test',
      payload: { applicationId: 'application-retry-test' },
      source: 'foundation.test',
    });
    await assert.rejects(engine.execute(retryEvent), /expected handler failure/);
    assert.equal(await engine.execute(retryEvent), 'completed');
    assert.equal(calls, 2);
  });

  return results;
}
