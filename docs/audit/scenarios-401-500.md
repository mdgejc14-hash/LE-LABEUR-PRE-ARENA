# Scénarios SC-0401 à SC-0500

Lot 5/10 — cumul 500. Tous sont **ANALYSE STATIQUE**; aucune ligne n’est présentée comme exécutée.

## SC-0401
| Champ | Valeur |
|---|---|
| ID | SC-0401 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | accepter une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | OK |
| Gravité | FAIBLE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0402
| Champ | Valeur |
|---|---|
| ID | SC-0402 |
| Catégorie | REFUS |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | refuser une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0403
| Champ | Valeur |
|---|---|
| ID | SC-0403 |
| Catégorie | ANNULATION |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | annuler une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0404
| Champ | Valeur |
|---|---|
| ID | SC-0404 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | répéter une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0405
| Champ | Valeur |
|---|---|
| ID | SC-0405 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | autoriser une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0406
| Champ | Valeur |
|---|---|
| ID | SC-0406 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | finaliser une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0407
| Champ | Valeur |
|---|---|
| ID | SC-0407 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | créer une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0408
| Champ | Valeur |
|---|---|
| ID | SC-0408 |
| Catégorie | CONCURRENCE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | lire une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0409
| Champ | Valeur |
|---|---|
| ID | SC-0409 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | modifier une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0410
| Champ | Valeur |
|---|---|
| ID | SC-0410 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | soumettre une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0411
| Champ | Valeur |
|---|---|
| ID | SC-0411 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | accepter une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0412
| Champ | Valeur |
|---|---|
| ID | SC-0412 |
| Catégorie | REFUS |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | refuser une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0413
| Champ | Valeur |
|---|---|
| ID | SC-0413 |
| Catégorie | ANNULATION |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | annuler une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0414
| Champ | Valeur |
|---|---|
| ID | SC-0414 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | répéter une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0415
| Champ | Valeur |
|---|---|
| ID | SC-0415 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | autoriser une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0416
| Champ | Valeur |
|---|---|
| ID | SC-0416 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | finaliser une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0417
| Champ | Valeur |
|---|---|
| ID | SC-0417 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | créer une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0418
| Champ | Valeur |
|---|---|
| ID | SC-0418 |
| Catégorie | CONCURRENCE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | lire une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0419
| Champ | Valeur |
|---|---|
| ID | SC-0419 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | modifier une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0420
| Champ | Valeur |
|---|---|
| ID | SC-0420 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | soumettre une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0421
| Champ | Valeur |
|---|---|
| ID | SC-0421 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | accepter une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0422
| Champ | Valeur |
|---|---|
| ID | SC-0422 |
| Catégorie | REFUS |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | refuser une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0423
| Champ | Valeur |
|---|---|
| ID | SC-0423 |
| Catégorie | ANNULATION |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | annuler une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0424
| Champ | Valeur |
|---|---|
| ID | SC-0424 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | répéter une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0425
| Champ | Valeur |
|---|---|
| ID | SC-0425 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | autoriser une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0426
| Champ | Valeur |
|---|---|
| ID | SC-0426 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | finaliser une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0427
| Champ | Valeur |
|---|---|
| ID | SC-0427 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | créer une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0428
| Champ | Valeur |
|---|---|
| ID | SC-0428 |
| Catégorie | CONCURRENCE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | lire une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0429
| Champ | Valeur |
|---|---|
| ID | SC-0429 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | modifier une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0430
| Champ | Valeur |
|---|---|
| ID | SC-0430 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | soumettre une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0431
| Champ | Valeur |
|---|---|
| ID | SC-0431 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | accepter une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0432
| Champ | Valeur |
|---|---|
| ID | SC-0432 |
| Catégorie | REFUS |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | refuser une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0433
| Champ | Valeur |
|---|---|
| ID | SC-0433 |
| Catégorie | ANNULATION |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | annuler une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0434
| Champ | Valeur |
|---|---|
| ID | SC-0434 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | répéter une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0435
| Champ | Valeur |
|---|---|
| ID | SC-0435 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | autoriser une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0436
| Champ | Valeur |
|---|---|
| ID | SC-0436 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | finaliser une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0437
| Champ | Valeur |
|---|---|
| ID | SC-0437 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | créer une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0438
| Champ | Valeur |
|---|---|
| ID | SC-0438 |
| Catégorie | CONCURRENCE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | lire une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0439
| Champ | Valeur |
|---|---|
| ID | SC-0439 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | modifier une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0440
| Champ | Valeur |
|---|---|
| ID | SC-0440 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | soumettre une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0441
| Champ | Valeur |
|---|---|
| ID | SC-0441 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | accepter une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0442
| Champ | Valeur |
|---|---|
| ID | SC-0442 |
| Catégorie | REFUS |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | refuser une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0443
| Champ | Valeur |
|---|---|
| ID | SC-0443 |
| Catégorie | ANNULATION |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | annuler une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0444
| Champ | Valeur |
|---|---|
| ID | SC-0444 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | répéter une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0445
| Champ | Valeur |
|---|---|
| ID | SC-0445 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | autoriser une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0446
| Champ | Valeur |
|---|---|
| ID | SC-0446 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | finaliser une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0447
| Champ | Valeur |
|---|---|
| ID | SC-0447 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | créer une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0448
| Champ | Valeur |
|---|---|
| ID | SC-0448 |
| Catégorie | CONCURRENCE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | lire une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0449
| Champ | Valeur |
|---|---|
| ID | SC-0449 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | modifier une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0450
| Champ | Valeur |
|---|---|
| ID | SC-0450 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | soumettre une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0451
| Champ | Valeur |
|---|---|
| ID | SC-0451 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | accepter une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0452
| Champ | Valeur |
|---|---|
| ID | SC-0452 |
| Catégorie | REFUS |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | refuser une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0453
| Champ | Valeur |
|---|---|
| ID | SC-0453 |
| Catégorie | ANNULATION |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | annuler une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0454
| Champ | Valeur |
|---|---|
| ID | SC-0454 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | répéter une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0455
| Champ | Valeur |
|---|---|
| ID | SC-0455 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | autoriser une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0456
| Champ | Valeur |
|---|---|
| ID | SC-0456 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | finaliser une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | `scheduler.ts` décrit J3 mais déclare un futur Worker/type-only seam; aucun Cron/évaluation/émission fiable n’est trouvé. |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | FONCTIONNALITÉ MANQUANTE |
| Gravité | CRITIQUE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0457
| Champ | Valeur |
|---|---|
| ID | SC-0457 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | créer une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0458
| Champ | Valeur |
|---|---|
| ID | SC-0458 |
| Catégorie | CONCURRENCE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | lire une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0459
| Champ | Valeur |
|---|---|
| ID | SC-0459 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | modifier une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Les champs commission et idempotency existent dans les contrats/interfaces; l’autorité serveur persistante n’est pas opérationnelle dans le worker Phase 1. |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | CRITIQUE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0460
| Champ | Valeur |
|---|---|
| ID | SC-0460 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | soumettre une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | `scheduler.ts` décrit J3 mais déclare un futur Worker/type-only seam; aucun Cron/évaluation/émission fiable n’est trouvé. |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | FONCTIONNALITÉ MANQUANTE |
| Gravité | CRITIQUE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0461
| Champ | Valeur |
|---|---|
| ID | SC-0461 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | accepter une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0462
| Champ | Valeur |
|---|---|
| ID | SC-0462 |
| Catégorie | REFUS |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | refuser une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0463
| Champ | Valeur |
|---|---|
| ID | SC-0463 |
| Catégorie | ANNULATION |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | annuler une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0464
| Champ | Valeur |
|---|---|
| ID | SC-0464 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | répéter une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0465
| Champ | Valeur |
|---|---|
| ID | SC-0465 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | autoriser une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0466
| Champ | Valeur |
|---|---|
| ID | SC-0466 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | finaliser une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0467
| Champ | Valeur |
|---|---|
| ID | SC-0467 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | créer une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0468
| Champ | Valeur |
|---|---|
| ID | SC-0468 |
| Catégorie | CONCURRENCE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | lire une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0469
| Champ | Valeur |
|---|---|
| ID | SC-0469 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | modifier une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0470
| Champ | Valeur |
|---|---|
| ID | SC-0470 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | soumettre une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0471
| Champ | Valeur |
|---|---|
| ID | SC-0471 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | accepter une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0472
| Champ | Valeur |
|---|---|
| ID | SC-0472 |
| Catégorie | REFUS |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | refuser une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0473
| Champ | Valeur |
|---|---|
| ID | SC-0473 |
| Catégorie | ANNULATION |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | annuler une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0474
| Champ | Valeur |
|---|---|
| ID | SC-0474 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | répéter une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0475
| Champ | Valeur |
|---|---|
| ID | SC-0475 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | autoriser une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0476
| Champ | Valeur |
|---|---|
| ID | SC-0476 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | finaliser une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0477
| Champ | Valeur |
|---|---|
| ID | SC-0477 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | créer une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0478
| Champ | Valeur |
|---|---|
| ID | SC-0478 |
| Catégorie | CONCURRENCE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | lire une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0479
| Champ | Valeur |
|---|---|
| ID | SC-0479 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | modifier une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0480
| Champ | Valeur |
|---|---|
| ID | SC-0480 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | soumettre une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0481
| Champ | Valeur |
|---|---|
| ID | SC-0481 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | accepter une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0482
| Champ | Valeur |
|---|---|
| ID | SC-0482 |
| Catégorie | REFUS |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | refuser une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0483
| Champ | Valeur |
|---|---|
| ID | SC-0483 |
| Catégorie | ANNULATION |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | annuler une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0484
| Champ | Valeur |
|---|---|
| ID | SC-0484 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | répéter une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0485
| Champ | Valeur |
|---|---|
| ID | SC-0485 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | autoriser une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0486
| Champ | Valeur |
|---|---|
| ID | SC-0486 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | finaliser une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0487
| Champ | Valeur |
|---|---|
| ID | SC-0487 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | créer une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0488
| Champ | Valeur |
|---|---|
| ID | SC-0488 |
| Catégorie | CONCURRENCE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | lire une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0489
| Champ | Valeur |
|---|---|
| ID | SC-0489 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | modifier une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0490
| Champ | Valeur |
|---|---|
| ID | SC-0490 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | soumettre une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0491
| Champ | Valeur |
|---|---|
| ID | SC-0491 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | accepter une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0492
| Champ | Valeur |
|---|---|
| ID | SC-0492 |
| Catégorie | REFUS |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | refuser une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0493
| Champ | Valeur |
|---|---|
| ID | SC-0493 |
| Catégorie | ANNULATION |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | annuler une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0494
| Champ | Valeur |
|---|---|
| ID | SC-0494 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | répéter une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0495
| Champ | Valeur |
|---|---|
| ID | SC-0495 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | autoriser une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0496
| Champ | Valeur |
|---|---|
| ID | SC-0496 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | finaliser une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0497
| Champ | Valeur |
|---|---|
| ID | SC-0497 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | créer une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0498
| Champ | Valeur |
|---|---|
| ID | SC-0498 |
| Catégorie | CONCURRENCE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | lire une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0499
| Champ | Valeur |
|---|---|
| ID | SC-0499 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | modifier une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0500
| Champ | Valeur |
|---|---|
| ID | SC-0500 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | soumettre une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |
