# -*- coding: utf-8 -*-
"""
LE LABEUR — Consolidation de production
=======================================
211 états d'interface → 176 écrans canoniques logiques → **120 unités de production**.

Une unité de production = un écran réellement à concevoir et à livrer (même coquille,
mêmes composants, mêmes contrats d'API), pouvant décliner plusieurs canons en états
internes. La table ci-dessous est explicite, auditée et versionnée.
"""
from .content import load_all

# (label d'unité, [canons regroupés dans cette unité])
GROUPS = [
    # ── EMP : 44 canons → 32 unités ──────────────────────────────────────────
    ("Aperçu & confirmation de publication", ["Aperçu de publication", "Confirmation de publication"]),
    ("Candidatures — file client & filtres", ["Candidatures — file client", "Candidatures — filtres avancés"]),
    ("Matching — classement, run & explication", ["Matching — classement & run", "Matching — explication"]),
    ("Sélection & proposition (émission et suivi)", ["Sélection & proposition (émission)", "Sélection — confirmation & suivi"]),
    ("Propositions — registre & expirations", ["Propositions — registre", "Propositions — expirations"]),
    ("Proposition — négociation, acceptation, retrait",
     ["Proposition — négociation & acceptation", "Proposition — état & attente", "Proposition — retrait", "Propositions — acceptation"]),
    ("Paiement externe — déclaration & vérification", ["Paiement externe — déclaration", "Paiement externe — vérification"]),
    ("Paiements client — échéances & échéancier", ["Paiements client — échéances", "Paiements — échéancier"]),
    ("Litige — fiche, pièces & résolution", ["Litige — fiche & pièces", "Litige — résolution & clôture"]),
    ("Litige — décision, escalade & clôture", ["Litige — décision & clôture", "Litige — escalade & attente"]),

    # ── PRE : 38 canons → 27 unités ──────────────────────────────────────────
    ("Candidature — suivi & questions", ["Candidature — suivi", "Candidature — questions & réponses"]),
    ("Candidatures — registre & archive", ["Candidatures — registre prestataire", "Candidatures — archive"]),
    ("Propositions reçues — registre & historique", ["Propositions reçues — registre", "Propositions — historique prestataire"]),
    ("Contrat prestataire — folio, états & révision", ["Contrat prestataire — folio & états", "Contrat — révision (prestataire)"]),
    ("Exécution — suivi & validation reçue", ["Exécution — suivi prestataire", "Exécution — validation reçue"]),
    ("Salaire — déclaré par le client & réconciliation", ["Salaire — déclaré par le client", "Salaire — vérification & réconciliation"]),
    ("Salaire — attendu, échéances & relances", ["Salaire — attendu & échéances", "Salaire — retard & relance"]),
    ("Salaire — OTP de réception & reçu", ["Salaire — OTP de réception", "Salaire — reçu & preuve (prestataire)"]),
    ("Remplacement — transition, reprise & sortie", ["Remplacement — transition & sortie", "Remplacement — reprise (entrant)"]),
    ("Réputation — synthèse & ledger", ["Réputation — synthèse", "Réputation — ledger"]),
    ("Documents — bibliothèque, dépôt, vérification & historique",
     ["Documents — bibliothèque", "Documents — dépôt & vérification", "Documents — historique"]),

    # ── ADM : 59 canons → 33 unités ──────────────────────────────────────────
    ("ADM — utilisateurs (liste & fiche)", ["ADM — utilisateurs (liste)", "ADM — utilisateur (fiche)"]),
    ("ADM — qualification (file & revue)", ["ADM — qualification (file)", "ADM — qualification (revue)"]),
    ("ADM — matching (runs & règles)", ["ADM — matching (runs)", "ADM — matching (règles)"]),
    ("ADM — contrat (fiche, incidents & journal)",
     ["ADM — contrat (fiche)", "ADM — contrat (incidents)", "ADM — contrat (journal)"]),
    ("ADM — paiements (vue globale & réconciliation)", ["ADM — paiements (vue globale)", "ADM — réconciliation"]),
    ("ADM — paiements (anomalies, déclarations & incidents)",
     ["ADM — paiements (anomalies)", "ADM — déclarations externes", "ADM — incident financier"]),
    ("ADM — salaire (confirmations & preuves OTP)", ["ADM — salaire (confirmations)", "ADM — salaire (preuves OTP)"]),
    ("ADM — litige (fiche & pièces)", ["ADM — litige (fiche)", "ADM — litige (pièces)"]),
    ("ADM — remplacements (file & arbitrage)", ["ADM — remplacements (file)", "ADM — remplacement (arbitrage)"]),
    ("ADM — réputation (ledger, corrections & audit)",
     ["ADM — réputation (ledger & corrections)", "ADM — réputation (audit)"]),
    ("ADM — documents (registre & audit)", ["ADM — documents (registre)", "ADM — documents (audit)"]),
    ("ADM — documents (vérification & quarantaine)", ["ADM — documents (vérification)", "ADM — documents (quarantaine)"]),
    ("ADM — notifications (orchestration, gabarits & délivrabilité)",
     ["ADM — notifications (orchestration)", "ADM — notifications (gabarits)", "ADM — notifications (délivrabilité)"]),
    ("ADM — ops (queues, jobs & cron)", ["ADM — ops (queues)", "ADM — ops (jobs)", "ADM — ops (cron)"]),
    ("ADM — ops (SLO & incident)", ["ADM — ops (SLO)", "ADM — ops (incident)"]),
    ("ADM — sécurité (dashboard & IDOR)", ["ADM — sécurité (dashboard)", "ADM — sécurité (IDOR)"]),
    ("ADM — sécurité (replay, signatures, rate limits & webhooks)",
     ["ADM — sécurité (replay)", "ADM — sécurité (rate limits)", "ADM — sécurité (webhooks)"]),
    ("ADM — sécurité (incidents & audit)", ["ADM — sécurité (incidents)", "ADM — sécurité (audit)"]),
    ("ADM — infra (topologie & bord)", ["ADM — infra (topologie)", "ADM — infra (worker edge)"]),
    ("ADM — infra (données : PostgreSQL & stockage objet)", ["ADM — infra (postgres)", "ADM — infra (R2)"]),

    # ── RTC : 8 canons → 5 unités ────────────────────────────────────────────
    ("RTC — pré-appel & diagnostic réseau", ["RTC — pré-appel", "RTC — diagnostic"]),
    ("RTC — invitation & connexion", ["RTC — invitation", "RTC — connexion"]),
    ("RTC — fin de session & historique", ["RTC — fin de session", "RTC — sessions historiques"]),

    # ── SYS : 15 canons → 10 unités ──────────────────────────────────────────
    ("SYS — accès refusé (401 & 403)", ["SYS — 401", "SYS — 403"]),
    ("SYS — erreurs serveur (500, 502, 503 & 504)",
     ["SYS — 500", "SYS — 502", "SYS — 503", "SYS — 504"]),
    ("SYS — limites (429 & quotas)", ["SYS — 429", "SYS — limites"]),
]

UNIT_MAP = {}
for label, members in GROUPS:
    for m in members:
        UNIT_MAP[m] = label


def unit_of(canon):
    return UNIT_MAP.get(canon, canon)


def analyses(families=None):
    families = families or load_all()
    alls = [s for f in families.values() for s in f]
    canons = {s.canon for s in alls}
    units = {unit_of(c) for c in canons}
    per_family = {fam: len({unit_of(s.canon) for s in screens}) for fam, screens in families.items()}
    unknown = [k for k in UNIT_MAP if k not in canons]
    return {
        "etats": len(alls),
        "canons": len(canons),
        "unites": len(units),
        "unites_par_famille": per_family,
        "cles_orphelines": unknown,
    }


if __name__ == "__main__":
    import json
    print(json.dumps(analyses(), ensure_ascii=False, indent=1))
