# 2 — Matrice des transitions

| Domaine | Transition validée / codée | Refus/guard observé | Type seulement ou non trouvé |
|---|---|---|---|
| Compte | ACTIVE→BLOCKED, BLOCKED→ACTIVE via repository mock | acteur obligatoire, compte inconnu, compte bloqué opérationnel refusé; ADMIN exempté | auto-déblocage non trouvé |
| Offre | création→ACTIVE; status update vers `ACTIVE|FILLED|CANCELLED|PAUSED` | acteur requis; serveur persistant catalogué mais non opérationnel | expiration automatique non trouvée |
| Candidature | création→PENDING; examine, shortlist, reject, withdraw | rôles/scopes dans route catalog; chemin serveur Phase 1 non implémenté | sélection directe `HIRED` non isolée comme commande |
| Proposition | envoi et réponse exposés par interface | participant/role au catalogue | expiration automatique non trouvée |
| Contrat | génération; signature; actions mensuelles; activation/fin selon mock | actor/role et état contrôlés dans mock; concurrence DB non démontrée | rollback transactionnel complet non vérifiable |
| Paiement déclaration | create/update/submit; admin approve/reject exposés | employeur pour déclaration; idempotency annoncée | workflow persistant complet non opérationnel en Phase 1 |
| Commission | M1 25% / salarié 75%; M2+ 0% / salarié 100%; schedule généré | salaire négatif borné à zéro par calcul | application externe effective et paiement réel non vérifiables |
| Incident | report; arbitrate avec décisions CONTINUER/ANNULER/REMPLACER/CLÔTURER/SUSPENDRE | actor requis, accès ciblé | escalade automatique non trouvée |
| Remplacement | assign/transfer/finalize exposés par repository et routes admin | permission admin dans catalogue | workflow complet persistant non installé |
| Message | send, audio, proposal, read; contexte typé | participant scope dans routes; mock actor checks | fermeture de contrat bloquant message non établi |
| Notification | read/read-all; nombreux types déclarés; outbox décrit des événements | self/admin route scopes | couverture événement→destinataire complète non trouvée |
| Appel | initiate/accept/reject/end; credentials participant | route participant; service vérifie appel actif | signalisation durable/reconnexion non prouvée |
| J+3 | calcul de retard local et garde overdue dans mock | `getOverdueDueEntries` traite DUE/REJECTED | scheduler fiable absent : fonctionnalité manquante/non automatisée |

Les transitions `C`, `D`, `E`, `F`, `G` demandées par la mission sont donc marquées dans les scénarios comme `NON VÉRIFIABLE` ou `FONCTIONNALITÉ MANQUANTE` lorsqu'elles ne sont présentes que dans un type, commentaire ou catalogue.
