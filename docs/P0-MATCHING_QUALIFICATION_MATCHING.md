# P0-MATCHING — qualification produit et classement transparent

## Périmètre et garde-fous

Le flux est **Offre → questionnaire → décision produit → revue humaine si nécessaire → candidats classés → résultats**. Cette tranche est un outil de filtrage produit, pas une qualification juridique définitive, un avis juridique, une décision d'embauche ni un système d'affectation. Les réponses de l'employeur ne sont jamais remplacées par le nom « prestation » du contrat.

Le Client reste seul décisionnaire. Le matching n'écrit ni candidature, ni sélection, ni proposition, ni contrat, ni statut de remplacement. Aucun candidat n'est obligé d'accepter. Les résultats portent explicitement `clientMakesFinalChoice: true` et `automaticAssignment: false`.

Une qualification est enregistrée une seule fois par offre. Son questionnaire est verrouillé. Une nouvelle clé d'idempotence ne permet pas de réécrire les réponses : une situation bloquée ne peut pas être contournée en modifiant les réponses. Une ambiguïté est transmise à la file ADMIN. Une revue humaine peut conclure `ELIGIBLE_FOR_INDEPENDENT` ou `BLOCKED`, avec auteur, date et motif; elle ne modifie jamais le questionnaire. Un blocage déterministe n'est pas réouvrable par cette route de revue.

## Qualification

Versions actuellement appliquées :

- `P0-MATCHING-QUALIFICATION-1` pour le questionnaire et la décision;
- `P0-MATCHING-RANKING-1` pour le classement.

La décision initiale est persistée avec les réponses normalisées, les raisons structurées et la version. Les actions d'évaluation et de revue sont également écrites dans le ledger d'audit `automation_audit_ledger` déjà existant. La priorité est déterministe : **toute raison `BLOCK` → `BLOCKED`; sinon toute raison `REVIEW` → `HUMAN_REVIEW_REQUIRED`; sinon `ELIGIBLE_FOR_INDEPENDENT`**.

### Contrôles productisés

- **Nature du service** : nature autonome, description du résultat/livrable, critères de réception et caractère objectif de ces critères.
- **Rémunération** : une rémunération uniquement liée au temps/à la présence bloque; une base mixte est revue.
- **Autonomie** : méthodes, temps, clientèle et refus sans sanction; absence de risque professionnel établi conduit à revue.
- **Subordination** : pouvoir disciplinaire, shift continu, ordres hiérarchiques quotidiens et poste permanent intégré bloquent. Une exclusivité déclarée sans justification bloque; toute exclusivité autrement déclarée reste en revue humaine.
- **Temps/lieu** : une contrainte forte ou inconnue est revue. Le résumé candidat des contraintes est exposé séparément.
- **Formalités** : l'employeur déclare avoir prévu la vérification de la majorité/capacité, identifié les exigences de statut professionnel et fiscales/facturation, identifié l'éventuel besoin d'autorisation professionnelle et d'assurance, et planifié les vérifications requises. Les inconnues ou l'absence de plan conduisent à revue.

Ces réponses décrivent la mission et le processus prévu par l'employeur. Elles **ne certifient pas** la majorité, le statut, l'autorisation, la fiscalité, la facturation ou l'assurance d'un candidat particulier. Ces éléments restent à vérifier avant tout engagement lorsque requis. Le système n'affirme pas une qualification juridique définitive.

## Résultats et ranking

Un run est possible uniquement pour une offre `ACTIVE` dont la qualification courante est `ELIGIBLE_FOR_INDEPENDENT`. `HUMAN_REVIEW_REQUIRED`, `BLOCKED` ou l'absence de qualification refusent la génération de résultats.

Les critères et poids renvoyés avec chaque run sont fixes et lisibles :

| Facteur | Poids maximal | Calcul |
| --- | ---: | --- |
| Compétences | 60 | Correspondance exacte, insensible à la casse, entre `offers.skills` et les compétences déclarées par le candidat; points proportionnels au nombre de compétences correspondantes. |
| Zone administrative | 30 | Correspondance la plus précise commune : localité 30, arrondissement 25, commune 20, département 10, aucune correspondance 0. Pas de coordonnées ni de géolocalisation précise. |
| Disponibilité déclarée | 10 | `AVAILABLE` 10, `LIMITED` 5, `UNDECLARED` 0; `UNAVAILABLE` n'est pas proposé dans les résultats. Il n'existe aucun calendrier ni moteur de disponibilité. |

Le maximum affiché est la somme des facteurs disponibles pour l'offre (les compétences et la zone ne contribuent pas si l'offre n'a pas ces données structurées). Les compétences et la disponibilité sont des déclarations de profil, pas des vérifications indépendantes. Le tri est sélectionnable parmi `score`, `skills`, `location`, `availability`, avec `ASC`/`DESC`; l'égalité est départagée de façon stable par `candidateId` croissant. Un changement de tri crée un nouveau snapshot et ne modifie aucune source.

Ne sont pas utilisés : origine, ethnie, religion, opinion, syndicat, santé, vie sexuelle, génétique, biométrie, litiges, paiement, reconnaissance faciale, profilage opaque, temps de réponse ou score global de réputation. L'expérience vérifiée, les exigences réglementaires individuelles et la qualité documentée de prestations antérieures ne sont pas classées : aucune source persistée et vérifiée adéquate n'est ouverte dans cette tranche. Aucun de ces facteurs n'est simulé.

Dans ce P0, « candidat présent dans les résultats » signifie uniquement : compte `CANDIDATE` actif, profil de matching auto-déclaré disponible et disponibilité différente de `UNAVAILABLE`. Cela ne signifie pas que son statut professionnel, ses autorisations ou son admissibilité juridique ont été vérifiés. Les compétences sont un facteur souple de classement, pas un rejet automatique.

Le profil de matching est volontairement borné aux compétences, identifiants de zones administratives générales et disponibilité déclarée — champs déjà représentés par le modèle de profil. Il ne stocke ni téléphone, ni e-mail, ni adresse détaillée, ni coordonnées. Les résultats exposent uniquement l'identifiant, le nom public, le score et les explications utiles au classement.

Chaque run conserve l'offre, la qualification, la version du ranking, les critères, l'ordre choisi, les résultats et les explications minimales. La génération est bornée à 200 profils; un bassin supérieur échoue explicitement plutôt que de produire un classement partiel silencieux.

## API et autorisation

- `POST /api/v1/offers/:offerId/qualification` — EMPLOYER propriétaire; questionnaire strictement validé; idempotence obligatoire.
- `GET /api/v1/offers/:offerId/qualification` — lecture EMPLOYER propriétaire.
- `GET /api/v1/offers/:offerId/qualification-summary` — résumé candidat public des contraintes de temps/lieu; aucune décision ni raison interne n'est exposée.
- `GET/PATCH /api/v1/my/matching-profile` — profil personnel CANDIDATE; patch idempotent.
- `POST /api/v1/offers/:offerId/matching-runs` — EMPLOYER propriétaire; tri facultatif; refus si qualification non éligible.
- `GET /api/v1/matching-runs/:runId` — lecture propriétaire des résultats sauvegardés.
- `GET /api/v1/admin/qualifications/review` et `POST /api/v1/admin/qualifications/:qualificationId/review` — ADMIN actif, permission existante `offers:moderate`; revue à usage unique.

Les routes matching ne sont composées qu'avec PostgreSQL durable. Ownership et rôle sont revalidés côté serveur. Le profil candidat ne peut être écrit que par son propriétaire.

## Outbox, notifications, candidatures et remplacement

Qualification, revue et ranking sont synchrones et consultables via leurs routes/queue persistées. Le ledger d'audit et l'idempotence durables existants sont réutilisés; actions auditées : `MISSION_QUALIFICATION_EVALUATED`, `MISSION_QUALIFICATION_REVIEWED`, `CANDIDATE_MATCHING_PROFILE_UPDATED` et `MATCHING_RESULTS_CREATED`. Aucun événement Outbox ni notification asynchrone supplémentaire n'est émis en P0; aucun type de notification, worker ou système parallèle n'est créé.

Le matching est indexé par `offerId`, y compris une offre publiée par P0-REPLACEMENT. Il n'ajoute pas de workflow de remplacement : la sélection P0-REPLACEMENT continue de réutiliser candidatures, propositions et contrats existants. Aucun candidat n'est transféré par le ranking.

Le périmètre financier et paiement n'est pas modifié. Le ranking n'introduit aucune commission, réduction du prix Prestataire, détention ou reversement de fonds.

## Points ouverts assumés

1. Le modèle serveur antérieur ne persistait pas les champs de profil utilisés; la migration P0 ajoute un profil de matching réduit et un endpoint CANDIDATE propriétaire pour des champs déjà présents au modèle produit. Aucun champ sensible nouveau n'est introduit.
2. Il n'existe pas de validation des justificatifs individuels de statut, âge/capacité, autorisation, fiscalité/facturation ou assurance. Le questionnaire enregistre le plan de vérification de l'employeur, pas le résultat d'un contrôle documentaire.
3. Aucun écran final n'est livré dans cette tranche; les contrats d'API et le résumé public permettent l'intégration produit ultérieure. Le MODE DEMO reste séparé.
4. Le bassin de plus de 200 profils doit être traité dans une évolution avec pagination des résultats, sans classement partiel.
5. L'accès matching des offres de remplacement est possible sur leur `offerId`; P0-REPLACEMENT n'appelle pas encore ce classement et continue de sélectionner via les candidatures, conformément à son workflow validé.
