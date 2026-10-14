# Scénarios SC-0201 à SC-0300

Lot 3/10 — cumul 300. Tous sont **ANALYSE STATIQUE**; aucune ligne n’est présentée comme exécutée.

## SC-0201
| Champ | Valeur |
|---|---|
| ID | SC-0201 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | modifier une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | OK |
| Gravité | FAIBLE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0202
| Champ | Valeur |
|---|---|
| ID | SC-0202 |
| Catégorie | REFUS |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | soumettre une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0203
| Champ | Valeur |
|---|---|
| ID | SC-0203 |
| Catégorie | ANNULATION |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | accepter une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0204
| Champ | Valeur |
|---|---|
| ID | SC-0204 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | refuser une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0205
| Champ | Valeur |
|---|---|
| ID | SC-0205 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | annuler une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0206
| Champ | Valeur |
|---|---|
| ID | SC-0206 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | répéter une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0207
| Champ | Valeur |
|---|---|
| ID | SC-0207 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | autoriser une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0208
| Champ | Valeur |
|---|---|
| ID | SC-0208 |
| Catégorie | CONCURRENCE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | finaliser une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0209
| Champ | Valeur |
|---|---|
| ID | SC-0209 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | créer une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0210
| Champ | Valeur |
|---|---|
| ID | SC-0210 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | lire une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0211
| Champ | Valeur |
|---|---|
| ID | SC-0211 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | modifier une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0212
| Champ | Valeur |
|---|---|
| ID | SC-0212 |
| Catégorie | REFUS |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | soumettre une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0213
| Champ | Valeur |
|---|---|
| ID | SC-0213 |
| Catégorie | ANNULATION |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | accepter une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0214
| Champ | Valeur |
|---|---|
| ID | SC-0214 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | refuser une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0215
| Champ | Valeur |
|---|---|
| ID | SC-0215 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | annuler une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0216
| Champ | Valeur |
|---|---|
| ID | SC-0216 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | répéter une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0217
| Champ | Valeur |
|---|---|
| ID | SC-0217 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | autoriser une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0218
| Champ | Valeur |
|---|---|
| ID | SC-0218 |
| Catégorie | CONCURRENCE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | finaliser une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0219
| Champ | Valeur |
|---|---|
| ID | SC-0219 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | créer une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0220
| Champ | Valeur |
|---|---|
| ID | SC-0220 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | lire une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0221
| Champ | Valeur |
|---|---|
| ID | SC-0221 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | modifier une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0222
| Champ | Valeur |
|---|---|
| ID | SC-0222 |
| Catégorie | REFUS |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | soumettre une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0223
| Champ | Valeur |
|---|---|
| ID | SC-0223 |
| Catégorie | ANNULATION |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | accepter une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0224
| Champ | Valeur |
|---|---|
| ID | SC-0224 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | refuser une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0225
| Champ | Valeur |
|---|---|
| ID | SC-0225 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | annuler une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0226
| Champ | Valeur |
|---|---|
| ID | SC-0226 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | répéter une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0227
| Champ | Valeur |
|---|---|
| ID | SC-0227 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | autoriser une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0228
| Champ | Valeur |
|---|---|
| ID | SC-0228 |
| Catégorie | CONCURRENCE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | finaliser une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0229
| Champ | Valeur |
|---|---|
| ID | SC-0229 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | créer une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0230
| Champ | Valeur |
|---|---|
| ID | SC-0230 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | lire une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0231
| Champ | Valeur |
|---|---|
| ID | SC-0231 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | modifier une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0232
| Champ | Valeur |
|---|---|
| ID | SC-0232 |
| Catégorie | REFUS |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | soumettre une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0233
| Champ | Valeur |
|---|---|
| ID | SC-0233 |
| Catégorie | ANNULATION |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | accepter une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0234
| Champ | Valeur |
|---|---|
| ID | SC-0234 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | refuser une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0235
| Champ | Valeur |
|---|---|
| ID | SC-0235 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | annuler une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0236
| Champ | Valeur |
|---|---|
| ID | SC-0236 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | répéter une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0237
| Champ | Valeur |
|---|---|
| ID | SC-0237 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | autoriser une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0238
| Champ | Valeur |
|---|---|
| ID | SC-0238 |
| Catégorie | CONCURRENCE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | finaliser une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0239
| Champ | Valeur |
|---|---|
| ID | SC-0239 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | créer une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0240
| Champ | Valeur |
|---|---|
| ID | SC-0240 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | lire une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0241
| Champ | Valeur |
|---|---|
| ID | SC-0241 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | modifier une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0242
| Champ | Valeur |
|---|---|
| ID | SC-0242 |
| Catégorie | REFUS |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | soumettre une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0243
| Champ | Valeur |
|---|---|
| ID | SC-0243 |
| Catégorie | ANNULATION |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | accepter une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0244
| Champ | Valeur |
|---|---|
| ID | SC-0244 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | refuser une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0245
| Champ | Valeur |
|---|---|
| ID | SC-0245 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | annuler une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0246
| Champ | Valeur |
|---|---|
| ID | SC-0246 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | répéter une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0247
| Champ | Valeur |
|---|---|
| ID | SC-0247 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | autoriser une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0248
| Champ | Valeur |
|---|---|
| ID | SC-0248 |
| Catégorie | CONCURRENCE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | finaliser une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0249
| Champ | Valeur |
|---|---|
| ID | SC-0249 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | créer une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0250
| Champ | Valeur |
|---|---|
| ID | SC-0250 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | lire une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0251
| Champ | Valeur |
|---|---|
| ID | SC-0251 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | modifier une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0252
| Champ | Valeur |
|---|---|
| ID | SC-0252 |
| Catégorie | REFUS |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | soumettre une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0253
| Champ | Valeur |
|---|---|
| ID | SC-0253 |
| Catégorie | ANNULATION |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | accepter une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0254
| Champ | Valeur |
|---|---|
| ID | SC-0254 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | refuser une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0255
| Champ | Valeur |
|---|---|
| ID | SC-0255 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | annuler une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0256
| Champ | Valeur |
|---|---|
| ID | SC-0256 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | répéter une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | `scheduler.ts` décrit J3 mais déclare un futur Worker/type-only seam; aucun Cron/évaluation/émission fiable n’est trouvé. |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | FONCTIONNALITÉ MANQUANTE |
| Gravité | CRITIQUE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0257
| Champ | Valeur |
|---|---|
| ID | SC-0257 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | autoriser une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0258
| Champ | Valeur |
|---|---|
| ID | SC-0258 |
| Catégorie | CONCURRENCE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | finaliser une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0259
| Champ | Valeur |
|---|---|
| ID | SC-0259 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | créer une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Les champs commission et idempotency existent dans les contrats/interfaces; l’autorité serveur persistante n’est pas opérationnelle dans le worker Phase 1. |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | CRITIQUE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0260
| Champ | Valeur |
|---|---|
| ID | SC-0260 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | lire une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | `scheduler.ts` décrit J3 mais déclare un futur Worker/type-only seam; aucun Cron/évaluation/émission fiable n’est trouvé. |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | FONCTIONNALITÉ MANQUANTE |
| Gravité | CRITIQUE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0261
| Champ | Valeur |
|---|---|
| ID | SC-0261 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | modifier une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0262
| Champ | Valeur |
|---|---|
| ID | SC-0262 |
| Catégorie | REFUS |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | soumettre une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0263
| Champ | Valeur |
|---|---|
| ID | SC-0263 |
| Catégorie | ANNULATION |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | accepter une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0264
| Champ | Valeur |
|---|---|
| ID | SC-0264 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | refuser une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0265
| Champ | Valeur |
|---|---|
| ID | SC-0265 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | annuler une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0266
| Champ | Valeur |
|---|---|
| ID | SC-0266 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | répéter une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0267
| Champ | Valeur |
|---|---|
| ID | SC-0267 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | autoriser une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0268
| Champ | Valeur |
|---|---|
| ID | SC-0268 |
| Catégorie | CONCURRENCE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | finaliser une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0269
| Champ | Valeur |
|---|---|
| ID | SC-0269 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | créer une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0270
| Champ | Valeur |
|---|---|
| ID | SC-0270 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | lire une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0271
| Champ | Valeur |
|---|---|
| ID | SC-0271 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | modifier une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0272
| Champ | Valeur |
|---|---|
| ID | SC-0272 |
| Catégorie | REFUS |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | soumettre une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0273
| Champ | Valeur |
|---|---|
| ID | SC-0273 |
| Catégorie | ANNULATION |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | accepter une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0274
| Champ | Valeur |
|---|---|
| ID | SC-0274 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | refuser une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0275
| Champ | Valeur |
|---|---|
| ID | SC-0275 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | annuler une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0276
| Champ | Valeur |
|---|---|
| ID | SC-0276 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | répéter une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0277
| Champ | Valeur |
|---|---|
| ID | SC-0277 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | autoriser une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0278
| Champ | Valeur |
|---|---|
| ID | SC-0278 |
| Catégorie | CONCURRENCE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | finaliser une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0279
| Champ | Valeur |
|---|---|
| ID | SC-0279 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | créer une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0280
| Champ | Valeur |
|---|---|
| ID | SC-0280 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | lire une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0281
| Champ | Valeur |
|---|---|
| ID | SC-0281 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | modifier une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0282
| Champ | Valeur |
|---|---|
| ID | SC-0282 |
| Catégorie | REFUS |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | soumettre une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0283
| Champ | Valeur |
|---|---|
| ID | SC-0283 |
| Catégorie | ANNULATION |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | accepter une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0284
| Champ | Valeur |
|---|---|
| ID | SC-0284 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | refuser une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0285
| Champ | Valeur |
|---|---|
| ID | SC-0285 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | annuler une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0286
| Champ | Valeur |
|---|---|
| ID | SC-0286 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | répéter une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0287
| Champ | Valeur |
|---|---|
| ID | SC-0287 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | autoriser une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0288
| Champ | Valeur |
|---|---|
| ID | SC-0288 |
| Catégorie | CONCURRENCE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | finaliser une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0289
| Champ | Valeur |
|---|---|
| ID | SC-0289 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | créer une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0290
| Champ | Valeur |
|---|---|
| ID | SC-0290 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | lire une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0291
| Champ | Valeur |
|---|---|
| ID | SC-0291 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | modifier une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0292
| Champ | Valeur |
|---|---|
| ID | SC-0292 |
| Catégorie | REFUS |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | soumettre une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0293
| Champ | Valeur |
|---|---|
| ID | SC-0293 |
| Catégorie | ANNULATION |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | accepter une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0294
| Champ | Valeur |
|---|---|
| ID | SC-0294 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | refuser une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0295
| Champ | Valeur |
|---|---|
| ID | SC-0295 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | annuler une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0296
| Champ | Valeur |
|---|---|
| ID | SC-0296 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | répéter une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0297
| Champ | Valeur |
|---|---|
| ID | SC-0297 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | autoriser une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0298
| Champ | Valeur |
|---|---|
| ID | SC-0298 |
| Catégorie | CONCURRENCE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | finaliser une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0299
| Champ | Valeur |
|---|---|
| ID | SC-0299 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | créer une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0300
| Champ | Valeur |
|---|---|
| ID | SC-0300 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | lire une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |
