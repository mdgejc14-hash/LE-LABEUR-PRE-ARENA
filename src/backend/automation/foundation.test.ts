import { strict as assert } from 'node:assert';
import { AutomationEngine, AutomationRegistry, InMemoryQueue, createDomainEvent, deserializeDomainEvent, serializeDomainEvent } from './foundation';

const event = createDomainEvent({ eventType: 'APPLICATION_SUBMITTED', aggregateType: 'Application', aggregateId: 'a1', payload: { candidateId: 'c1' }, source: 'test' });
assert.equal(deserializeDomainEvent(serializeDomainEvent(event)).eventId, event.eventId);
const queue = new InMemoryQueue<string>();
const run = async () => { const msg = await queue.enqueue('x'); assert.equal((await queue.claim(1)).length, 1); await queue.acknowledge(msg.id); assert.equal((await queue.claim(1)).length, 0); };
const registry = new AutomationRegistry(); let calls = 0; registry.register('APPLICATION_SUBMITTED', async () => { calls++; });
const engine = new AutomationEngine(registry);
const main = async () => { await run(); assert.equal(await engine.execute(event), 'completed'); assert.equal(await engine.execute(event), 'duplicate'); assert.equal(calls, 1); };
void main();
