// OTPPROOF — LE LABEUR · composant C-07 + C-04 (sceau de validation)
// La preuve OTP atteste la réception RÉELLE du salaire par le travailleur.
// Invariant INV-4 : un salaire n'est jamais affiché « payé » sans cette preuve.
// ────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useCanopy, HAPTIC } from "./useCanopy";

export type OtpProofData = {
  proof: string;          // empreinte publique 12 caractères (jamais un code secret)
  issuedAt: string;       // ISO — horodatage serveur
  amountMinor: number;    // montant reçu, en centimes
  currency: string;
  method: "mobile_money" | "bank" | "cash_declared" | "provider_wallet";
  verified: boolean;      // vérifié par le PSP (true) ou déclaré (false, ton neutre)
  disputeWindowDays?: number;
};

/** 12 caractères, groupes de 4 : lisible, dictable, vérifiable au téléphone. */
export function formatProof(raw: string) {
  return raw.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 12).replace(/(.{4})(?=.)/g, "$1-");
}

export function OtpProof({
  data,
  onCopy,
  onDispute,
  intense = 1,
}: {
  data: OtpProofData;
  onCopy?: () => void;
  onDispute?: () => void;
  intense?: number;
}) {
  const canopy = useCanopy({ intensity: intense });
  const [copied, setCopied] = useState(false);
  const stamped = useRef(new Animated.Value(data.verified ? 0 : 1)).current;

  // Le sceau s'imprime UNE SEULE FOIS, à l'apparition de la preuve vérifiée.
  useEffect(() => {
    if (!data.verified) return;
    Animated.sequence([
      Animated.delay(120),
      Animated.spring(stamped, { toValue: 1, stiffness: 300, damping: 20, mass: 1, useNativeDriver: true }),
    ]).start(() => HAPTIC.heavy());
  }, [data.verified, stamped]);

  const copy = useCallback(async () => {
    await Clipboard.setStringAsync(data.proof);
    HAPTIC.medium();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    onCopy?.();
  }, [data.proof, onCopy]);

  const label =
    `Preuve de réception ${formatProof(data.proof)}, ` +
    `émise le ${new Date(data.issuedAt).toLocaleDateString("fr-FR")}. ` +
    (data.verified ? "Vérifiée par le prestataire de paiement." : "Déclarée par le client, en attente de vérification.");

  return (
    <View style={styles.wrap} accessibilityRole="summary" accessibilityLabel={label}>
      <View style={styles.head}>
        <Seal verified={data.verified} progress={stamped} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {data.verified ? "Salaire reçu et attesté" : "Salaire déclaré"}
          </Text>
          <Text style={styles.sub}>
            {formatAmount(data.amountMinor, data.currency)} · {methodLabel(data.method)}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={copy}
        onPressIn={canopy.press}
        onPressOut={canopy.release}
        style={styles.proofRow}
        accessibilityRole="button"
        accessibilityHint="Copie l'empreinte de la preuve"
      >
        <Text style={styles.proof} selectable>{formatProof(data.proof)}</Text>
        <Text style={[styles.copy, copied && styles.copyDone]}>{copied ? "✓ Copié" : "Copier"}</Text>
      </Pressable>

      <Text style={styles.meta}>
        Émise le {new Date(data.issuedAt).toLocaleString("fr-FR")} · conservée au dossier de la mission.
        {data.disputeWindowDays ? ` Contestation possible ${data.disputeWindowDays} jours.` : ""}
      </Text>

      {!data.verified && (
        <Text style={styles.pending}>
          Un salaire déclaré n'est pas un salaire payé : la mention « payé » n'apparaîtra qu'après vérification.
        </Text>
      )}

      {onDispute && (
        <Pressable onPress={onDispute} style={styles.dispute} accessibilityRole="link">
          <Text style={styles.disputeText}>Je n'ai pas reçu cette somme · contester</Text>
        </Pressable>
      )}
    </View>
  );
}

function Seal({ verified, progress }: { verified: boolean; progress: Animated.Value }) {
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1.35, 1] });
  const opacity = progress;
  return (
    <Animated.View style={[styles.seal, verified ? styles.sealOk : styles.sealWait, { transform: [{ scale }], opacity }]}>
      <Text style={[styles.sealGlyph, { color: verified ? "#00F5A0" : "#6E6E7E" }]}>{verified ? "✓" : "◌"}</Text>
    </Animated.View>
  );
}

function methodLabel(m: OtpProofData["method"]) {
  return { mobile_money: "Mobile money", bank: "Virement bancaire", cash_declared: "Espèces (déclaré)", provider_wallet: "Portefeuille prestataire" }[m];
}

function formatAmount(minor: number, currency: string) {
  const zd = ["XOF", "XAF", "JPY"].includes(currency);
  const v = zd ? minor : minor / 100;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: zd ? 0 : 2 }).format(v)}\u202F${currency}`;
}

const styles = {
  wrap: { padding: 18, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.045)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  head: { flexDirection: "row" as const, alignItems: "center" as const, gap: 14 },
  seal: { width: 46, height: 46, borderRadius: 23, alignItems: "center" as const, justifyContent: "center" as const, borderWidth: 1.5 },
  sealOk: { borderColor: "rgba(0,245,160,0.55)", backgroundColor: "rgba(0,245,160,0.08)" },
  sealWait: { borderColor: "rgba(110,110,126,0.5)", backgroundColor: "rgba(110,110,126,0.08)" },
  sealGlyph: { fontSize: 20 },
  title: { color: "#F5F5F7", fontSize: 16, fontWeight: "600" as const },
  sub: { color: "#A9A9B8", fontSize: 12, marginTop: 2 },
  proofRow: { marginTop: 16, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, padding: 12, borderRadius: 12, backgroundColor: "rgba(0,245,160,0.06)", borderWidth: 1, borderColor: "rgba(0,245,160,0.18)" },
  proof: { color: "#B8FFE4", fontFamily: "JetBrainsMono", fontSize: 17, letterSpacing: 2.4 },
  copy: { color: "#00F5A0", fontSize: 12 },
  copyDone: { color: "#B8FFE4" },
  meta: { color: "#6E6E7E", fontSize: 11, marginTop: 10, lineHeight: 16 },
  pending: { color: "#A9A9B8", fontSize: 12, marginTop: 10, lineHeight: 17, fontStyle: "italic" as const },
  dispute: { marginTop: 12 },
  disputeText: { color: "#5CC8FF", fontSize: 12 },
};

/* ── CONTRAT DE TEST (INV-4) ────────────────────────────────────────────────
   Échec si :
   1. l'état « payé » est rendu alors que verified === false ;
   2. l'empreinte affichée contient moins de 12 caractères ou est un code secret ;
   3. la copie expose autre chose que l'empreinte publique ;
   4. le montant affiché diffère du montant d'écriture du ledger ;
   5. la contestation n'est pas accessible pendant la fenêtre déclarée.
   Plateformes : iOS, Android, Web (React), e-mails transactionnels, PDF de reçu.
──────────────────────────────────────────────────────────────────────────── */
