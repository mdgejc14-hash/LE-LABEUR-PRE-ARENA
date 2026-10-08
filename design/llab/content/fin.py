# -*- coding: utf-8 -*-
"""FAMILLE 05c · ÉCRAN FINANCIER TRANSVERSAL — FIN-01 → FIN-03
Modèle d'affichage unique et obligatoire :
[ Prix Prestataire ] + [ Frais SaaS LE LABEUR ] = [ Total Client ]
"""
from ..model import S, Z

CHROME_FIN = {"glyph": "◈"}

SCREENS = [

S("FIN-01", "Triplet financier (composant transversal)", "FIN", "Modèle financier", "(composant C-05 — partout)", "Transversal", "P0", "La vérité de la valeur",
  intent="Le composant le plus important du produit : trois lignes, un ordre immuable, une typographie qui rend la lecture "
         "instantanée. Il apparaît sur tout écran où un montant existe — onboarding, création, contrats, paiements, litiges, "
         "reçus, exports, e-mails. Toute divergence est un défaut critique.",
  zones=[
    Z("price", "Les trois lignes canoniques", 7, "PRIX PRESTATAIRE (or, --price, le montant que reçoit la personne qui travaille) + FRAIS SAAS LE LABEUR (blanc cassé, taux ET montant affichés) = TOTAL CLIENT (--display-1, or plein, le montant payé par le donneur d'ordre). Alignement tabulaire droit, séparateurs en pointillés, jamais de colonnes décalées."),
    Z("list", "Variantes de densité", 3, "Compact (liste de missions : seule la ligne « Total client » avec chevron) · Standard (trois lignes) · Souverain (trois lignes + explication de chaque poste + échéancier). La variante compacte n'est autorisée que si le triplet complet est accessible en un tap."),
    Z("kpi", "Règles d'affichage", 3, "Rouge interdit · barré autorisé uniquement pour un avant/après explicite · la ligne des frais n'est jamais masquée ni fondue dans le prix · les trois valeurs sont toujours des nombres réels (jamais des %) sauf mention d'un taux en complément."),
  ],
  comps=[("C-05 PriceBreakdown", "composant unique, implémenté deux fois maximum (RN + Web)"),
         ("Chiffres tabulaires", "Inter tnum, espace fine insécable avant le symbole monétaire"),
         ("Taux des frais", "affiché à côté du montant (« 10 % — 25 000 F »), base de calcul explicite"),
         ("Lien « pourquoi ? »", "ouvre FIN-02 en sheet, jamais une redirection qui ferait perdre le contexte")],
  states=[("Lecture", "rendu neutre, aucune animation."),
          ("Calcul en direct", "compteurs tnum, 240 ms, jamais de valeur intermédiaire fausse."),
          ("Avant/après (avenant, négociation)", "ancien total barré en fine ligne, nouveau total en or."),
          ("Verrouillé (proposition acceptée, contrat signé)", "cadenas ardoise discret : ces montants ne bougeront plus."),
          ("Devise étrangère", "devise d'origine en principal, conversion avec taux daté en mention secondaire.")],
  motion=[("Compteur", "interpolation tnum 240 ms sur variation (jamais sur le premier rendu)"),
          ("Validation", "sceau or qui s'imprime sur le total, haptique heavy, 480 ms"),
          ("Panel « pourquoi ? »", "sheet glass-3 420 ms, retour au même scroll")],
  rules=["INV-1, non négociable : trois lignes, cet ordre exact, ces libellés exacts, en toutes langues et sur tous supports (y compris PDF, e-mails, exports CSV).",
         "Le prestataire ne voit QU'UNE ligne (son prix) ; le client voit les TROIS ; l'admin voit les trois plus les écritures. Jamais d'autre configuration.",
         "Le frais SaaS n'est jamais prélevé sur la rémunération du travailleur : il s'ajoute au montant du client (modèle « au-dessus », jamais « au détriment »).",
         "Aucun montant ne peut être affiché sans sa devise, sa date de calcul (si simulé) et sa source (contrat, barème, simulation).",
         "Un test end-to-end parcourt les 120 écrans canoniques et échoue si un montant apparaît sans triplet accessible."],
  tokens=["--display-1", "--price", "--gold-500", "--gold-300", "--text-hi", "--text-mid", "--mono"],
  api=["GET /v1/pricing/breakdown?missionId=", "POST /v1/pricing/quote (calcul serveur unique)"],
  tech="Source de vérité serveur : le client n'a jamais le droit de calculer un montant opposable. Le composant est "
       "versionné (FIN v1) et son rendu est vérifié par snapshot automatique sur les trois plateformes.",
  a11y=["Lecture vocale structurée en liste de définitions : « Prix prestataire 250 000 francs ; plus frais SaaS LE LABEUR "
        "25 000 francs ; égale total client 275 000 francs. »",
        "Les libellés sont du texte réel (jamais des images) et les montants atteignent le contraste AAA."],
  canon="FIN — triplet transversal", chrome=CHROME_FIN),

S("FIN-02", "Détail et justification des frais SaaS", "FIN", "Modèle financier", "(sheet depuis toute occurrence du triplet)", "Transversal", "P0", "Expliquer la marge",
  intent="Assumer le modèle économique : à quoi sert le frais SaaS, sur quelle base il est calculé, ce qu'il finance "
         "concrètement (preuves, contrats, médiation, sécurité), et pourquoi il n'est jamais pris sur le salaire.",
  zones=[
    Z("price", "Calcul en clair", 4, "Base (prix prestataire) × taux (barème de la catégorie) = montant des frais. Barème applicable cité et daté. Si des frais fixes ou planchers existent, ils sont détaillés ligne à ligne."),
    Z("list", "Ce que finance le frais SaaS", 5, "Six postes présentés factuellement : hébergement et bord sécurisé · stockage et intégrité des preuves (R2) · moteur de contrats et de signatures · modération des litiges (humaine) · vérification des pièces · conformité et audit. Chaque poste avec son ordre de grandeur de coût si communicable."),
    Z("table", "Barème par catégorie", 3, "Table : catégorie, taux, plancher éventuel, plafond éventuel. Transparent, daté, versionné. Aucune catégorie cachée."),
    Z("kpi", "Garanties", 3, "Trois promesses vérifiables : le travailleur ne paie rien · le frais ne dépasse jamais le barème affiché · toute évolution du barème est annoncée avant application (30 jours)."),
  ],
  comps=[("Table de barème", "taux, planchers, plafonds, version"),
         ("Carte de postes", "chaque poste avec sa justification concrète"),
         ("Historique de barème", "versions datées, changements annoncés"),
         ("Assurance pour le travailleur", "explique la garantie (fraude, impayé) financée en partie par le frais")],
  states=[("Consultation", "lecture, ton neutre."),
          ("Barème en évolution", "bandeau ambre : « nouveau barème au 01/01 — voici ce qui change pour vous » (delta chiffré)."),
          ("Négociation pro", "si un client a un tarif négocié, il est affiché avec sa référence contractuelle."),
          ("Catégorie exonérée", "certaines catégories peuvent être exonérées (ex. insertion) : mention explicite et raison.")],
  motion=[("Sheet", "montée 420 ms, retour au contexte préservé"),
          ("Barème", "table qui se stabilise, aucune animation parasite")],
  rules=["Le barème est public, versionné et daté : aucun frais surprise, aucune variation par utilisateur non contractuelle.",
         "Les évolutions de barème s'appliquent aux NOUVEAUX contrats uniquement, jamais rétroactivement aux contrats signés.",
         "Le ton est explicatif, jamais défensif : LE LABEUR assume son modèle.",
         "Aucune donnée de coût interne sensible (contrats fournisseurs) n'est exposée : des ordres de grandeur suffisent."],
  tokens=["--gold-500", "--text-mid", "--mono", "--glass-3", "--surface-2"],
  api=["GET /v1/pricing/saas-fee?category=&amount=", "GET /v1/pricing/schedule/versions"],
  tech="Barème servi par le service de tarification (données versionnées), avec historique complet. Le calcul affiché est "
       "strictement celui du serveur (jamais re-dérivé côté client).",
  canon="FIN — justification des frais", chrome=CHROME_FIN),

S("FIN-03", "Preuve & export financier", "FIN", "Modèle financier", "(reçus, attestations, exports comptables)", "Transversal", "P0", "Le document qui prouve",
  intent="Tout montant affiché doit pouvoir être exporté et vérifié : reçu, attestation de revenus, facture, export "
         "comptable — tous scellés par empreinte. La confiance financière se prouve, elle ne se déclare pas.",
  zones=[
    Z("doc", "Documents générés", 5, "Quatre documents : reçu de salaire (travailleur) · facture (client) · attestation de revenus (12 mois) · dossier financier de mission (contrat + échéances + preuves + OTP). Chacun avec son gabarit, sa langue et sa devise."),
    Z("sign", "Scellement", 4, "Empreinte SHA-256 par document (Mono, copiable) · QR de vérification publique · horodatage serveur · mention de la version du format (FIN v1). Un vérificateur public permet de contrôler un document reçu d'un tiers."),
    Z("table", "Exports de masse", 3, "Table : export, périmètre (période, rôle), format (CSV, PDF), empreinte, expiration du lien, journal d'usage (qui a exporté, quand, pourquoi)."),
    Z("kpi", "Conformité", 3, "« Les documents financiers sont conservés 10 ans. » · « Aucun montant affiché n'est absent des exports. » · « Un export contient exactement ce que l'écran montre » (test automatique)."),
  ],
  comps=[("Gabarits de documents", "PDF/A, police embarquée, impression propre (fond clair en export)"),
         ("Vérificateur public", "page /verify/:token, sans donnée personnelle, résultat conforme/non conforme"),
         ("File d'export", "génération asynchrone, notification, lien signé 24 h"),
         ("Journal d'usage", "chaque export est tracé (RGPD et anti-fraude)")],
  states=[("Disponible", "documents générables immédiatement."),
          ("Génération en cours", "tâche asynchrone avec progression réelle."),
          ("Export volumineux", "file prioritaire basse, notification à la fin, jamais de blocage d'interface."),
          ("Document purgé", "au-delà de la rétention (rare) : mention explicite, jamais de silence."),
          ("Vérification externe", "un tiers scanne le QR : résultat conforme/non conforme, sans accès aux montants.")],
  motion=[("Génération", "sceau or→émeraude au succès, haptique medium"),
          ("Vérification", "sceau émeraude plein, mention d'horodatage pour les documents anciens (sceau vieilli)")],
  rules=["Un document financier ne peut jamais diverger de l'écran : test automatique de cohérence sur tous les gabarits.",
         "Aucun document financier n'est supprimable par l'utilisateur (obligation légale), mais tous sont exportables.",
         "Le QR de vérification n'expose aucune donnée personnelle : il porte un jeton opaque vérifié côté serveur.",
         "Le modèle FIN (trois lignes) s'applique aussi dans les e-mails et les PDF : le contrôle est automatisé (linter de gabarits, ADM-42)."],
  tokens=["--mono", "--gold-500", "--emerald-500", "--glass-1"],
  api=["GET /v1/documents/financial/:type.pdf", "GET /v1/verify/:token (public)", "POST /v1/exports/financial {scope, format}"],
  tech="Génération PDF/A côté serveur (jamais côté client), stockage R2 avec object lock 10 ans, empreintes chaînées au "
       "ledger. La page de vérification recalcule l'empreinte et ne révèle rien d'autre que la conformité.",
  canon="FIN — preuves & exports", chrome=CHROME_FIN),
]
