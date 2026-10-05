# 1 — Inventaire métier et preuves

| Objet métier | Nom technique / états réellement déclarés | Preuve | Persistance / transitions observées | Tests |
|---|---|---|---|---|
| Compte | `UserProfile`; `UserRole=CANDIDATE|EMPLOYER|ADMIN`; `AccountStatus=ACTIVE|BLOCKED` | `src/types/index.ts`, `src/repositories/mockRepository.ts` | mock state; `requireActor`, `blockUser`, `unblockUser`, `assertOperationalActor` | identity, foundation, businessRules |
| Offre | `Offer`; `ACTIVE|FILLED|CANCELLED|PAUSED` | `src/types/index.ts`, `interfaces.ts` | MockRepository; create/update status; filled logic during contract path | `qaMassive`, finalStabilization |
| Candidature | `Application`; `PENDING|REVIEW|SHORTLISTED|REJECTED|WITHDRAWN|HIRED|CONTRACTED|CLOSED_OFFER_FILLED` | types, migration 0003 | apply/examine/shortlist/reject/withdraw | `qaMassive` |
| Proposition | `MissionProposal`; `DRAFT|SENT|REVISION_REQUESTED|ACCEPTED|DECLINED|EXPIRED` | types/interfaces | conversation repository methods | static; no dedicated exhaustive suite found |
| Contrat | `Contract`; ten statuses incl. `SIGNATURE`, `ACTIVE`, `TERMINATED`, `REPLACED` | types, migration 0003 | generate/sign/monthly actions/advance/dissociate; mock state | finalStabilization, businessRules |
| Paiement / commission | `PaymentDeclaration`, `CommissionPaymentRecord`, `PaymentScheduleEntry`; declaration statuses and schedule statuses | types, payment repositories, `businessRules.ts` | mock arrays; API route catalog; admin review methods | payment declaration/admin tests |
| Incident | `Incident`; `OPEN|UNDER_REVIEW|WAITING_*|RESOLVED|TERMINATED|REPLACEMENT_*|CLOSED` | types/interfaces | report/arbitrate in mock | qaMassive/static |
| Remplacement | `ReplacementDossier` | types/interfaces, admin tabs | assign/transfer/finalize repository methods | admin replacement tests not found in inspected tree |
| Conversation/message | `Conversation`, `ChatMessage`; contexts `OFFER|APPLICATION|PROPOSAL|CONTRACT|INCIDENT|REPLACEMENT` | types/interfaces | mock arrays, participant checks, idempotency | repository/session tests |
| Notification | `AppNotification`, 30+ `NotificationType` values | types, mock repository, outbox | mock notification array; API read routes | no complete event coverage found |
| Appel | `CallRecord`; `IDLE|CALLING|RINGING|ACCEPTING|CONNECTING|CONNECTED|REJECTED|MISSED|ENDED|FAILED` | types, CallService, route contracts | mock/service and server boundary | signaling credential tests |
| Document / justificatif | `ResourceDocument`; `ACTIVE|ARCHIVED`; payment proof fields | types, resources, payment input | resources are catalog; proof URI in declarations | no document authorization suite found |
| Géographie | location IDs on profiles/offers plus `src/data/beninLocations.ts` | types, migration 0003 | structured fields present; search/filter paths require targeted runtime confirmation | no dedicated geography test found |
| Audit/outbox | `SystemAuditLog`, outbox event contracts | types, `services/outbox.ts`, route contracts | mock logs and declared server boundary | foundation tests |

## Limites de preuve

`src/backend/api/routeContracts.ts` est explicitement un catalogue : `worker.ts` indique que la Phase 1 retourne `NOT_IMPLEMENTED` tant qu'un handler persistant n'est pas installé. `src/backend/services/scheduler.ts` décrit un futur worker J+3 et ne lance ni timer ni émission d'événement. Les unions TypeScript seules ne sont donc pas comptées comme transitions opérationnelles.
