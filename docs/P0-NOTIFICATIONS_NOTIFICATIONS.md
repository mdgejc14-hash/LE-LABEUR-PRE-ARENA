# P0-NOTIFICATIONS — couche de notification

Chaîne livrée, **sans aucun nouveau moteur** :

```
ÉVÉNEMENT MÉTIER
      ↓
OUTBOX / AUTOMATION EXISTANTES (automation_outbox, claim FOR UPDATE SKIP LOCKED,
AutomationEngine, jobs, deadlines, idempotence durable, ledger d'audit)
      ↓
NOTIFICATION (table `notifications`, clé unique (recipient_id, dedupe_key))
      ↓
IN-APP  →  PUSH  →  EMAIL          (ordre de canal imposé)
```

Le canal **In-App** est réellement persisté. **Push** et **Email** ne sont que des
**ports** (`src/backend/notifications/channels.ts`) : aucun fournisseur réel,
aucun secret, aucune table de canal externe, aucune configuration de production.
Sans provider injecté, l'état enregistré est `NOT_AVAILABLE` — jamais un faux
« envoyé ».

---

## 1. Audit effectué avant codage

| Composant | Fichier | Ce qui existait déjà |
| --- | --- | --- |
| NotificationEvent | `src/backend/automation/foundation.ts` | modèle déclaré (`NOTIFICATION_CREATED/REQUIRED/SENT/FAILED`), jamais persisté |
| DomainEvent / Outbox | `foundation.ts`, `services/outbox.ts`, migration `0006` | Outbox transactionnelle réelle, catalogue de contrats d'effets |
| Queue | `sqlAutomationStores.claimDue` | claim verrouillé, `attempts`, `available_at`, retry, dead-letter |
| AutomationEngine | `foundation.ts` + `automation/worker.ts` | registre/handlers, worker explicitement déclenché |
| AuditLedger | `automation_audit_ledger` | ledger append-only déjà utilisé par P0-AUTO-2/P0-PAY-1/P0-DISPUTE-1 |
| User / Employeur / Candidat | migration `0001`, `identity/stores.ts` | `users(id, role, status, email, display_name)` |
| Événements réellement émis | voir tableau §2 | CONTRACT_ACTIVATED, paiements, salaire, claims, rappels |
| Capacités de canal | **aucune** | ni Push, ni Email, ni SMS, ni WhatsApp, ni table de notification |

Conclusion d'audit : l'infrastructure Outbox → Queue → Worker → Engine existait
entièrement ; **seule manquait la projection en notification**. Aucun moteur
n'a été créé : le worker accepte désormais une **liste de processeurs
supplémentaires** et route chaque événement vers **tous** ceux qui déclarent son
type, puis vers l'`AutomationEngine`. Un événement n'est donc jamais « volé » à
son consommateur historique (`CLAIM_CREATED` reste traité par le Claim **et** est
notifié, dans la même passe et sous le même claim).

## 2. Couverture des événements (résultat d'audit)

Source de vérité exécutable : `NOTIFICATION_EVENT_COVERAGE`
(`src/domain/notificationCatalog.ts`). Un test vérifie que la liste **typée**
consommée (`NOTIFICATION_AUTOMATION_EVENT_TYPES`) est **exactement** la liste
`MAPPED` — aucune règle ne peut exister sans être déclarée, ni l'inverse.

### Couverts (`MAPPED`, 32 événements)

| Événement réel | Nom demandé | Notification | Destinataires | Producteur |
| --- | --- | --- | --- | --- |
| `APPLICATION_SUBMITTED` | — | `NEW_APPLICATION` | employeur propriétaire | à venir |
| `APPLICATION_SHORTLISTED` | APPLICATION_DECISION | `APPLICATION_SHORTLISTED` | candidat | à venir |
| `APPLICATION_REJECTED` | APPLICATION_DECISION | `APPLICATION_REJECTED` | candidat | à venir |
| `APPLICATION_WITHDRAWN` | — | `APPLICATION_WITHDRAWN` | employeur | à venir |
| `PROPOSAL_SENT` | — | `PROPOSAL_RECEIVED` | candidat | à venir |
| `PROPOSAL_ACCEPTED` | — | `PROPOSAL_ACCEPTED` | employeur | à venir |
| `PROPOSAL_DECLINED` | — | `PROPOSAL_DECLINED` | employeur | à venir |
| `CONTRACT_SENT` | — | `CONTRACT_PENDING_SIGNATURE` | travailleur | à venir |
| `CONTRACT_SIGNED` | — | `CONTRACT_SIGNED` | l'AUTRE partie (`payload.party`) | à venir |
| `CONTRACT_ACTIVATED` | — | `CONTRACT_ACTIVE` | employeur **et** travailleur | `contractRepository` |
| `CONTRACT_TERMINATED` | — | `CONTRACT_ACTIVE` | l'autre partie (convention DEMO) | à venir |
| `CLAIM_CREATED` | CLAIM_OPENED | `INCIDENT_REPORTED` | parties + ADMIN | `claimRepository` |
| `CLAIM_EVIDENCE_REQUESTED` | — | `INCIDENT_REPORTED` | parties | `claimRepository`/`claimAutomation` |
| `CLAIM_EVIDENCE_SUBMITTED` | CLAIM_UPDATED | `INCIDENT_REPORTED` | parties | `claimRepository` |
| `CLAIM_DEADLINE_REACHED` | CLAIM_UPDATED | `INCIDENT_REPORTED` | parties + ADMIN | `claimAutomation` |
| `CLAIM_ESCALATED` | CLAIM_UPDATED | `INCIDENT_REPORTED` | parties + ADMIN | `claimRepository`/`claimAutomation` |
| `CLAIM_RESTRICTION_APPLIED` | CLAIM_UPDATED | `INCIDENT_REPORTED` | parties | `claimRepository` |
| `CLAIM_RESTRICTION_RELEASED` | CLAIM_UPDATED | `INCIDENT_REPORTED` | parties | `claimRepository` |
| `CLAIM_RESOLVED` | CLAIM_RESOLVED | `INCIDENT_DECIDED` | parties + ADMIN | `claimRepository`/`claimAutomation` |
| `CLAIM_REJECTED` | CLAIM_RESOLVED | `INCIDENT_DECIDED` | parties + ADMIN | `claimRepository` |
| `PAYMENT_DUE` | — | `MONTHLY_CHECKPOINT` / `COMMISSION_DUE` | employeur | `paymentRepository` |
| `PAYMENT_DECLARED` | — | `SALARY_DECLARED` / `COMMISSION_DECLARED` | travailleur / ADMIN | `paymentRepository` |
| `PAYMENT_PENDING_VERIFICATION` | — | **alias** de `PAYMENT_DECLARED` (même clé) | idem | `paymentRepository` |
| `PAYMENT_APPROVED` | PAYMENT_VERIFIED | `COMMISSION_VERIFIED` (commission) | employeur | `paymentRepository` |
| `PAYMENT_VERIFIED` | PAYMENT_VERIFIED | **alias** de `PAYMENT_APPROVED` | idem | à venir |
| `PAYMENT_PAID` | — | `SALARY_DECLARED` (confirmation attendue) | travailleur | `paymentRepository` |
| `PAYMENT_REJECTED` | — | `COMMISSION_REJECTED` (commission) | employeur | `paymentRepository` |
| `PAYMENT_OVERDUE_J3` | — | `PAYMENT_OVERDUE_J3` | `payload.recipientKinds` (`EMPLOYER`,`ADMIN`) | `contractActivation` |
| `NOTIFICATION_REQUIRED` | — | `payload.notificationType` (`MONTHLY_CHECKPOINT`/`COMMISSION_DUE`) | `payload.recipientKinds` | `contractActivation` |
| `SALARY_CONFIRMATION_REQUESTED` | SALARY_CONFIRMATION | `SALARY_DECLARED` | travailleur | `salaryConfirmation` |
| `SALARY_CONFIRMED` | SALARY_CONFIRMATION | `SALARY_CONFIRMED` | employeur | `salaryConfirmation` |

### Non couverts (`UNMAPPED`) — décision explicite, jamais un oubli

| Événement | Raison |
| --- | --- |
| `APPLICATION_EXAMINED` | effet documenté = rafraîchir la vue employeur ; aucun `NotificationType` |
| `PROPOSAL_EXPIRED` | aucun `NotificationType` d'expiration dans le modèle |
| `CONTRACT_CREATED` | le contrat d'événement déclare « aucune notification » |
| `CONTRACT_ENDED` (= `CONTRACT_COMPLETED` demandé) | aucun type de fin de mission, et le DEMO n'en produit aucun |
| `EXECUTION_CONFIRMED` | **nom réel du dépôt**, mais il n'existe que comme entrée d'**historique** de contrat : aucun événement d'Outbox, donc aucun déclencheur sans créer un producteur hors tranche |
| `REPLACEMENT_CREATED`, `CANDIDATE_TRANSFERRED` | événements déclarés **sans producteur ni entité persistée** : aucun rattachement vérifiable au destinataire |
| `INCIDENT_OPENED`, `INCIDENT_DECIDED` | supplantés par `CLAIM_*` : un producteur créerait un doublon |
| `ACCOUNT_BLOCKED`, `ACCOUNT_UNBLOCKED` | aucun producteur d'Outbox (domaine non ouvert) |
| `PAYMENT_RECONCILIATION_BATCH_REQUESTED` | événement d'exploitation interne, sans partie métier destinataire |
| `PAYMENT_SUBMITTED` | alias documenté de `PAYMENT_DECLARED`, déjà couvert |

## 3. Idempotence

* Clé persistée : `(recipient_id, dedupe_key)`, **index unique PostgreSQL** —
  c'est la contrainte qui tranche deux créations concurrentes, jamais un verrou
  applicatif.
* La clé logique est construite à partir de l'**agrégat** et du **fait** (ex.
  `payment:<paymentId>:DECLARED`), jamais de l'identifiant d'événement : un
  rejeu, un retry de worker ou un **alias d'événement** produisent le même
  résultat.
* Les commandes de lecture utilisent l'**idempotence durable existante**
  (`automation_idempotency`) : un rejeu renvoie le résultat mémorisé et n'écrit
  **qu'une** entrée d'audit.
* Vérifié par les tests : premier événement, rejeu exact, rejeu avec identifiant
  d'événement neuf, deux traitements simultanés, deux workers concurrents,
  retry après échec infrastructurel réel (table absente → `RETRYABLE` →
  rétablissement → reprise sans doublon).

## 4. Destinataires et autorisation

* Résolution depuis l'**agrégat persisté** : le contrat est la source des
  parties (`employer_id`, `candidate_id`) ; un `employerId` usurpé dans la charge
  utile ne détourne **aucune** notification.
* Chaque destinataire est vérifié en base : compte existant **et** rôle attendu.
* Les ADMIN ne sont ciblés que si l'agrégat est un dossier **persisté**, et la
  sélection est bornée (`MAX_ADMIN_RECIPIENTS`). Aucun sélecteur « tous les
  utilisateurs » n'existe : la diffusion globale est structurellement impossible.
* Un compte non `ACTIVE` n'agit pas et ne reçoit rien.
* Lecture strictement propriétaire : un tiers obtient **404** (aucune fuite
  d'existence) et ne voit rien dans sa propre liste.

## 5. Fichiers

**Créés** — `migrations/0012_notifications.sql` ; `src/domain/notificationCatalog.ts` ;
`src/backend/notifications/{records,channels,notificationService,notificationAutomation,notificationApi,notifications.test}.ts` ;
`src/backend/persistence/sqlNotificationStores.ts` ; ce document.

**Modifiés** — `automation/worker.ts` (liste de processeurs supplémentaires,
routage vers tous les déclarants + moteur) ; `api/entry.ts` (composition) ;
`persistence/migrationManifest.ts` ; `services/outbox.ts` (effets documentés) ;
`automation/contractActivation.ts` (commentaire du catalogue préparé) ;
`identity/ids.ts` (préfixe `ntf`) ; `api/offers.test.ts` (harnais) ;
`scripts/run-tests.ts` ; et les garde-fous de périmètre devenus obsolètes
(`contracts.test.ts`, `postContract.test.ts`, `payments.test.ts`,
`contractActivation.test.ts`, `health.test.ts`, `cloudflareEntry.test.ts`,
`verify-postgres-e2e.ts`, `verify-workerd-local.ts`) — chacun **conservé et
renforcé** sur son intention réelle (aucun canal externe, aucun fournisseur,
aucune donnée inventée), avec une assertion positive nouvelle sur la boîte In-App.

## 6. Exclu de cette tranche (assumé)

Cron/Queue de production, fournisseur Push réel, fournisseur Email réel,
Cloudflare de production, WebRTC, R2/KYC, remplacement avancé, matching,
réputation, sécurité finale globale, tests de charge, UI/design final, nouveau
moteur d'automatisation, nouveau système de paiement, escrow/cantonnement,
détention de fonds, Mobile Money réel, producteurs d'événements pour les cycles
CANDIDATURE / PROPOSITION / CONTRAT (hors `CONTRACT_ACTIVATED`) et REMPLACEMENT.

## 7. Points ouverts

1. Les producteurs d'événements `APPLICATION_*`, `PROPOSAL_*`, `CONTRACT_*`
   (hors ACTIVATED) appartiennent aux tranches qui ouvriront ces effets
   asynchrones : les règles de notification sont déjà écrites et testées.
2. `EXECUTION_CONFIRMED` et `CONTRACT_ENDED` nécessitent une décision de
   modèle (événement d'Outbox et `NotificationType`) avant toute notification.
3. La livraison Push/Email réelle (jetons d'appareil, adresses, secrets,
   reprise dédiée) appartient au chantier d'infrastructure de production : les
   ports sont prêts, la reprise reste à brancher sur un worker de canal.
4. Les notifications d'un compte **supprimé** ne sont pas supprimées en cascade
   (FK `RESTRICT`, comme les Claims) : la politique de suppression de compte
   reste à décider.
