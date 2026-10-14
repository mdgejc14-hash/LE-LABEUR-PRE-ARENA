# Diagrammes Mermaid — index

Source unique : les fichiers `.mmd` de ce dossier. Ils sont recopiés dans les documents (blocs `<!-- DIAGRAMME:… -->`) par
`python3 outils/cartographie.py --diagrammes`, et exportés en SVG dans [`svg/`](svg/) (rendu Mermaid 11 dans Chromium ; voir
[`../outils/README.md`](../outils/README.md)). Les 12 fichiers ont été analysés (`mermaid.parse`) **et** rendus sans erreur.

**Convention** : trait plein = liaison vérifiée dans le code (fichier/ligne dans l'étiquette ou dans le document qui l'intègre) ;
trait pointillé = `NON IMPLÉMENTÉ`, `NON CONFIGURÉ`, `STOP` ou `À VÉRIFIER` (mention explicite dans l'étiquette).

| # | Fichier | Sujet | Intégré dans | Export |
|---|---|---|---|---|
| 01 | [`01-architecture-generale.mmd`](01-architecture-generale.mmd) | architecture générale navigateur → Worker → données → services externes | [00-INDEX §2](../00-INDEX.md) | [svg](svg/01-architecture-generale.svg) |
| 02 | [`02-public-auth.mmd`](02-public-auth.mmd) | parcours Public / Auth | [B §1-2](../B-parcours-fonctionnels.md) | [svg](svg/02-public-auth.svg) |
| 03 | [`03-employeur.mmd`](03-employeur.mmd) | parcours Employeur | [B §3](../B-parcours-fonctionnels.md) | [svg](svg/03-employeur.svg) |
| 04 | [`04-candidat.mmd`](04-candidat.mmd) | parcours Candidat / Prestataire | [B §4](../B-parcours-fonctionnels.md) | [svg](svg/04-candidat.svg) |
| 05 | [`05-contrat-salaire-paiement-litige.mmd`](05-contrat-salaire-paiement-litige.mmd) | contrat, échéances, salaire, paiement, litige | [B §5](../B-parcours-fonctionnels.md) | [svg](svg/05-contrat-salaire-paiement-litige.svg) |
| 06 | [`06-rtc.mmd`](06-rtc.mmd) | sessions temps réel | [B §7](../B-parcours-fonctionnels.md) | [svg](svg/06-rtc.svg) |
| 07 | [`07-admin.mmd`](07-admin.mmd) | espace ADMIN | [B §8](../B-parcours-fonctionnels.md) | [svg](svg/07-admin.svg) |
| 08 | [`08-chaine-frontend-donnees.mmd`](08-chaine-frontend-donnees.mmd) | chaîne frontend → API → handler → service → données | [C](../C-cartographie-technique.md) | [svg](svg/08-chaine-frontend-donnees.svg) |
| 09 | [`09-infra-services.mmd`](09-infra-services.mmd) | infrastructure et dépendances de services | [E §5](../E-donnees-traitements.md) | [svg](svg/09-infra-services.svg) |
| 10 | [`10-erreurs-blocages.mmd`](10-erreurs-blocages.mmd) | chemins d'erreur et points de blocage | [B §9](../B-parcours-fonctionnels.md), [F](../F-erreurs-cas-limites.md) | [svg](svg/10-erreurs-blocages.svg) |
| 11 | [`11-git-pr-checkpoints.mmd`](11-git-pr-checkpoints.mmd) | dépendances PR #47–#71 et checkpoint | [H](../H-integration-git-pr.md) | [svg](svg/11-git-pr-checkpoints.svg) |
| 12 | [`12-remplacement-reputation.mmd`](12-remplacement-reputation.mmd) | remplacements et réputation (complément) | [B §6](../B-parcours-fonctionnels.md) | [svg](svg/12-remplacement-reputation.svg) |

Liens entre diagrammes : 01 (vue d'ensemble) → 02/03/04/06/07 (parcours par profil) → 05/12 (cycles transverses) → 08 (chaîne technique
type) → 09 (dépendances d'infrastructure) → 10 (erreurs et blocages, qui reprend les STOP de 02–07 et 12) ; 11 est indépendant (Git).
