# Scénarios SC-0001 à SC-0100

Lot 1/10 — cumul 100. Tous sont **ANALYSE STATIQUE**; aucune ligne n’est présentée comme exécutée.

## SC-0001
| Champ | Valeur |
|---|---|
| ID | SC-0001 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | créer une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | OK |
| Gravité | FAIBLE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0002
| Champ | Valeur |
|---|---|
| ID | SC-0002 |
| Catégorie | REFUS |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | lire une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0003
| Champ | Valeur |
|---|---|
| ID | SC-0003 |
| Catégorie | ANNULATION |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | modifier une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0004
| Champ | Valeur |
|---|---|
| ID | SC-0004 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | soumettre une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0005
| Champ | Valeur |
|---|---|
| ID | SC-0005 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | accepter une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0006
| Champ | Valeur |
|---|---|
| ID | SC-0006 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | refuser une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0007
| Champ | Valeur |
|---|---|
| ID | SC-0007 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | annuler une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0008
| Champ | Valeur |
|---|---|
| ID | SC-0008 |
| Catégorie | CONCURRENCE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | répéter une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0009
| Champ | Valeur |
|---|---|
| ID | SC-0009 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | autoriser une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0010
| Champ | Valeur |
|---|---|
| ID | SC-0010 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | finaliser une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0011
| Champ | Valeur |
|---|---|
| ID | SC-0011 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | créer une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0012
| Champ | Valeur |
|---|---|
| ID | SC-0012 |
| Catégorie | REFUS |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | lire une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0013
| Champ | Valeur |
|---|---|
| ID | SC-0013 |
| Catégorie | ANNULATION |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | modifier une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0014
| Champ | Valeur |
|---|---|
| ID | SC-0014 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | soumettre une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0015
| Champ | Valeur |
|---|---|
| ID | SC-0015 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | accepter une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0016
| Champ | Valeur |
|---|---|
| ID | SC-0016 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | refuser une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0017
| Champ | Valeur |
|---|---|
| ID | SC-0017 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | annuler une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0018
| Champ | Valeur |
|---|---|
| ID | SC-0018 |
| Catégorie | CONCURRENCE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | répéter une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0019
| Champ | Valeur |
|---|---|
| ID | SC-0019 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | autoriser une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0020
| Champ | Valeur |
|---|---|
| ID | SC-0020 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | finaliser une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0021
| Champ | Valeur |
|---|---|
| ID | SC-0021 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | créer une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0022
| Champ | Valeur |
|---|---|
| ID | SC-0022 |
| Catégorie | REFUS |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | lire une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0023
| Champ | Valeur |
|---|---|
| ID | SC-0023 |
| Catégorie | ANNULATION |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | modifier une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0024
| Champ | Valeur |
|---|---|
| ID | SC-0024 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | soumettre une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0025
| Champ | Valeur |
|---|---|
| ID | SC-0025 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | accepter une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0026
| Champ | Valeur |
|---|---|
| ID | SC-0026 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | refuser une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0027
| Champ | Valeur |
|---|---|
| ID | SC-0027 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | annuler une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0028
| Champ | Valeur |
|---|---|
| ID | SC-0028 |
| Catégorie | CONCURRENCE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | répéter une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0029
| Champ | Valeur |
|---|---|
| ID | SC-0029 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | autoriser une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0030
| Champ | Valeur |
|---|---|
| ID | SC-0030 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | finaliser une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0031
| Champ | Valeur |
|---|---|
| ID | SC-0031 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | créer une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0032
| Champ | Valeur |
|---|---|
| ID | SC-0032 |
| Catégorie | REFUS |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | lire une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0033
| Champ | Valeur |
|---|---|
| ID | SC-0033 |
| Catégorie | ANNULATION |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | modifier une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0034
| Champ | Valeur |
|---|---|
| ID | SC-0034 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | soumettre une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0035
| Champ | Valeur |
|---|---|
| ID | SC-0035 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | accepter une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0036
| Champ | Valeur |
|---|---|
| ID | SC-0036 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | refuser une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0037
| Champ | Valeur |
|---|---|
| ID | SC-0037 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | annuler une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0038
| Champ | Valeur |
|---|---|
| ID | SC-0038 |
| Catégorie | CONCURRENCE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | répéter une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0039
| Champ | Valeur |
|---|---|
| ID | SC-0039 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | autoriser une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0040
| Champ | Valeur |
|---|---|
| ID | SC-0040 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | finaliser une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0041
| Champ | Valeur |
|---|---|
| ID | SC-0041 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | créer une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0042
| Champ | Valeur |
|---|---|
| ID | SC-0042 |
| Catégorie | REFUS |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | lire une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0043
| Champ | Valeur |
|---|---|
| ID | SC-0043 |
| Catégorie | ANNULATION |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | modifier une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0044
| Champ | Valeur |
|---|---|
| ID | SC-0044 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | soumettre une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0045
| Champ | Valeur |
|---|---|
| ID | SC-0045 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | accepter une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0046
| Champ | Valeur |
|---|---|
| ID | SC-0046 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | refuser une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0047
| Champ | Valeur |
|---|---|
| ID | SC-0047 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | annuler une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0048
| Champ | Valeur |
|---|---|
| ID | SC-0048 |
| Catégorie | CONCURRENCE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | répéter une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0049
| Champ | Valeur |
|---|---|
| ID | SC-0049 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | autoriser une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0050
| Champ | Valeur |
|---|---|
| ID | SC-0050 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | finaliser une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0051
| Champ | Valeur |
|---|---|
| ID | SC-0051 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | créer une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0052
| Champ | Valeur |
|---|---|
| ID | SC-0052 |
| Catégorie | REFUS |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | lire une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0053
| Champ | Valeur |
|---|---|
| ID | SC-0053 |
| Catégorie | ANNULATION |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | modifier une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0054
| Champ | Valeur |
|---|---|
| ID | SC-0054 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | soumettre une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0055
| Champ | Valeur |
|---|---|
| ID | SC-0055 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | accepter une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0056
| Champ | Valeur |
|---|---|
| ID | SC-0056 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | refuser une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | `scheduler.ts` décrit J3 mais déclare un futur Worker/type-only seam; aucun Cron/évaluation/émission fiable n’est trouvé. |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | FONCTIONNALITÉ MANQUANTE |
| Gravité | CRITIQUE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0057
| Champ | Valeur |
|---|---|
| ID | SC-0057 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | annuler une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0058
| Champ | Valeur |
|---|---|
| ID | SC-0058 |
| Catégorie | CONCURRENCE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | répéter une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0059
| Champ | Valeur |
|---|---|
| ID | SC-0059 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | autoriser une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Les champs commission et idempotency existent dans les contrats/interfaces; l’autorité serveur persistante n’est pas opérationnelle dans le worker Phase 1. |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | CRITIQUE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0060
| Champ | Valeur |
|---|---|
| ID | SC-0060 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | finaliser une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | `scheduler.ts` décrit J3 mais déclare un futur Worker/type-only seam; aucun Cron/évaluation/émission fiable n’est trouvé. |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | FONCTIONNALITÉ MANQUANTE |
| Gravité | CRITIQUE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0061
| Champ | Valeur |
|---|---|
| ID | SC-0061 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | créer une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0062
| Champ | Valeur |
|---|---|
| ID | SC-0062 |
| Catégorie | REFUS |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | lire une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0063
| Champ | Valeur |
|---|---|
| ID | SC-0063 |
| Catégorie | ANNULATION |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | modifier une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0064
| Champ | Valeur |
|---|---|
| ID | SC-0064 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | soumettre une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0065
| Champ | Valeur |
|---|---|
| ID | SC-0065 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | accepter une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0066
| Champ | Valeur |
|---|---|
| ID | SC-0066 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | refuser une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0067
| Champ | Valeur |
|---|---|
| ID | SC-0067 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | annuler une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0068
| Champ | Valeur |
|---|---|
| ID | SC-0068 |
| Catégorie | CONCURRENCE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | répéter une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0069
| Champ | Valeur |
|---|---|
| ID | SC-0069 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | autoriser une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0070
| Champ | Valeur |
|---|---|
| ID | SC-0070 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | finaliser une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0071
| Champ | Valeur |
|---|---|
| ID | SC-0071 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | créer une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0072
| Champ | Valeur |
|---|---|
| ID | SC-0072 |
| Catégorie | REFUS |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | lire une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0073
| Champ | Valeur |
|---|---|
| ID | SC-0073 |
| Catégorie | ANNULATION |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | modifier une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0074
| Champ | Valeur |
|---|---|
| ID | SC-0074 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | soumettre une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0075
| Champ | Valeur |
|---|---|
| ID | SC-0075 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | accepter une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0076
| Champ | Valeur |
|---|---|
| ID | SC-0076 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | refuser une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0077
| Champ | Valeur |
|---|---|
| ID | SC-0077 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | annuler une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0078
| Champ | Valeur |
|---|---|
| ID | SC-0078 |
| Catégorie | CONCURRENCE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | répéter une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0079
| Champ | Valeur |
|---|---|
| ID | SC-0079 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | autoriser une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0080
| Champ | Valeur |
|---|---|
| ID | SC-0080 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | finaliser une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0081
| Champ | Valeur |
|---|---|
| ID | SC-0081 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | créer une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0082
| Champ | Valeur |
|---|---|
| ID | SC-0082 |
| Catégorie | REFUS |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | lire une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0083
| Champ | Valeur |
|---|---|
| ID | SC-0083 |
| Catégorie | ANNULATION |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | modifier une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0084
| Champ | Valeur |
|---|---|
| ID | SC-0084 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | soumettre une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0085
| Champ | Valeur |
|---|---|
| ID | SC-0085 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | accepter une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0086
| Champ | Valeur |
|---|---|
| ID | SC-0086 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | refuser une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0087
| Champ | Valeur |
|---|---|
| ID | SC-0087 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | annuler une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0088
| Champ | Valeur |
|---|---|
| ID | SC-0088 |
| Catégorie | CONCURRENCE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | répéter une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0089
| Champ | Valeur |
|---|---|
| ID | SC-0089 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | autoriser une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0090
| Champ | Valeur |
|---|---|
| ID | SC-0090 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | finaliser une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0091
| Champ | Valeur |
|---|---|
| ID | SC-0091 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | créer une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0092
| Champ | Valeur |
|---|---|
| ID | SC-0092 |
| Catégorie | REFUS |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | lire une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0093
| Champ | Valeur |
|---|---|
| ID | SC-0093 |
| Catégorie | ANNULATION |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | modifier une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0094
| Champ | Valeur |
|---|---|
| ID | SC-0094 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | soumettre une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0095
| Champ | Valeur |
|---|---|
| ID | SC-0095 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | accepter une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0096
| Champ | Valeur |
|---|---|
| ID | SC-0096 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | refuser une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0097
| Champ | Valeur |
|---|---|
| ID | SC-0097 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | annuler une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0098
| Champ | Valeur |
|---|---|
| ID | SC-0098 |
| Catégorie | CONCURRENCE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | répéter une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0099
| Champ | Valeur |
|---|---|
| ID | SC-0099 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | autoriser une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0100
| Champ | Valeur |
|---|---|
| ID | SC-0100 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | finaliser une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |
