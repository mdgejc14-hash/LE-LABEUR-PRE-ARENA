# Scénarios SC-0901 à SC-1000

Lot 10/10 — cumul 1000. Tous sont **ANALYSE STATIQUE**; aucune ligne n’est présentée comme exécutée.

## SC-0901
| Champ | Valeur |
|---|---|
| ID | SC-0901 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | finaliser une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | OK |
| Gravité | FAIBLE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0902
| Champ | Valeur |
|---|---|
| ID | SC-0902 |
| Catégorie | REFUS |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | créer une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0903
| Champ | Valeur |
|---|---|
| ID | SC-0903 |
| Catégorie | ANNULATION |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | lire une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0904
| Champ | Valeur |
|---|---|
| ID | SC-0904 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | modifier une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0905
| Champ | Valeur |
|---|---|
| ID | SC-0905 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | soumettre une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0906
| Champ | Valeur |
|---|---|
| ID | SC-0906 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | accepter une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0907
| Champ | Valeur |
|---|---|
| ID | SC-0907 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | refuser une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0908
| Champ | Valeur |
|---|---|
| ID | SC-0908 |
| Catégorie | CONCURRENCE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | annuler une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0909
| Champ | Valeur |
|---|---|
| ID | SC-0909 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | répéter une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0910
| Champ | Valeur |
|---|---|
| ID | SC-0910 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Compte / identité |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | autoriser une opération compte / identité |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose requireActor; assertOperationalActor, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. actorId falsifiable only where mock path is used |
| Fichier(s) | src/repositories/mockRepository.ts |
| Fonction(s) | requireActor; assertOperationalActor |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0911
| Champ | Valeur |
|---|---|
| ID | SC-0911 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | finaliser une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0912
| Champ | Valeur |
|---|---|
| ID | SC-0912 |
| Catégorie | REFUS |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | créer une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0913
| Champ | Valeur |
|---|---|
| ID | SC-0913 |
| Catégorie | ANNULATION |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | lire une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0914
| Champ | Valeur |
|---|---|
| ID | SC-0914 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | modifier une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0915
| Champ | Valeur |
|---|---|
| ID | SC-0915 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | soumettre une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0916
| Champ | Valeur |
|---|---|
| ID | SC-0916 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | accepter une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0917
| Champ | Valeur |
|---|---|
| ID | SC-0917 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | refuser une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0918
| Champ | Valeur |
|---|---|
| ID | SC-0918 |
| Catégorie | CONCURRENCE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | annuler une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0919
| Champ | Valeur |
|---|---|
| ID | SC-0919 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | répéter une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0920
| Champ | Valeur |
|---|---|
| ID | SC-0920 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Offre |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | autoriser une opération offre |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createOffer; updateOfferStatus, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. catalogue server Phase 1 non opérationnel |
| Fichier(s) | src/repositories/interfaces.ts; src/repositories/mockRepository.ts |
| Fonction(s) | createOffer; updateOfferStatus |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0921
| Champ | Valeur |
|---|---|
| ID | SC-0921 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | finaliser une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0922
| Champ | Valeur |
|---|---|
| ID | SC-0922 |
| Catégorie | REFUS |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | créer une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0923
| Champ | Valeur |
|---|---|
| ID | SC-0923 |
| Catégorie | ANNULATION |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | lire une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0924
| Champ | Valeur |
|---|---|
| ID | SC-0924 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | modifier une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0925
| Champ | Valeur |
|---|---|
| ID | SC-0925 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | soumettre une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0926
| Champ | Valeur |
|---|---|
| ID | SC-0926 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | accepter une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0927
| Champ | Valeur |
|---|---|
| ID | SC-0927 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | refuser une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0928
| Champ | Valeur |
|---|---|
| ID | SC-0928 |
| Catégorie | CONCURRENCE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | annuler une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0929
| Champ | Valeur |
|---|---|
| ID | SC-0929 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | répéter une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0930
| Champ | Valeur |
|---|---|
| ID | SC-0930 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Candidature |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | autoriser une opération candidature |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose applyToOffer; withdrawApplication; shortlistApplication; rejectApplication, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. runtime path not executed |
| Fichier(s) | src/repositories/interfaces.ts |
| Fonction(s) | applyToOffer; withdrawApplication; shortlistApplication; rejectApplication |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0931
| Champ | Valeur |
|---|---|
| ID | SC-0931 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | finaliser une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0932
| Champ | Valeur |
|---|---|
| ID | SC-0932 |
| Catégorie | REFUS |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | créer une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0933
| Champ | Valeur |
|---|---|
| ID | SC-0933 |
| Catégorie | ANNULATION |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | lire une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0934
| Champ | Valeur |
|---|---|
| ID | SC-0934 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | modifier une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0935
| Champ | Valeur |
|---|---|
| ID | SC-0935 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | soumettre une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0936
| Champ | Valeur |
|---|---|
| ID | SC-0936 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | accepter une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0937
| Champ | Valeur |
|---|---|
| ID | SC-0937 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | refuser une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0938
| Champ | Valeur |
|---|---|
| ID | SC-0938 |
| Catégorie | CONCURRENCE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | annuler une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0939
| Champ | Valeur |
|---|---|
| ID | SC-0939 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | répéter une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0940
| Champ | Valeur |
|---|---|
| ID | SC-0940 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Proposition |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | autoriser une opération proposition |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendProposal; respondToProposal, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. states declared and repository API exposed |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | sendProposal; respondToProposal |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0941
| Champ | Valeur |
|---|---|
| ID | SC-0941 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | finaliser une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0942
| Champ | Valeur |
|---|---|
| ID | SC-0942 |
| Catégorie | REFUS |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | créer une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0943
| Champ | Valeur |
|---|---|
| ID | SC-0943 |
| Catégorie | ANNULATION |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | lire une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0944
| Champ | Valeur |
|---|---|
| ID | SC-0944 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | modifier une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0945
| Champ | Valeur |
|---|---|
| ID | SC-0945 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | soumettre une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0946
| Champ | Valeur |
|---|---|
| ID | SC-0946 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | accepter une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0947
| Champ | Valeur |
|---|---|
| ID | SC-0947 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | refuser une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0948
| Champ | Valeur |
|---|---|
| ID | SC-0948 |
| Catégorie | CONCURRENCE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | annuler une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0949
| Champ | Valeur |
|---|---|
| ID | SC-0949 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | répéter une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0950
| Champ | Valeur |
|---|---|
| ID | SC-0950 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Contrat |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | autoriser une opération contrat |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose generateContract; signContract; confirmMonthlyAction, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. persistent handler boundary not installed |
| Fichier(s) | src/repositories/interfaces.ts; migrations/0003_core_nucleus_alignment.sql |
| Fonction(s) | generateContract; signContract; confirmMonthlyAction |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0951
| Champ | Valeur |
|---|---|
| ID | SC-0951 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | finaliser une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0952
| Champ | Valeur |
|---|---|
| ID | SC-0952 |
| Catégorie | REFUS |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | créer une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0953
| Champ | Valeur |
|---|---|
| ID | SC-0953 |
| Catégorie | ANNULATION |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | lire une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0954
| Champ | Valeur |
|---|---|
| ID | SC-0954 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | modifier une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0955
| Champ | Valeur |
|---|---|
| ID | SC-0955 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | soumettre une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0956
| Champ | Valeur |
|---|---|
| ID | SC-0956 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | accepter une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | `scheduler.ts` décrit J3 mais déclare un futur Worker/type-only seam; aucun Cron/évaluation/émission fiable n’est trouvé. |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | FONCTIONNALITÉ MANQUANTE |
| Gravité | CRITIQUE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0957
| Champ | Valeur |
|---|---|
| ID | SC-0957 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | refuser une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0958
| Champ | Valeur |
|---|---|
| ID | SC-0958 |
| Catégorie | CONCURRENCE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | annuler une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. J+3 worker is only a future seam |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | KO |
| Gravité | CRITIQUE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0959
| Champ | Valeur |
|---|---|
| ID | SC-0959 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | répéter une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Les champs commission et idempotency existent dans les contrats/interfaces; l’autorité serveur persistante n’est pas opérationnelle dans le worker Phase 1. |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | CRITIQUE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0960
| Champ | Valeur |
|---|---|
| ID | SC-0960 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Paiement / commission |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | autoriser une opération paiement / commission |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | `scheduler.ts` décrit J3 mais déclare un futur Worker/type-only seam; aucun Cron/évaluation/émission fiable n’est trouvé. |
| Fichier(s) | src/repositories/interfaces.ts; src/domain/businessRules.ts |
| Fonction(s) | createPaymentDeclaration; submitPaymentDeclaration; verifyCommissionPayment |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | FONCTIONNALITÉ MANQUANTE |
| Gravité | CRITIQUE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0961
| Champ | Valeur |
|---|---|
| ID | SC-0961 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | finaliser une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0962
| Champ | Valeur |
|---|---|
| ID | SC-0962 |
| Catégorie | REFUS |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | créer une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0963
| Champ | Valeur |
|---|---|
| ID | SC-0963 |
| Catégorie | ANNULATION |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | lire une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0964
| Champ | Valeur |
|---|---|
| ID | SC-0964 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | modifier une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0965
| Champ | Valeur |
|---|---|
| ID | SC-0965 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | soumettre une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0966
| Champ | Valeur |
|---|---|
| ID | SC-0966 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | accepter une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0967
| Champ | Valeur |
|---|---|
| ID | SC-0967 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | refuser une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0968
| Champ | Valeur |
|---|---|
| ID | SC-0968 |
| Catégorie | CONCURRENCE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | annuler une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0969
| Champ | Valeur |
|---|---|
| ID | SC-0969 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | répéter une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0970
| Champ | Valeur |
|---|---|
| ID | SC-0970 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Incident / remplacement |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | autoriser une opération incident / remplacement |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose reportIncident; arbitrateIncident, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. replacement persistence path not proven end-to-end |
| Fichier(s) | src/repositories/interfaces.ts; src/types/index.ts |
| Fonction(s) | reportIncident; arbitrateIncident |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0971
| Champ | Valeur |
|---|---|
| ID | SC-0971 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | finaliser une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0972
| Champ | Valeur |
|---|---|
| ID | SC-0972 |
| Catégorie | REFUS |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | créer une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0973
| Champ | Valeur |
|---|---|
| ID | SC-0973 |
| Catégorie | ANNULATION |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | lire une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0974
| Champ | Valeur |
|---|---|
| ID | SC-0974 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | modifier une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0975
| Champ | Valeur |
|---|---|
| ID | SC-0975 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | soumettre une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0976
| Champ | Valeur |
|---|---|
| ID | SC-0976 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | accepter une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0977
| Champ | Valeur |
|---|---|
| ID | SC-0977 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | refuser une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0978
| Champ | Valeur |
|---|---|
| ID | SC-0978 |
| Catégorie | CONCURRENCE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | annuler une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0979
| Champ | Valeur |
|---|---|
| ID | SC-0979 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | répéter une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0980
| Champ | Valeur |
|---|---|
| ID | SC-0980 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Conversation / message |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | autoriser une opération conversation / message |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose sendMessage; createOrGetConversation; markConversationAsRead, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. participant route is catalogued |
| Fichier(s) | src/repositories/interfaces.ts; src/backend/api/routeContracts.ts |
| Fonction(s) | sendMessage; createOrGetConversation; markConversationAsRead |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0981
| Champ | Valeur |
|---|---|
| ID | SC-0981 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | finaliser une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0982
| Champ | Valeur |
|---|---|
| ID | SC-0982 |
| Catégorie | REFUS |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | créer une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0983
| Champ | Valeur |
|---|---|
| ID | SC-0983 |
| Catégorie | ANNULATION |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | lire une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0984
| Champ | Valeur |
|---|---|
| ID | SC-0984 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | modifier une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0985
| Champ | Valeur |
|---|---|
| ID | SC-0985 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | soumettre une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0986
| Champ | Valeur |
|---|---|
| ID | SC-0986 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | accepter une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0987
| Champ | Valeur |
|---|---|
| ID | SC-0987 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | refuser une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0988
| Champ | Valeur |
|---|---|
| ID | SC-0988 |
| Catégorie | CONCURRENCE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | annuler une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0989
| Champ | Valeur |
|---|---|
| ID | SC-0989 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | répéter une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0990
| Champ | Valeur |
|---|---|
| ID | SC-0990 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Notification |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | autoriser une opération notification |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose markNotificationRead; outbox event contracts, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. event coverage incomplete |
| Fichier(s) | src/types/index.ts; src/backend/services/outbox.ts |
| Fonction(s) | markNotificationRead; outbox event contracts |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0991
| Champ | Valeur |
|---|---|
| ID | SC-0991 |
| Catégorie | PARCOURS NORMAL |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur autorisé et ressource existante |
| Action | finaliser une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur autorisé et ressource existante. |
| Résultat attendu | Finaliser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier parcours normal × variante « acteur autorisé et ressource existante ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0992
| Champ | Valeur |
|---|---|
| ID | SC-0992 |
| Catégorie | REFUS |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | acteur d’un autre rôle |
| Action | créer une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: acteur d’un autre rôle. |
| Résultat attendu | Créer avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier refus × variante « acteur d’un autre rôle ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0993
| Champ | Valeur |
|---|---|
| ID | SC-0993 |
| Catégorie | ANNULATION |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | actorId vide ou inconnu |
| Action | lire une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: actorId vide ou inconnu. |
| Résultat attendu | Lire avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier annulation × variante « actorId vide ou inconnu ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0994
| Champ | Valeur |
|---|---|
| ID | SC-0994 |
| Catégorie | VALIDATION ERRONÉE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | ID d’une autre ressource |
| Action | modifier une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: ID d’une autre ressource. |
| Résultat attendu | Modifier avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier validation erronée × variante « ID d’une autre ressource ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0995
| Champ | Valeur |
|---|---|
| ID | SC-0995 |
| Catégorie | NON-RÉPONSE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | rejeu identique |
| Action | soumettre une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: rejeu identique. |
| Résultat attendu | Soumettre avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier non-réponse × variante « rejeu identique ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0996
| Champ | Valeur |
|---|---|
| ID | SC-0996 |
| Catégorie | DÉLAI DÉPASSÉ |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | double soumission |
| Action | accepter une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: double soumission. |
| Résultat attendu | Accepter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier délai dépassé × variante « double soumission ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0997
| Champ | Valeur |
|---|---|
| ID | SC-0997 |
| Catégorie | ACTIONS CONTRADICTOIRES |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | montant ou date incohérent |
| Action | refuser une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: montant ou date incohérent. |
| Résultat attendu | Refuser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier actions contradictoires × variante « montant ou date incohérent ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0998
| Champ | Valeur |
|---|---|
| ID | SC-0998 |
| Catégorie | CONCURRENCE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | compte bloqué |
| Action | annuler une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: compte bloqué. |
| Résultat attendu | Annuler avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier concurrence × variante « compte bloqué ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-0999
| Champ | Valeur |
|---|---|
| ID | SC-0999 |
| Catégorie | ABUS / FRAUDE |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | réponse serveur perdue puis retry |
| Action | répéter une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: réponse serveur perdue puis retry. |
| Résultat attendu | Répéter avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier abus / fraude × variante « réponse serveur perdue puis retry ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |

## SC-1000
| Champ | Valeur |
|---|---|
| ID | SC-1000 |
| Catégorie | PERSISTANCE / NOTIFICATION |
| Objet(s) | Appel / géographie |
| État initial | type/état déclaré du domaine; ressource existante supposée uniquement pour l’analyse |
| Acteur | deux acteurs simultanés |
| Action | autoriser une opération appel / géographie |
| Préconditions | Identité, ressource et contexte requis; variation testée: deux acteurs simultanés. |
| Résultat attendu | Autoriser avec contrôle d’autorité, garde d’état, mutation atomique, historique et notification si prévue. |
| Comportement réellement trouvé | Le code inspecté expose CallRepository; structured location IDs, mais ce scénario n’a pas été exécuté; la preuve est limitée au chemin statique. no dedicated complete test found |
| Fichier(s) | src/types/index.ts; src/services/calls; src/data/beninLocations.ts |
| Fonction(s) | CallRepository; structured location IDs |
| Test(s) existant(s) | Aucun test dédié identifié pour cette combinaison; suites générales: `src/domain/*.test.ts`, `src/repositories/*test.ts`. |
| Statut | NON VÉRIFIABLE |
| Gravité | MOYENNE |
| Explication | Combinaison métier persistance / notification × variante « deux acteurs simultanés ». Ne pas assimiler une déclaration de type à une transition opérationnelle. |
| Correction proposée | Ajouter un handler serveur transactionnel avec autorité issue de la session, garde d’état, idempotence, audit et test de non-régression ciblé. |
| Exécution | EXECUTÉ = NON — génération et analyse statique; aucun faux résultat d’exécution. |
