# Note provisoire — Référence métier LE LABEUR (phase 0)

> **Statut : PROVISOIRE.** Cette note ne remplace pas la spécification « LE LABEUR — Vision Finale, Architecture Métier & Spécifications Opérationnelles ».
> **Le texte intégral de cette spécification n'est pas versionné dans ce dépôt.** Le fichier `LE-LABEUR-VISION-FINALE-SPECIFICATIONS.md` n'a pas été reçu sous une forme fidèle : la pièce jointe est introuvable (`/home/user/uploads/` absent) et le Base64 transmis, décodé, ne correspond pas à l'original (taille 21 384 au lieu de 21 381 octets, SHA-256 différent, octet invalide à la position 7258). Aucun contenu n'a été reconstruit ni résumé à sa place.
> **Reliquat documentaire exact :** le texte intégral de la spécification finale, à déposer ici à l'identique avec son empreinte SHA-256 de référence.
> Date de la décision : 2026-10-14 (fuseau Africa/Lagos). Source : instruction explicite du propriétaire du projet.

## 1. Hiérarchie appliquée

1. La spécification finale et les dernières décisions explicites du propriétaire.
2. Le plan définitif des phases 0 à 11.
3. Le code, les guides, les checkpoints et les rapports existants : ils décrivent l'état technique, mais ne peuvent pas annuler une exigence métier approuvée.
4. Les anciennes instructions de l'assistant : elles ne constituent pas une autorité métier.

En cas de conflit, la nouvelle spécification s'applique. Une ancienne règle n'est pas conservée au seul motif qu'elle existe dans le code ou dans un document.

## 2. Décisions financières approuvées (remplacent le statut provisoire)

Le statut `FIN=BLOQUÉ_EN_ATTENTE_DÉCISION` est **historique et supersédé**. Il n'est plus la décision actuelle.

- **Premier mois** : 75 % de l'enveloppe de référence pour le Candidat ; 25 % d'honoraires propres de mise en relation pour LE LABEUR. Ces honoraires sont à la charge de l'Employeur.
- **Engagement de l'Employeur au premier mois** : égal à l'enveloppe annoncée. Aucun surcoût au-delà de cette enveloppe.
- **À partir du deuxième mois du même contrat** : 100 % de l'enveloppe revient au Candidat. Aucune nouvelle commission de mise en relation.
- **Candidat** : aucun honoraire, aucune facture et aucune créance de commission ne lui sont imputés.
- **Salaire** : réglé directement par l'Employeur au Candidat, hors plateforme. LE LABEUR n'encaisse, ne conserve et ne transfère pas le salaire.
- **Deux cycles distincts** : suivi du salaire déclaré d'une part ; suivi des honoraires propres de LE LABEUR d'autre part.
- **`PAID` pour une commission** : le justificatif a été vérifié et validé par la personne autorisée. Ce statut ne prouve pas, à lui seul, qu'un transfert bancaire a été effectué par l'application.
- **e-MECeF** : émission de la facture normalisée après validation des honoraires. Ce n'est pas un moyen de transfert d'argent.
- **Différend sur les honoraires** : ne bloque jamais le salaire du Candidat ni ses preuves de travail.
- **Rupture anticipée** : `NOT_APPLICABLE` n'est possible qu'après application de critères et d'une procédure d'approbation définis. Ces critères et cette procédure restent à rédiger dans la spécification.

## 3. Réserves juridiques (non tranchées ici)

- Règles applicables au placement et au SMIG : **à vérifier avant toute mise en production**.
- Ces réserves ne rétablissent pas l'ancien statut financier provisoire.

## 4. État technique réel — distinct des décisions

- Le guide `docs/guide-proprietaire/FONCTIONNEMENT-COMPLET-LE-LABEUR.md` décrit l'état technique au commit `84dd0ba`. Il ne prouve pas à lui seul le fonctionnement.
- Un écart entre la spécification et le code est un **travail d'implémentation**, jamais une modification silencieuse de la spécification.
- Services externes (paiement, e-MECeF, etc.) : **non opérationnels sans preuve réelle**.
- Aucun fournisseur de paiement n'est branché dans le code à la date de cette note.

## 5. Ce que cette note n'établit pas

- Le contenu intégral de la spécification.
- Les phases 1 à 11 du plan (le plan détaillé n'est pas versionné dans ce dépôt).
- Une empreinte SHA-256 de référence vérifiée sur un fichier versionné.
