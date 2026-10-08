# -*- coding: utf-8 -*-
"""Agrégateur des familles d'écrans."""
import importlib

MODULES = ["pub",
           "emp_a", "emp_b", "emp_c", "emp_d",
           "pre_a", "pre_b", "pre_c", "pre_d",
           "adm_a", "adm_b", "adm_c", "adm_d", "adm_e",
           "rtc", "sys", "fin"]


def load_all(strict=True):
    families = {"PUB": [], "EMP": [], "PRE": [], "ADM": [], "RTC": [], "SYS": [], "FIN": []}
    for m in MODULES:
        try:
            mod = importlib.import_module(f"llab.content.{m}")
        except ModuleNotFoundError:
            if strict:
                raise
            continue
        for s in getattr(mod, "SCREENS", []):
            families[s.family].append(s)
    return families


def stats(families):
    alls = [s for f in families.values() for s in f]
    canons = {s.canon for s in alls}
    codes = [s.code for s in alls]
    dupes = sorted({c for c in codes if codes.count(c) > 1})
    return {
        "total_etats": len(alls),
        "canoniques": len(canons),
        "par_famille": {k: len(v) for k, v in families.items()},
        "dupes": dupes,
        "canons_par_famille": {k: len({s.canon for s in v}) for k, v in families.items()},
    }
