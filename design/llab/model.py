# -*- coding: utf-8 -*-
"""
LE LABEUR — Modèle de données des écrans + constructeurs concis.
Chaque fiche décrit : intention, zones de composition, composants, états,
mouvement, règles métier, données, exécution technique.
"""
from dataclasses import dataclass, field
from typing import List, Tuple, Optional


@dataclass
class Zone:
    idx: int
    kind: str
    label: str
    weight: int
    note: str


@dataclass
class Screen:
    code: str
    title: str
    family: str            # PUB | EMP | PRE | ADM | RTC | SYS | FIN
    cluster: str
    route: str
    role: str              # Public | Client | Prestataire | Admin | Système | Transversal
    criticality: str       # P0 | P1 | P2
    archetype: str
    intent: str
    zones: List[Zone]
    comps: List[Tuple[str, str]]
    states: List[Tuple[str, str]]
    motion: List[Tuple[str, str]]
    rules: List[str]
    tokens: List[str]
    api: List[str] = field(default_factory=list)
    tech: str = ""
    a11y: List[str] = field(default_factory=list)
    canon: str = ""        # écran canonique (regroupement d'états)
    variant_of: Optional[str] = None
    wire_chrome: dict = field(default_factory=dict)


FAMILIES = {
    "PUB": ("Famille 01 · Public & Onboarding", "Ouverture, confiance, entrée dans l'acte de travail."),
    "EMP": ("Famille 02 · Client / Employeur", "Cadrer, qualifier, contracter, payer, prouver."),
    "PRE": ("Famille 03 · Prestataire / Candidat", "Trouver, postuler, exécuter, encaisser, réputation."),
    "ADM": ("Famille 04 · Admin & Supervision", "Voir, décider, réconcilier, protéger."),
    "RTC": ("Famille 05a · WebRTC & Temps réel", "Sessions d'appel : pré-appel, invitation, actif, preuve."),
    "SYS": ("Famille 05b · États système", "Chaque panne a un visage ; chaque sortie a une porte."),
    "FIN": ("Famille 05c · Écran financier transversal", "Le modèle unique d'affichage de la valeur."),
}


def Z(kind: str, label: str, weight: int, note: str) -> Zone:
    return Zone(0, kind, label, weight, note)


def S(code, title, family, cluster, route, role, criticality, archetype, intent,
      zones, comps, states, motion, rules, tokens, api=None, tech="",
      a11y=None, canon="", variant_of=None, chrome=None):
    zs = []
    for i, z in enumerate(zones, 1):
        z.idx = i
        zs.append(z)
    return Screen(
        code=code, title=title, family=family, cluster=cluster, route=route,
        role=role, criticality=criticality, archetype=archetype, intent=intent,
        zones=zs, comps=comps, states=states, motion=motion, rules=rules,
        tokens=tokens, api=api or [], tech=tech, a11y=a11y or [],
        canon=canon or title, variant_of=variant_of,
        wire_chrome=chrome if chrome is not None else {},
    )


# Chromes récurrents par famille (licence UI commune)
CHROME_APP = {"appbar": "LE LABEUR", "dock": ["Accueil", "Missions", "Contrats", "Argent", "Profil"], "glyph": "◈"}
CHROME_PUB = {"glyph": "◇"}
CHROME_ADM = {"appbar": "SUPERVISION", "dock": ["Flux", "Files", "Litiges", "Sécu", "Infra"], "glyph": "◆"}
CHROME_RTC = {"appbar": "SESSION", "glyph": "◉"}


def _flat(screens):
    """Accepte une liste d'écrans ou le dict {famille: [écrans]}."""
    if isinstance(screens, dict):
        return [s for fam in ("PUB", "EMP", "PRE", "ADM", "RTC", "SYS", "FIN") for s in screens.get(fam, [])]
    return list(screens)


def validate(screens):
    """Retourne la liste des problèmes détectés (liste vide = fiche conforme)."""
    all_screens = _flat(screens)
    problems = []
    codes = [s.code for s in all_screens]
    dup = sorted({c for c in codes if codes.count(c) > 1})
    if dup:
        problems.append(f"Codes dupliqués : {dup}")
    for s in all_screens:
        if not s.intent:
            problems.append(f"{s.code} : intention vide")
        if len(s.zones) < 3:
            problems.append(f"{s.code} : moins de 3 zones")
        for field in ("comps", "states", "motion", "rules", "tokens"):
            if not getattr(s, field):
                problems.append(f"{s.code} : champ « {field} » vide")
        if sum(z.weight for z in s.zones) <= 0:
            problems.append(f"{s.code} : poids de zones nuls")
        if s.variant_of is None and not s.canon:
            problems.append(f"{s.code} : canon manquant")
    return problems


def canonical_count(screens):
    return len({s.canon for s in _flat(screens)})
