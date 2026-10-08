// PRICEBREAKDOWN — LE LABEUR · composant C-05, invariant INV-1
// [ Prix Prestataire ] + [ Frais SaaS LE LABEUR ] = [ Total Client ]
// Trois lignes, cet ordre exact, ces libellés exacts, sur tout support.
// Aucun calcul côté client : les montants viennent du serveur (centimes entiers).
// ────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useCanopy } from "./useCanopy";

export type Breakdown = {
  currency: string;            // "XOF", "EUR", "USD"…
  providerPriceMinor: number;  // Prix Prestataire — ce que reçoit la personne qui travaille
  saasFeeMinor: number;        // Frais SaaS LE LABEUR — s'AJOUTE, ne se déduit jamais
  totalClientMinor: number;    // Total Client — ce que règle le donneur d'ordre
  feeRateBps?: number;         // taux affiché à titre informatif (10 % → 1000 bps)
  locked?: boolean;            // contrat signé / proposition acceptée : plus de recalcul
  source?: string;             // "simulation" | "contrat M-2026-0142" — traçabilité
};

const ZERO_DECIMAL = new Set(["XOF", "XAF", "JPY", "KRW", "CLP", "VND"]);

/** Formatage monétaire tabulaire, insécable, jamais arrondi de façon invisible. */
export function formatMoney(minor: number, currency: string) {
  const zd = ZERO_DECIMAL.has(currency);
  const value = zd ? minor : minor / 100;
  const digits = zd ? 0 : 2;
  const nf = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: true,
  });
  // Espace fine insécable avant le symbole : jamais de coupure de ligne.
  return `${nf.format(value)}\u202F${currency}`;
}

type Variant = "compact" | "standard" | "sovereign";

export function PriceBreakdown({
  data,
  variant = "standard",
  onExplain,          // ouvre FIN-02 en feuille (jamais une navigation qui perd le contexte)
  intense = 1,
}: {
  data: Breakdown;
  variant?: Variant;
  onExplain?: () => void;
  intense?: number;
}) {
  const canopy = useCanopy({ intensity: intense });
  const [shown, setShown] = useState(data.providerPriceMinor); // compteur animé

  // Compteur tnum : animation UNIQUEMENT sur variation, jamais au premier rendu.
  useEffect(() => {
    const from = shown;
    const to = data.providerPriceMinor;
    if (from === to) return;
    const start = performance.now();
    const d = 240 / Math.max(0.35, intense);
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / d);
      const eased = 1 - Math.pow(1 - k, 3);      // cubic-bezier(0.22,1,0.36,1) approché
      setShown(Math.round(from + (to - from) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.providerPriceMinor]);

  const feeRate = useMemo(
    () => data.feeRateBps != null ? `${(data.feeRateBps / 100).toFixed(data.feeRateBps % 100 === 0 ? 0 : 1)} %` : null,
    [data.feeRateBps]
  );

  // Variante compacte : autorisée SEULEMENT pour les listes (registre de missions).
  // La règle INV-1 impose que le triplet complet reste accessible en un tap.
  if (variant === "compact") {
    return (
      <Pressable
        onPress={onExplain}
        onPressIn={canopy.press}
        onPressOut={canopy.release}
        accessibilityRole="button"
        accessibilityLabel={`Total client ${formatMoney(data.totalClientMinor, data.currency)}. Voir le détail du prix.`}
        style={compact.wrap}
      >
        <Text style={compact.total}>{formatMoney(data.totalClientMinor, data.currency)}</Text>
        <Text style={compact.chevron}>›</Text>
      </Pressable>
    );
  }

  return (
    <View
      style={styles.wrap}
      accessibilityRole="summary"
      // Lecture vocale structurée : les trois montants dans l'ordre, en mots.
      accessibilityLabel={
        `Prix prestataire ${formatMoney(data.providerPriceMinor, data.currency)} ; ` +
        `plus frais SaaS LE LABEUR ${formatMoney(data.saasFeeMinor, data.currency)} ; ` +
        `égale total client ${formatMoney(data.totalClientMinor, data.currency)}.`
      }
    >
      <Row
        label="Prix prestataire"
        value={formatMoney(shown, data.currency)}
        note="Ce que reçoit la personne qui travaille."
        tone="price"
      />
      <Row
        label="Frais SaaS LE LABEUR"
        value={formatMoney(data.saasFeeMinor, data.currency)}
        note={feeRate ? `${feeRate} du prix prestataire — s'ajoute au montant client.` : "S'ajoute au montant client."}
        tone="fee"
      />
      <View style={styles.rule} />
      <Row
        label="Total client"
        value={formatMoney(data.totalClientMinor, data.currency)}
        note={data.source ? `Source : ${data.source}.` : undefined}
        tone="total"
      />

      {variant === "sovereign" && (
        <View style={styles.echeancier}>
          <Text style={styles.echeancierTitle}>Échéancier</Text>
          <Text style={styles.echeancierBody}>
            Acompte 30 % à la sélection · solde 70 % à la validation des preuves.
            Le frais SaaS suit le même rythme : jamais prélevé en avance sur le travail.
          </Text>
        </View>
      )}

      {onExplain && (
        <Pressable onPress={onExplain} style={styles.link} accessibilityRole="link">
          <Text style={styles.linkText}>Pourquoi ces frais ? · Voir le barème</Text>
        </Pressable>
      )}

      {data.locked && (
        <View style={styles.lock}>
          <Text style={styles.lockText}>◆ Montants verrouillés par contrat signé</Text>
        </View>
      )}
    </View>
  );
}

function Row({
  label, value, note, tone,
}: { label: string; value: string; note?: string; tone: "price" | "fee" | "total" }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={[styles.label, tone === "total" && styles.labelTotal]}>{label}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      <Text style={[styles.value, tone === "price" && styles.valuePrice, tone === "total" && styles.valueTotal]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.045)",   // glass-2
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } }, default: { elevation: 6 } }),
  },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingVertical: 7 },
  rowLeft: { flex: 1, paddingRight: 12 },
  label: { color: "#A9A9B8", fontSize: 13, letterSpacing: 0.2 },
  labelTotal: { color: "#F5F5F7", fontSize: 15, fontWeight: "600" },
  note: { color: "#6E6E7E", fontSize: 11, marginTop: 2 },
  value: { color: "#F5F5F7", fontSize: 15, fontVariant: ["tabular-nums"], fontFamily: "JetBrainsMono" },
  valuePrice: { color: "#FFB800" },               // or = la valeur du travail
  valueTotal: { color: "#FFD47A", fontSize: 22, fontWeight: "700" }, // Total client = la somme
  rule: { height: 1, backgroundColor: "rgba(255,255,255,0.14)", marginVertical: 8 },
  link: { marginTop: 12 },
  linkText: { color: "#5CC8FF", fontSize: 12 },
  lock: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  lockText: { color: "#6E6E7E", fontSize: 11 },
  echeancier: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: "rgba(255,184,0,0.06)" },
  echeancierTitle: { color: "#FFD47A", fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 },
  echeancierBody: { color: "#A9A9B8", fontSize: 12, lineHeight: 18 },
});

const compact = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  total: { color: "#FFD47A", fontSize: 15, fontVariant: ["tabular-nums"], fontFamily: "JetBrainsMono" },
  chevron: { color: "#6E6E7E", fontSize: 16 },
});

/* ── CONTRAT DE TEST (obligatoire, INV-1) ───────────────────────────────────
   Le test échoue si :
   1. les trois libellés ne sont pas exactement « Prix prestataire »,
      « Frais SaaS LE LABEUR », « Total client » (toutes langues, tous supports) ;
   2. providerPriceMinor + saasFeeMinor !== totalClientMinor ;
   3. un écran affiche un montant sans que le triplet complet soit atteignable ;
   4. le composant calcule lui-même un montant opposable (il ne fait que rendre) ;
   5. le frais SaaS apparaît en négatif, en déduction, ou soustrait du prix prestataire.
   Périmètre : 120 écrans × 3 plateformes (RN iOS, RN Android, Web).
──────────────────────────────────────────────────────────────────────────── */
