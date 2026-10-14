# Scénarios SC-0301 à SC-0400

Lot 4/10 — cumul 400. Tous sont **ANALYSE STATIQUE**; aucune ligne n’est présentée comme exécutée.

## SC-0301
| Champ | Valeur |
|---|---|
| ID | SC-0301 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | soumettre une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | OK |
| Gravité | FAIBLE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0302
| Champ | Valeur |
|---|---|
| ID | SC-0302 |
| Catégorie | REFUS |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | accepter une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0303
| Champ | Valeur |
|---|---|
| ID | SC-0303 |
| Catégorie | ANNULATION |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | refuser une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0304
| Champ | Valeur |
|---|---|
| ID | SC-0304 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | annuler une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0305
| Champ | Valeur |
|---|---|
| ID | SC-0305 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | répéter une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0306
| Champ | Valeur |
|---|---|
| ID | SC-0306 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | autoriser une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0307
| Champ | Valeur |
|---|---|
| ID | SC-0307 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | finaliser une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0308
| Champ | Valeur |
|---|---|
| ID | SC-0308 |
| Catégorie | CONCURRENCE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | créer une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0309
| Champ | Valeur |
|---|---|
| ID | SC-0309 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | lire une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0310
| Champ | Valeur |
|---|---|
| ID | SC-0310 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | modifier une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0311
| Champ | Valeur |
|---|---|
| ID | SC-0311 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | soumettre une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0312
| Champ | Valeur |
|---|---|
| ID | SC-0312 |
| Catégorie | REFUS |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | accepter une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0313
| Champ | Valeur |
|---|---|
| ID | SC-0313 |
| Catégorie | ANNULATION |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | refuser une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0314
| Champ | Valeur |
|---|---|
| ID | SC-0314 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | annuler une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0315
| Champ | Valeur |
|---|---|
| ID | SC-0315 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | répéter une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0316
| Champ | Valeur |
|---|---|
| ID | SC-0316 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | autoriser une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0317
| Champ | Valeur |
|---|---|
| ID | SC-0317 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | finaliser une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0318
| Champ | Valeur |
|---|---|
| ID | SC-0318 |
| Catégorie | CONCURRENCE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | créer une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0319
| Champ | Valeur |
|---|---|
| ID | SC-0319 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | lire une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0320
| Champ | Valeur |
|---|---|
| ID | SC-0320 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | modifier une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0321
| Champ | Valeur |
|---|---|
| ID | SC-0321 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | soumettre une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0322
| Champ | Valeur |
|---|---|
| ID | SC-0322 |
| Catégorie | REFUS |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | accepter une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0323
| Champ | Valeur |
|---|---|
| ID | SC-0323 |
| Catégorie | ANNULATION |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | refuser une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0324
| Champ | Valeur |
|---|---|
| ID | SC-0324 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | annuler une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0325
| Champ | Valeur |
|---|---|
| ID | SC-0325 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | répéter une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0326
| Champ | Valeur |
|---|---|
| ID | SC-0326 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | autoriser une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0327
| Champ | Valeur |
|---|---|
| ID | SC-0327 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | finaliser une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0328
| Champ | Valeur |
|---|---|
| ID | SC-0328 |
| Catégorie | CONCURRENCE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | créer une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0329
| Champ | Valeur |
|---|---|
| ID | SC-0329 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | lire une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0330
| Champ | Valeur |
|---|---|
| ID | SC-0330 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | modifier une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0331
| Champ | Valeur |
|---|---|
| ID | SC-0331 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | soumettre une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0332
| Champ | Valeur |
|---|---|
| ID | SC-0332 |
| Catégorie | REFUS |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | accepter une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0333
| Champ | Valeur |
|---|---|
| ID | SC-0333 |
| Catégorie | ANNULATION |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | refuser une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0334
| Champ | Valeur |
|---|---|
| ID | SC-0334 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | annuler une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0335
| Champ | Valeur |
|---|---|
| ID | SC-0335 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | répéter une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0336
| Champ | Valeur |
|---|---|
| ID | SC-0336 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | autoriser une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0337
| Champ | Valeur |
|---|---|
| ID | SC-0337 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | finaliser une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0338
| Champ | Valeur |
|---|---|
| ID | SC-0338 |
| Catégorie | CONCURRENCE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | créer une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0339
| Champ | Valeur |
|---|---|
| ID | SC-0339 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | lire une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0340
| Champ | Valeur |
|---|---|
| ID | SC-0340 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | modifier une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0341
| Champ | Valeur |
|---|---|
| ID | SC-0341 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | soumettre une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0342
| Champ | Valeur |
|---|---|
| ID | SC-0342 |
| Catégorie | REFUS |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | accepter une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0343
| Champ | Valeur |
|---|---|
| ID | SC-0343 |
| Catégorie | ANNULATION |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | refuser une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0344
| Champ | Valeur |
|---|---|
| ID | SC-0344 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | annuler une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0345
| Champ | Valeur |
|---|---|
| ID | SC-0345 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | répéter une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0346
| Champ | Valeur |
|---|---|
| ID | SC-0346 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | autoriser une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0347
| Champ | Valeur |
|---|---|
| ID | SC-0347 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | finaliser une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0348
| Champ | Valeur |
|---|---|
| ID | SC-0348 |
| Catégorie | CONCURRENCE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | créer une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0349
| Champ | Valeur |
|---|---|
| ID | SC-0349 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | lire une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0350
| Champ | Valeur |
|---|---|
| ID | SC-0350 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | modifier une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0351
| Champ | Valeur |
|---|---|
| ID | SC-0351 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | soumettre une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0352
| Champ | Valeur |
|---|---|
| ID | SC-0352 |
| Catégorie | REFUS |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | accepter une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0353
| Champ | Valeur |
|---|---|
| ID | SC-0353 |
| Catégorie | ANNULATION |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | refuser une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0354
| Champ | Valeur |
|---|---|
| ID | SC-0354 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | annuler une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0355
| Champ | Valeur |
|---|---|
| ID | SC-0355 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | répéter une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0356
| Champ | Valeur |
|---|---|
| ID | SC-0356 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | autoriser une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | `scheduler.ts` décrit J3 mais déclare un futur Worker/type-only seam; aucun Cron/évaluation/émission fiable n’est trouvé. |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | FONCTIONNALITÉ MANQUANTE |
| Gravité | CRITIQUE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0357
| Champ | Valeur |
|---|---|
| ID | SC-0357 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | finaliser une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0358
| Champ | Valeur |
|---|---|
| ID | SC-0358 |
| Catégorie | CONCURRENCE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | créer une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0359
| Champ | Valeur |
|---|---|
| ID | SC-0359 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | lire une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Les champs commission et idempotency existent dans les contrats/interfaces; l’autorité serveur persistante n’est pas opérationnelle dans le worker Phase 1. |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | CRITIQUE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0360
| Champ | Valeur |
|---|---|
| ID | SC-0360 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | modifier une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | `scheduler.ts` décrit J3 mais déclare un futur Worker/type-only seam; aucun Cron/évaluation/émission fiable n’est trouvé. |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | FONCTIONNALITÉ MANQUANTE |
| Gravité | CRITIQUE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0361
| Champ | Valeur |
|---|---|
| ID | SC-0361 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | soumettre une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0362
| Champ | Valeur |
|---|---|
| ID | SC-0362 |
| Catégorie | REFUS |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | accepter une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0363
| Champ | Valeur |
|---|---|
| ID | SC-0363 |
| Catégorie | ANNULATION |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | refuser une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0364
| Champ | Valeur |
|---|---|
| ID | SC-0364 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | annuler une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0365
| Champ | Valeur |
|---|---|
| ID | SC-0365 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | répéter une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0366
| Champ | Valeur |
|---|---|
| ID | SC-0366 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | autoriser une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0367
| Champ | Valeur |
|---|---|
| ID | SC-0367 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | finaliser une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0368
| Champ | Valeur |
|---|---|
| ID | SC-0368 |
| Catégorie | CONCURRENCE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | créer une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0369
| Champ | Valeur |
|---|---|
| ID | SC-0369 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | lire une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0370
| Champ | Valeur |
|---|---|
| ID | SC-0370 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | modifier une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0371
| Champ | Valeur |
|---|---|
| ID | SC-0371 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | soumettre une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0372
| Champ | Valeur |
|---|---|
| ID | SC-0372 |
| Catégorie | REFUS |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | accepter une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0373
| Champ | Valeur |
|---|---|
| ID | SC-0373 |
| Catégorie | ANNULATION |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | refuser une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0374
| Champ | Valeur |
|---|---|
| ID | SC-0374 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | annuler une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0375
| Champ | Valeur |
|---|---|
| ID | SC-0375 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | répéter une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0376
| Champ | Valeur |
|---|---|
| ID | SC-0376 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | autoriser une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0377
| Champ | Valeur |
|---|---|
| ID | SC-0377 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | finaliser une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0378
| Champ | Valeur |
|---|---|
| ID | SC-0378 |
| Catégorie | CONCURRENCE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | créer une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0379
| Champ | Valeur |
|---|---|
| ID | SC-0379 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | lire une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0380
| Champ | Valeur |
|---|---|
| ID | SC-0380 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | modifier une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0381
| Champ | Valeur |
|---|---|
| ID | SC-0381 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | soumettre une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0382
| Champ | Valeur |
|---|---|
| ID | SC-0382 |
| Catégorie | REFUS |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | accepter une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0383
| Champ | Valeur |
|---|---|
| ID | SC-0383 |
| Catégorie | ANNULATION |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | refuser une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0384
| Champ | Valeur |
|---|---|
| ID | SC-0384 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | annuler une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0385
| Champ | Valeur |
|---|---|
| ID | SC-0385 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | répéter une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0386
| Champ | Valeur |
|---|---|
| ID | SC-0386 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | autoriser une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0387
| Champ | Valeur |
|---|---|
| ID | SC-0387 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | finaliser une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0388
| Champ | Valeur |
|---|---|
| ID | SC-0388 |
| Catégorie | CONCURRENCE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | créer une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0389
| Champ | Valeur |
|---|---|
| ID | SC-0389 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | lire une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0390
| Champ | Valeur |
|---|---|
| ID | SC-0390 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | modifier une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0391
| Champ | Valeur |
|---|---|
| ID | SC-0391 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | soumettre une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0392
| Champ | Valeur |
|---|---|
| ID | SC-0392 |
| Catégorie | REFUS |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | accepter une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0393
| Champ | Valeur |
|---|---|
| ID | SC-0393 |
| Catégorie | ANNULATION |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | refuser une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0394
| Champ | Valeur |
|---|---|
| ID | SC-0394 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | annuler une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0395
| Champ | Valeur |
|---|---|
| ID | SC-0395 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | répéter une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0396
| Champ | Valeur |
|---|---|
| ID | SC-0396 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | autoriser une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0397
| Champ | Valeur |
|---|---|
| ID | SC-0397 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | finaliser une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0398
| Champ | Valeur |
|---|---|
| ID | SC-0398 |
| Catégorie | CONCURRENCE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | créer une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0399
| Champ | Valeur |
|---|---|
| ID | SC-0399 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | lire une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0400
| Champ | Valeur |
|---|---|
| ID | SC-0400 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | modifier une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |
