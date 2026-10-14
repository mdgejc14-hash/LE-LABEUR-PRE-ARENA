#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vérification des références de la cartographie (lecture seule).

Usage (racine du dépôt) :
    python3 docs/architecture/cartographie-globale/outils/verifier_liens.py

Contrôles :
  1. chaque référence `fichier.ext:L` ou `fichier.ext:L1-L2,L3` citée dans les .md et .mmd du dossier désigne un fichier
     existant du dépôt (chemin complet, ou nom de base unique dans le dépôt) et des lignes ≤ longueur du fichier ;
  2. chaque lien Markdown relatif `[..](cible)` pointe vers un fichier existant du dossier ;
  3. chaque clé de contrat citée entre backticks (forme `domaine.action`) qui ressemble à une clé d'API existe dans
     `donnees/contrats-api.json` (signalée sinon, à titre informatif) ;
  4. chaque bloc `<!-- DIAGRAMME:x -->` correspond à `diagrammes/x.mmd`.
Sortie : liste des anomalies ; code de sortie 1 si une référence de fichier/ligne ou un lien est invalide.
"""
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parents[1]
EXT = r'(?:tsx|ts|mts|py|sql|toml|json|md|mmd|css)'
REF = re.compile(r'(?<![\w/.-])((?:[\w.-]+/)*[\w.-]+\.' + EXT + r'):(\d+(?:\s*[-–…]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–…]\s*\d+)?)*)')
LINK = re.compile(r'\]\(([^)#\s]+)(?:#[^)]*)?\)')
DIAG = re.compile(r'<!-- DIAGRAMME:([\w-]+) -->')
KEY = re.compile(r'`((?:admin|auth|offers|applications|proposals|contracts|payments|claims|replacements|reputation|documents|notifications|matching|webrtc|webhooks|messages|calls|incidents|resources|schedules|users|me)\.[\w.-]+)`')

tracked = subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True, text=True).stdout.split()
by_base = defaultdict(list)
for t in tracked:
    by_base[Path(t).name].append(t)
by_suffix = tracked


def resolve(ref: str):
    if (ROOT / ref).is_file():
        return ref
    cands = [t for t in by_suffix if t.endswith('/' + ref) or t == ref]
    if len(cands) == 1:
        return cands[0]
    if '/' not in ref and len(by_base.get(ref, [])) == 1:
        return by_base[ref][0]
    if (OUT / ref).is_file():
        return str((OUT / ref).relative_to(ROOT))
    return None if not cands else ('AMBIGU', cands)


def main() -> int:
    contracts = {c['key'] for c in json.loads((OUT / 'donnees' / 'contrats-api.json').read_text())}
    errors, ambiguous, unknown_keys = [], [], set()
    checked = 0
    files = sorted(OUT.glob('*.md')) + sorted((OUT / 'diagrammes').glob('*.mmd')) + sorted((OUT / 'diagrammes').glob('*.md')) + sorted((OUT / 'outils').glob('*.md'))
    for doc in files:
        text = doc.read_text()
        for m in REF.finditer(text):
            ref, lines = m.group(1), m.group(2)
            target = resolve(ref)
            checked += 1
            if target is None:
                errors.append(f'{doc.name}: fichier introuvable « {ref} »')
                continue
            if isinstance(target, tuple):
                ambiguous.append(f'{doc.name}: « {ref} » ambigu ({len(target[1])} fichiers)')
                continue
            n = len((ROOT / target).read_text(errors='replace').splitlines())
            nums = [int(x) for x in re.findall(r'\d+', lines)]
            if max(nums) > n:
                errors.append(f'{doc.name}: {ref}:{lines} dépasse la longueur ({n} lignes) de {target}')
        for m in LINK.finditer(text):
            tgt = m.group(1)
            if tgt.startswith('http'):
                continue
            if not (doc.parent / tgt).exists():
                errors.append(f'{doc.name}: lien relatif cassé « {tgt} »')
        for m in DIAG.finditer(text):
            if not (OUT / 'diagrammes' / (m.group(1) + '.mmd')).exists():
                errors.append(f'{doc.name}: diagramme absent « {m.group(1)} »')
        for m in KEY.finditer(text):
            k = m.group(1).rstrip('.')
            if k not in contracts and not k.endswith(('.ts', '.tsx', '.mmd', '.md')):
                unknown_keys.add(k)
    print(f'références fichier:ligne vérifiées : {checked}')
    print(f'anomalies bloquantes : {len(errors)}')
    for e in errors:
        print('  ERREUR', e)
    print(f'références ambiguës (nom de base partagé, non vérifiées) : {len(ambiguous)}')
    for a in ambiguous:
        print('  AMBIGU', a)
    print(f'notations `domaine.x` absentes des contrats (abréviations ou motifs, à relire) : {len(unknown_keys)}')
    for k in sorted(unknown_keys):
        print('  INFO', k)
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
