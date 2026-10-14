# P0-R2 — DOCUMENTS & PREUVES (stockage, versionnement, rattachement, accès contrôlé)

## 1. Objet et périmètre

Cette tranche livre la brique **documents & preuves** de LE LABEUR : stocker,
versionner, rattacher et récupérer de manière contrôlée les documents et justificatifs
liés aux objets métier (contrats, versions de contrat, preuves d'acceptation,
justificatifs de mission, preuves d'exécution, pièces de litige, attestations).

**Hors tranche** (explicitement non livré) :

- tout chantier KYC / parcours d'identité supplémentaire ;
- tout déploiement ou configuration Cloudflare de production (aucun binding R2 dans
  `wrangler.toml`, aucun secret provisionné) ;
- toute présignature d'URL directe R2 (renvoyée en `501 NOT IMPLEMENTED` explicite) ;
- toute définition de durée de rétention : les politiques sont semées par type de
  document avec `retention_days = NULL` (statut `PENDING_LEGAL_VALIDATION`) afin de ne
  rien inventer avant validation juridique ;
- toute modification de P0-REPUTATION, P0-MATCHING, P0-NOTIFICATIONS ou du modèle de
  prix (Prix Prestataire + Frais SaaS LE LABEUR = Coût Client — inchangé).

## 2. Architecture en couches

```
APPLICATION  (handlers HTTP /api/v1/documents...)
      │            ▲  DTO sans object_key ni secret interne
      ▼            │
DOCUMENT METADATA  — OpenDocumentRepository (src/backend/documents/documentRepository.ts)
      │              règles pures : src/domain/documentRules.ts (matrice type ↔ finalité ↔ entité)
      ▼
OBJECT STORAGE     — port ObjectStorage (src/backend/services/documents.ts)
                     adapter mémoire testable + adapter R2 structurel
                     (src/backend/documents/storage.ts)
      ▼
HASH               — SHA-256 (WebCrypto) + empreintes d'idempotence HMAC
                     + signatures d'URL (src/backend/documents/hash.ts)
      ▼
VERSION            — document_versions : numérotation séquentielle sous verrou document,
                     contenu immutable (CAS PENDING_UPLOAD → ACTIVE), append-only
      ▼
AUDIT              — audit trail existant (« audit existant », aucune nouvelle table
                     d'audit) : action détaillée + request/trace + acteur + payload JSON
      ▼
ACCÈS CONTRÔLÉ     — ownership strict ; participants via liens attachés à des entités
                     réelles ; permission RBAC documents:read:any ; révocation
                     incidents:arbitrate ; URLs signées HMAC horodatées
```

Principe de séparation : la **métadonnée** (document), l'**objet physique**
(clé d'objet dans le bucket), la **version** (contenu + empreinte) et la
**relation** (lien version ↔ entité métier) sont quatre tables distinctes.

## 3. Modèle de données (migration `0016_documents.sql`)

### 3.1 `documents`
`document_id` (PK), `owner_user_id` (FK users, ON DELETE RESTRICT), `title`,
`file_name`, `document_type`, `purpose_note` (obligatoire pour `VERIFICATION`),
`status` (`ACTIVE` / `REVOKED`), `current_version_number`, `retention_class`,
`history` (jsonb, append-only par opération `$set`), `created_at`, `created_by`.
Complétude CHECK : tout document `VERIFICATION` exige une `purpose_note` non vide.

### 3.2 `document_versions`
`version_id` (PK), `document_id` (FK), `version_number` (UNIQUE par document),
`object_key` (format `docs/<doc>/<ver>` contrôlé par CHECK, jamais exposé),
`declared_size_bytes` + `size_bytes` (≤ 25 Mio), `cryptographic_hash`
(64 hex = SHA-256), `hash_algorithm`, `provenance` (`USER_UPLOAD` uniquement),
`status` (`PENDING_UPLOAD` / `ACTIVE` / `REVOKED`), `registered_*`,
`revoked_at/by/reason` (motif obligatoire à la révocation), `retain_until`.
Le contenu est **immutable** : aucune colonne de contenu n'est modifiable après
`ACTIVE` ; toute modification crée une nouvelle version.

### 3.3 `document_entity_links`
`link_id` (PK), FK composite `(document_version_id, document_id)` vers les versions,
`entity_type` ∈ {CONTRACT, CONTRACT_VERSION, MISSION, EXECUTION, WORKFLOW,
TRACEABILITY_ATTESTATION, USER}, `entity_id`, `link_purpose`,
`related_actor_id` (signataire), `accepted_at` (toujours dérivé serveur d'une
signature réelle — jamais renseigné par le client), `note`, `created_*`.
Deux index d'unicité partiels :
- liens non-acceptation : un seul lien (version, entité, finalité) ;
- liens d'acceptation : un seul lien par **signataire** (employeur **et**
  candidat peuvent donc chacun attester la même version).

### 3.4 `document_retention_policies`
8 lignes semées (une par type de document), `retention_days = NULL`,
`status = PENDING_LEGAL_VALIDATION`, trigger `updated_at`. Aucune durée globale
inventée ; COMMERCIAL = « jusqu'à révocation/règles applicables ».

## 4. Adapter de stockage

- **Port (`ObjectStorage`)** : `put(key, bytes, contentType)`, `get → {bytes, contentType, size} | null`,
  `head → {size, contentType} | null`, `delete(key)` ; `createSignedDownloadUrl` optionnelle.
- **Adapter mémoire** (`createInMemoryObjectStorage`) : Map de blobs, hook de test
  `dangerouslyReplaceForIntegrityTest` (simule une altération de l'objet stocké).
- **Adapter R2 structurel** (`createR2BucketObjectStorage`) : accepte tout binding de
  type `R2Bucket` (put/get/head/delete) par typage structurel ; `createSignedDownloadUrl`
  renvoie une erreur explicite « CLOUDFLARE PRODUCTION (R2) — hors tranche » ; les
  handlers la traduisent en `501`.
- Aucun `r2_buckets` dans `wrangler.toml` : le binding est injecté par composition
  (`env.DOCUMENTS_BUCKET`) ; en son absence, toutes les routes documents répondent `501`
  (fail-closed).

## 5. Versionnement, hash, immutabilité

- Numérotation déterministe : `next_version_number` calcule `max+1` **sous verrou de ligne
  du document** (`findByIdForUpdate`) → concurrence sérialisée, octets sauvegardés en retrait nettoyés.
- Enregistrement du contenu : `registerContent` est un CAS `PENDING_UPLOAD → ACTIVE` —
  un deuxième octet différent est refusé `409 IMMUTABLE_CONTENT` ; le **rejeu exact**
  (mêmes octets, même taille) renvoie `200 + replayed: true`.
- Empreinte SHA-256 calculée par l'application sur les octets reçus ; taille réelle et
  type déclaré imposés à l'octet près.
- `POST /versions/:versionId/verify` : relecture de l'objet, recompute SHA-256,
  `{match}` — contexte `TECHNICAL_INTEGRITY`. Toute incohérence bloque aussi le
  téléchargement (`409 INTEGRITY_MISMATCH`).
- Append-only : rien n'est écrasé ni supprimé en base ; la révocation est un nouveau
  fait daté et motivé (statut + historique + audit), et retire les octets du blob
  tout en préservant les références et métadonnées.

## 6. Contrôle d'accès

- **Ownership strict** : l'employeur/propriétaire gère ses documents (création, upload,
  versions, liens, URL signée, téléchargement).
- **Participants** : accès en lecture (métadonnées + contenu) uniquement si un lien
  rattache la version à une entité dont l'acteur est partie (contrat : employer ou
  candidat). Les documents `VERIFICATION` n'ouvrent **jamais** l'accès aux participants.
- **RBAC admin** : lecture dépendante de la permission **existante** `documents:read:any`
  (union rôle + grants utilisateur) ; révocation dépendante de `incidents:arbitrate`.
  Permission retirée → `403` ; grant individuel → accès.
- **Anti-IDOR** : aucune clé d'objet n'est jamais acceptée ni exposée par l'API
  (DTO sans `object_key`) ; connaître l'identifiant d'un document n'ouvre rien sans
  propriété/lien/permission. 404 uniformes pour l'inexistant.
- **URL signée** : HMAC-SHA-256 (`exp`, `documentId`, `versionId`, `actorId`, `scope`)
  à durée de vie courte ; altération ou expiration → refus ; secret absent → `501`
  explicite. Le téléchargement authentifié classique reste disponible sans secret.

## 7. Règles métier (matrice `src/domain/documentRules.ts`)

| Type de document              | Finalités de lien autorisées                    | Entités autorisées             |
|------------------------------|-------------------------------------------------|--------------------------------|
| CONTRACT_DOCUMENT            | CONTRACT_VERSION, SUPPORTING                    | CONTRACT, CONTRACT_VERSION     |
| ACCEPTANCE_PROOF             | ACCEPTANCE_PROOF                                | CONTRACT                       |
| MISSION_JUSTIFICATIVE        | MISSION_SUPPORT, EXECUTION_PROOF                | MISSION, EXECUTION             |
| EXECUTION_PROOF              | EXECUTION_PROOF                                 | EXECUTION                      |
| WORKFLOW_PIECE               | WORKFLOW_ATTACHMENT                             | WORKFLOW                       |
| TRACEABILITY_ATTESTATION     | ATTESTATION                                     | TRACEABILITY_ATTESTATION ou aucun lien |
| VERIFICATION                 | VERIFICATION                                    | USER (sujet = propriétaire)    |
| IDENTITY_DOCUMENT            | (non exposé à la création — chantier KYC hors tranche) | —                      |

Règles supplémentaires : l'acceptation exige un signataire **réel** du contrat
(`contracts.employer_signed_at` / `employee_signed_at`, peuplés par le chantier OTP
existant) ; `accepted_at` est dérivé serveur à sa valeur exacte ; l'attestation
n'empêche pas le libellé « Attestation électronique de traçabilité » — aucune
formulation « irréfutable / inaltérable / certifiée / horodatage qualifié »
(catalogue de garde-fous, vérifié par test sur les sources de la brique).

## 8. Audit

Toutes les mutations (création, upload, liens, URL signée, révocations, téléchargements
admis) écrivent dans le journal d'audit existant : action `document.*` / domaine
`P0-R2-DOCUMENTS` / acteur / request-trace / payload JSON. Les entrées
`request_id` égales et `traceparent` permettent le suivi de bout en bout.

## 9. Intégration contrats / preuves

- Lien document ↔ contrat : `entityPartyIds` lit `contracts.employer_id` /
  `candidate_id` via le lecteur d'accès (aucune modification du chantier contrats).
- Lien acceptation ↔ signature : `contractSignatureAt` valide le fait signé réel.
- Notifications : aucune (la brique ne touche pas P0-NOTIFICATIONS).
- Réputation / matching / remplacements / paie : non modifiés — vérifiés par les tests
  de non-régression qui composent le même worker.

## 10. Tests ajoutés

Suite `P0-R2 — DOCUMENTS & PREUVES` (`src/backend/api/documents.test.ts`, 33 cas) :
adaptateur local & R2 structurel ; signature HMAC ; garde-fous libellés / finance /
imports exclus ; matrice pure exhaustive ; migration + manifeste + rétention ;
upload & métadonnées ; validation (type/taille/mime/finalités) ; empreinte &
taille réelle ; conformité type/taille déclarés ; versionnement v2 sans écraser v1,
immutabilité, rejeu idempotent, récupération exacte ; ownership strict & anti-IDOR ;
inexistant (document/version/objet) ; liens contrat & entité réelle & partie ;
acceptation version exacte & signature réelle ; attestation ; vérification
(finalité, sujet seul, accès restreint) ; accès participants ; intégrité (détection
d'altération, diffusion refusée) ; idempotence ; concurrence ; pagination keyset ;
rétention ; URL signée (émission, usage, altération, expiration) ; composition sans
secret (501) ; composition sans stockage (fail-closed) ; admin avec / sans permission ;
révocation version (motivée, auditée, octets retirés, références préservées,
append-only) ; révocation document ; non-régression réputation & domaines.

## 11. Limites assumées

- Durées de rétention : `NULL` jusqu'à validation juridique (aucune invention).
- Présignature directe R2 : hors tranche (`501`), le téléchargement passe par le worker.
- `IDENTITY_DOCUMENT` : type conservé dans le domaine mais aucune création exposée
  (KYC hors tranche).
- Le worker télécharge via l'adapter (bytes en mémoire, plafond 25 Mio imposé) —
  le streaming R2 direct sera une optimisation ultérieure.
