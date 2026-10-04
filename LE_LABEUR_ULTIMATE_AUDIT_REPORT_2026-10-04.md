# LE LABEUR — Ultimate Audit Before Cloud Infrastructure

Date: 2026-10-04

## Conclusion

The existing business/repository logic is coherent enough to pass a dedicated 800-scenario execution campaign, but the application is **not yet production-ready for 10,000+ users** without a real backend infrastructure boundary.

The audit did not redesign the application. Corrections were limited to confirmed coherence/security issues in the existing code paths.

## Scope audited

- 19 screens
- 79 important buttons identified in the previous UI inventory
- 54 TS/TSX source files syntax-checked
- navigation/context/repository/service/model relationships
- authentication/session boundaries
- data scoping
- offers/applications/contracts
- payments and J+3
- incidents/replacements
- notifications
- conversations/messages
- calls/WebRTC
- persistence
- concurrency/double actions
- scale-related collection behavior
- geography

## 800 real repository/business scenarios

The special campaign executed against compiled project repository/business code in Node, with an isolated `MockService` instance per scenario.

| Category | Executed | PASS | FAIL |
|---|---:|---:|---:|
| AUTH / SESSION | 100 | 100 | 0 |
| DATA SCOPING | 100 | 100 | 0 |
| CONCURRENCY / DOUBLE ACTION | 100 | 100 | 0 |
| CONTRACTS / OFFERS / APPLICATIONS | 100 | 100 | 0 |
| PAYMENTS / BLOCKING | 100 | 100 | 0 |
| INCIDENTS / REPLACEMENTS | 100 | 100 | 0 |
| NOTIFICATIONS / PERSISTENCE | 100 | 100 | 0 |
| SCALE / COLLECTION BEHAVIOR | 100 | 100 | 0 |
| **TOTAL** | **800** | **800** | **0** |

These are **not browser end-to-end tests**. They validate the business/repository layer only.

## Confirmed corrections

### WebRTC rejection flow

The incoming-call UI previously persisted `REJECTED` in the repository but called the WebRTC service's generic `endCall()` path, which emits `CALL_END`. The UI now sends an explicit `CALL_REJECT` with the canonical call ID and participants.

### WebRTC identity coherence

The repository-created call ID is now reused by the WebRTC service instead of generating a second call ID. The receiver role for incoming calls is taken from the authenticated signaling session rather than a hard-coded role.

### Account security

Blocked accounts are refused at login. Sensitive notification reads are constrained to the current authenticated mock session actor.

### Identifier robustness

New mock IDs use per-instance sequence state plus timestamp/random entropy for high-frequency test and mock activity. Communication event/message/notification identifiers no longer rely only on timestamp/random combinations in the newly audited paths.

### Test isolation

Each `MockService` instance deep-clones its seed collections, preventing one scenario/session from mutating another test's initial state.

## Confirmed production gaps

### 1. J+3 scheduler — CRITICAL

There is no autonomous background scheduler. J+3 logic is evaluated from payment schedule synchronization during contract reads. This means the future production system must have a backend worker/cron/queue that scans due schedules independently of user traffic.

Required production pattern:

`scheduled job → due-date query → idempotent event → notification/outbox → blocking eligibility → audit log`

### 2. Authentication / actor identity — CRITICAL

The mock persists the current user ID locally. Production must derive the authenticated actor on the server and ignore browser-supplied role or actor identifiers for authorization decisions.

### 3. Signaling token — CRITICAL

`VITE_SIGNALING_TOKEN` is read by the browser-side signaling transport. A Vite-exposed value cannot be treated as a long-lived secret. The future Cloudflare signaling path should validate a short-lived server-issued credential and keep the signing secret server-side.

### 4. Pagination / 10k+ readiness — HIGH

There is no cursor/page abstraction in the repository interfaces. `AppContext` loads all offers at initialization, while repositories perform in-memory filtering over full arrays. This can become unacceptable with tens of thousands of offers/messages/notifications.

Production contract to introduce later:

`items + cursor + limit + hasMore` with actor/public scoping applied server-side.

### 5. Persistence / database transactions — HIGH

The mock writes all collections to localStorage. Several business mutations change multiple related entities before final persistence. Production must use database transactions for state transitions and an outbox/event mechanism for notifications.

High-risk compound transitions:

- contract activation + offer FILLED + application state updates + history + notifications;
- payment verification/rejection + schedule + ledger + notifications + audit;
- incident arbitration + contract state + replacement creation;
- replacement transfer + new contract + conversation + notifications;
- block/unblock + account status + payment state + audit + notification.

### 6. Retry idempotency — HIGH

Focused executed checks reproduced duplicate business objects when the same successful command is retried:

- `createOffer` → two offers;
- `sendMessage` → two messages;
- `sendProposal` → two proposals.

This is a confirmed gap in the current repository API. It should be solved at the future API boundary with a client-generated idempotency key and a uniqueness constraint/command record.

The payment/signature/blocking flows already reject many duplicate state transitions by state guard.

### 7. Broad reads — HIGH

`getAllOffers`, profile access, notification access, audit metrics and other collection methods need explicit production scoping contracts. Public data can remain public, but production endpoints must not transfer entire collections to the browser and rely on client-side filtering.

## Payment and blocking state

Payment is correctly modeled as an off-platform declaration/verification workflow. The current logic supports due-date validation, rejection back to a regulatable state, J+3 notification, blocking and regularization while blocked.

The 800-scenario campaign passed payment, blocking and unblock paths.

## Incidents / replacement

The complete repository chain was executed successfully:

`ACTIVE → INCIDENT → ADMIN → CONTINUER / ANNULER / REMPLACER → REPLACEMENT → APPLICATION → SELECT → TRANSFER → NEW CONTRACT`

The final replacement contract retains:

- incidentId
- replacementId
- replacedContractId
- applicationId
- offerId
- employerId
- employeeId

## Geography

Current ZIP coverage:

- 12/12 departments
- 77/77 communes
- 24/546 arrondissements
- 94/5,295 villages/quartiers

The missing geographic data was not invented.

## Build / lint / browser

`npm install --ignore-scripts --no-audit --no-fund --prefer-offline` was attempted and timed out after 300 seconds. Therefore:

- `npm run lint`: NOT CERTIFIED
- `npm run build`: NOT CERTIFIED
- browser smoke test: NOT EXECUTED

A full 54/54 TS/TSX parse check passed, but this is not a replacement for the project's official build/lint.

## Final risk classification

### CRITICAL
- backend-authenticated identity/authorization boundary;
- autonomous J+3 scheduler;
- browser-exposed signaling token.

### HIGH
- no pagination/cursor model;
- whole-collection localStorage persistence;
- missing database transactions/outbox;
- retry idempotency for offer/message/proposal creation;
- broad/unscoped production API boundaries.

### MEDIUM
- incomplete geography;
- unavailable npm dependency environment;
- no browser smoke validation.

## Final status

The existing application logic is significantly more coherent and secure after this audit, and the repository/business layer passed 800/800 dedicated scenarios.

It should **not** be represented as production-ready for 10,000+ users until the infrastructure layer addresses the critical/high findings above.

---

# STABILIZATION ADDENDUM — 2026-10-04

## Scope

This execution phase continued from the canonical audit without redesigning the application or redoing the general audit.

## Changes

- Added `src/backend/productionContracts.ts` to formalize the future production boundary:
  - server-derived actor identity;
  - cursor pagination;
  - idempotency records/keys;
  - transaction boundary;
  - outbox events;
  - autonomous J+3 worker boundary.
- Added `docs/PRODUCTION_BACKEND_BOUNDARY.md` with the exact integration points and the production constraints.
- Updated `LE_LABEUR_CONTINUITY_CHECKPOINT.md`.

No existing business flow or UI design was intentionally changed.

## Execution truth

- Rollback ZIP created before modification: PASS.
- `npm install --ignore-scripts --no-audit --no-fund --prefer-offline`: EXECUTED, timed out after 300 seconds.
- Official `npm run lint`: NOT EXECUTED because dependencies were unavailable.
- Official `npm run build`: NOT EXECUTED because dependencies were unavailable.
- Browser smoke test: NOT EXECUTED because the Vite dependency graph was unavailable.
- Isolated repository/business transpilation and runtime deterministic suite: executed. 82 deterministic checks ran; 70 passed and 12 failed because the existing deterministic suite still invokes actor-sensitive read methods without actor context. These failures were reported rather than hidden.
- Geography remains 12/12 departments, 77/77 communes, 24/546 arrondissements and 94/5,295 localities.
- WebRTC static verification reconfirmed canonical call ID, explicit `CALL_REJECT`, real WebRTC connection-state handling and `WebSocket.OPEN` guarding.

## Geography source verification

Official sources checked during this phase confirm the national targets of 12 departments, 77 communes, 546 arrondissements and 5,295 villages/quartiers. The detailed official locality files were not retrievable in the execution environment, so no missing locality names were invented or inserted.

## Current verdict

The application remains a robust mock/business-layer prototype, not production-ready for 10,000+ users. The critical/high infrastructure findings remain intentionally open until the real backend boundary is implemented and tested.
