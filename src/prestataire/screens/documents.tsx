/**
 * PRE-48 → PRE-52 — Documents : bibliothèque, dépôt d'une version,
 * vérification, rejet/correction, historique des versions.
 *
 * Utilise UNIQUEMENT le système de documents/R2 existant (P0-R2) :
 *  - GET /my/documents (bibliothèque réelle) ;
 *  - POST /documents/upload-grants → upload binaire vers l'URL de grant R2
 *    (clé d'objet jamais exposée, hash SHA-256, versionnement append-only) ;
 *  - GET /documents/:documentId, GET /documents/:documentId/versions ;
 *  - POST /documents/:documentId/signed-download-url (URL signée courte).
 *
 * Le modèle documentaire réel a les statuts ACTIVE / REVOKED et les versions
 * PENDING_UPLOAD / ACTIVE / REVOKED : il n’existe AUCUN état « vérifié »,
 * « rejeté » ou « en vérification » — ces états de la fiche sont déclarés
 * BACKEND_GAP, jamais simulés. Aucune pièce n’est supprimée (révocation ADMIN).
 */

import { useState } from 'react';
import {
  ActionRow,
  EmptyNotice,
  GapNotice,
  KeyValues,
  Link,
  LoadingBlock,
  NeoPressButton,
  PageHead,
  Panel,
  RecordCard,
  RecordList,
  RetryButton,
} from '../components';
import { prestataireGapsFor } from '../screenMap';
import { usePrestataireAction, usePrestataireApi, usePrestataireResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { DocumentSummaryView } from '../api';
import type { PrestataireUnitProps } from '../types';
import { PRODUCT_LABELS, documentTypeLabel, formatDate } from '../vocabulary';

const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Actif',
  REVOKED: 'Révoqué',
};

const VERSION_STATUS_LABELS: Record<string, string> = {
  PENDING_UPLOAD: 'Téléversement en attente',
  ACTIVE: 'Active',
  REVOKED: 'Révoquée',
};

/** Types de documents réels du produit (DOCUMENT_TYPES, src/domain/documentRules.ts). */
const DOCUMENT_TYPE_OPTIONS = [
  { id: 'VERIFICATION_DOCUMENT', label: 'Pièce de vérification (identité, habilitation)' },
  { id: 'MISSION_JUSTIFICATION', label: 'Justificatif' },
  { id: 'TRACEABILITY_ATTESTATION', label: 'Attestation de traçabilité' },
  { id: 'WORKFLOW_SUPPORT', label: 'Pièce de support' },
  { id: 'TEMPORARY', label: 'Document temporaire' },
] as const;

const CONTENT_TYPE_OPTIONS = [
  { id: 'application/pdf', label: 'PDF' },
  { id: 'image/jpeg', label: 'Image (JPEG)' },
  { id: 'image/png', label: 'Image (PNG)' },
  { id: 'image/webp', label: 'Image (WebP)' },
] as const;

interface DocumentVersionViewLike {
  versionId: string;
  versionNumber: number;
  status: string;
  contentType: string;
  declaredSizeBytes: number;
  cryptographicHash?: string;
  createdAt: string;
}

function DocumentCard({ document }: { document: DocumentSummaryView }) {
  return (
    <RecordCard
      title={document.title}
      href={`/prestataire/documents/${document.documentId}/historique`}
      seal={{ tone: document.status === 'ACTIVE' ? 'emerald' : 'slate', label: DOCUMENT_STATUS_LABELS[document.status] ?? document.status }}
      facts={[
        { label: 'Type', value: documentTypeLabel(document.documentType) },
        { label: 'Fichier', value: document.fileName },
        { label: 'Version courante', value: String(document.currentVersionNumber) },
        { label: 'Créé le', value: formatDate(document.createdAt) ?? '—' },
      ]}
    />
  );
}

/* ───────────────── PRE-48 · Bibliothèque ───────────────── */

export function Prestataire48Documents({ unitId, pathname }: PrestataireUnitProps) {
  const api = usePrestataireApi();
  const documents = usePrestataireResource<DocumentSummaryView[]>(
    async (client, signal) => (await client.myDocuments({ limit: 100, signal })).items,
    [],
  );
  const [title, setTitle] = useState('');
  const [fileName, setFileName] = useState('');
  const [documentType, setDocumentType] = useState<(typeof DOCUMENT_TYPE_OPTIONS)[number]['id']>('VERIFICATION_DOCUMENT');
  const [contentType, setContentType] = useState('application/pdf');
  const [file, setFile] = useState<File | null>(null);
  const upload = usePrestataireAction<{ documentId: string }>();

  if (documents.status === 'error') return <SystemFeedback {...documents.error!} retry={documents.reload} />;
  if (documents.status === 'loading' || !documents.data) return <LoadingBlock label="Chargement des documents" rows={4} />;

  return (
    <>
      <PageHead
        title={`Mes ${PRODUCT_LABELS.DOCUMENT.plural.toLowerCase()}`}
        lede="Pièces professionnelles stockées en R2 (chiffré au repos), métadonnées versionnées, empreinte SHA-256. Seuls les statuts réels sont exposés — jamais le contenu brut des pièces d’identité."
        seal={{ tone: 'slate', label: `${documents.data.length} documents` }}
      />

      <Panel title={PRODUCT_LABELS.DOCUMENT.plural} zone="list">
        <RecordList
          items={documents.data}
          empty={<EmptyNotice>Aucun document déposé. Déposez une pièce professionnelle ci-dessous.</EmptyNotice>}
          render={(document) => <DocumentCard document={document} />}
        />
      </Panel>

      <Panel title={`Ajouter une ${PRODUCT_LABELS.DOCUMENT.singular.toLowerCase()} (flux R2 réel)`} zone="form">
        <div className="lbm-candidat__fields">
          <label className="lbm-candidat__field">
            Titre
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. Carte d’identité" />
          </label>
          <label className="lbm-candidat__field">
            Type de pièce (types réels du produit)
            <select value={documentType} onChange={(event) => setDocumentType(event.target.value as typeof documentType)}>
              {DOCUMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="lbm-candidat__field">
            Fichier (PDF ou image)
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setFile(selected);
                if (selected && !fileName) setFileName(selected.name);
              }}
            />
          </label>
          <label className="lbm-candidat__field">
            Nom de fichier enregistré
            <input value={fileName} onChange={(event) => setFileName(event.target.value)} placeholder="piece.pdf" />
          </label>
          <label className="lbm-candidat__field">
            Format
            <select value={contentType} onChange={(event) => setContentType(event.target.value)}>
              {CONTENT_TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="lbm-caption lbm-muted">
          Le dépôt réel passe par un grant R2 : le contenu est téléversé vers l’URL retournée par le serveur, empreinte SHA-256 calculée à l’enregistrement. La clé d’objet n’est jamais exposée. Aucune pièce n’est supprimable depuis cet écran (révocation réservée à la modération).
        </p>
        <NeoPressButton
          variant="primary"
          loading={upload.busy}
          disabled={!title.trim() || !fileName.trim() || !file}
          onClick={async () => {
            if (!file) return;
            const bytes = new Uint8Array(await file.arrayBuffer());
            const result = await upload.run(async (signal) => {
              const grant = await api!.requestUploadGrant(
                {
                  title: title.trim(),
                  fileName: fileName.trim(),
                  contentType,
                  sizeBytes: bytes.byteLength,
                  documentType,
                },
                signal,
              );
              await api!.uploadDocumentContent(grant.upload.url, bytes, grant.upload.contentType, signal);
              return { documentId: grant.document.documentId };
            });
            if (result) {
              setTitle('');
              setFileName('');
              setFile(null);
              documents.reload();
            }
          }}
        >
          Téléverser la {PRODUCT_LABELS.DOCUMENT.singular.toLowerCase()}
        </NeoPressButton>
      </Panel>

      {upload.error ? <SystemFeedback {...upload.error} retry={upload.reset} /> : null}
      {upload.result ? (
        <Panel title="Document déposé (réponse serveur)" zone="notice" tone="notice">
          {`Document ${upload.result.documentId} créé, version 1 téléversée. Historique réel : /prestataire/documents/${upload.result.documentId}/historique.`}
        </Panel>
      ) : null}

      <ActionRow>
        <Link href="/prestataire/profil" className="lbm-candidat__link">
          Mon profil
        </Link>
        <RetryButton onClick={documents.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · PRE-48" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-49 / PRE-50 / PRE-51 / PRE-52 · Versions, vérification, rejet, historique ───────────────── */

export function Prestataire49DocumentVersions({ unitId, params, pathname }: PrestataireUnitProps) {
  const documentId = params.id;
  const nouvelle = pathname.includes('/versions/nouvelle');
  const verification = pathname.endsWith('/verification');
  const rejet = pathname.endsWith('/rejet');
  const api = usePrestataireApi();
  const document = usePrestataireResource<DocumentSummaryView>(async (client, signal) => client.document(documentId, signal), [documentId]);
  const versions = usePrestataireResource<DocumentVersionViewLike[]>(
    async (client, signal) => (await client.documentVersions(documentId, signal)) as DocumentVersionViewLike[],
    [documentId],
  );
  const [file, setFile] = useState<File | null>(null);
  const [contentType, setContentType] = useState('application/pdf');
  const upload = usePrestataireAction<{ versionId: string }>();

  if (document.status === 'error') return <SystemFeedback {...document.error!} retry={document.reload} />;
  if (document.status === 'loading' || !document.data) return <LoadingBlock label="Chargement du document" rows={4} />;

  const current = document.data;

  if (verification) {
    return (
      <>
        <PageHead
          title={`Vérification · ${current.title}`}
          lede="Le modèle documentaire réel n’a pas de vérification humaine exposée : les versions sont PENDING_UPLOAD → ACTIVE (à l’enregistrement) ou REVOKED. Aucun critère de vérification, délai ou politique publique n’est disponible."
          seal={{ tone: 'slate', label: 'Sans pipeline exposé' }}
        />
        <Panel title="Versions réelles" zone="timeline">
          <RecordList
            items={versions.data ?? []}
            empty={<EmptyNotice>Aucune version enregistrée.</EmptyNotice>}
            render={(version) => (
              <KeyValues
                items={[
                  { label: `Version ${version.versionNumber}`, value: VERSION_STATUS_LABELS[version.status] ?? version.status },
                  { label: 'Empreinte SHA-256', value: version.cryptographicHash ?? 'Non enregistrée' },
                  { label: 'Taille déclarée', value: `${version.declaredSizeBytes} octets` },
                  { label: 'Enregistrée le', value: formatDate(version.createdAt) ?? '—' },
                ]}
              />
            )}
          />
        </Panel>
        <ActionRow>
          <Link href={`/prestataire/documents/${documentId}/historique`} className="lbm-candidat__link">
            Historique
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-50" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  if (rejet) {
    return (
      <>
        <PageHead
          title={`Rejet · ${current.title}`}
          lede="Le modèle documentaire n’a pas d’état « rejeté » : une pièce est ACTIVE ou REVOKED (révocation par la modération, avec motif). Aucun rejet de pièce, correction guidée ou recours n’est exposé — rien n’est simulé."
          seal={{ tone: 'clay', label: 'État inexistant' }}
        />
        <Panel title="État réel du document" zone="list">
          <KeyValues
            items={[
              { label: 'Statut', value: DOCUMENT_STATUS_LABELS[current.status] ?? current.status },
              { label: 'Version courante', value: String(current.currentVersionNumber) },
              { label: 'Révoqué le', value: current.revokedAt ? formatDate(current.revokedAt) : 'Non révoqué' },
              { label: 'Motif de révocation', value: current.revocationReason ?? null },
            ]}
          />
        </Panel>
        <Panel title="Recours réel" zone="notice" tone="notice">
          {`En cas de révocation contestée, le canal réel est un claim (OTHER_REVIEW_REQUIRED) examiné par la modération. Aucun « rejet à corriger » n’est simulé.`}
        </Panel>
        <ActionRow>
          <Link href={`/prestataire/documents/${documentId}/historique`} className="lbm-candidat__link">
            Historique
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-51" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  if (nouvelle) {
    return (
      <>
        <PageHead
          title={`Nouvelle version · ${current.title}`}
          lede="Chaque dépôt crée une version R2 tracée (append-only) : aucune version n’écrase jamais la précédente. La nouvelle version est enregistrée via le flux réel (grant + upload)."
          seal={{ tone: 'slate', label: `Version courante : ${current.currentVersionNumber}` }}
        />
        <Panel title="Pièce concernée (réelle)" zone="list">
          <KeyValues
            items={[
              { label: 'Titre', value: current.title },
              { label: 'Type', value: documentTypeLabel(current.documentType) },
              { label: 'Fichier', value: current.fileName },
              { label: 'Statut', value: DOCUMENT_STATUS_LABELS[current.status] ?? current.status },
            ]}
          />
        </Panel>
        <Panel title="Nouveau dépôt (flux R2 réel)" zone="form">
          <div className="lbm-candidat__fields">
            <label className="lbm-candidat__field">
              Fichier (PDF ou image)
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="lbm-candidat__field">
              Format
              <select value={contentType} onChange={(event) => setContentType(event.target.value)}>
                {CONTENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="lbm-caption lbm-muted">
            La version précédente reste archivée et lisible dans l’historique. Aucune comparaison côte à côte n’est disponible (capacité absente, déclarée).
          </p>
          <NeoPressButton
            variant="primary"
            loading={upload.busy}
            disabled={!file}
            onClick={async () => {
              if (!file) return;
              const bytes = new Uint8Array(await file.arrayBuffer());
            const result = await upload.run(async (signal) => {
              // Nouvelle version du document EXISTANT (append-only), pas un nouveau document.
              const grant = await api!.createDocumentVersion(
                documentId,
                { contentType, sizeBytes: bytes.byteLength },
                signal,
              );
              await api!.uploadDocumentContent(grant.upload.url, bytes, grant.upload.contentType, signal);
              return { versionId: grant.version.versionId };
            });
              if (result) {
                setFile(null);
                document.reload();
                versions.reload();
              }
            }}
          >
            Téléverser la nouvelle version
          </NeoPressButton>
        </Panel>
        {upload.error ? <SystemFeedback {...upload.error} retry={upload.reset} /> : null}
        {upload.result ? (
          <Panel title="Version déposée (réponse serveur)" zone="notice" tone="notice">
            {`Version ${upload.result.versionId} enregistrée pour le document ${documentId}. L’historique conserve toutes les versions.`}
          </Panel>
        ) : null}
        <ActionRow>
          <Link href={`/prestataire/documents/${documentId}/historique`} className="lbm-candidat__link">
            Voir l’historique
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-49" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  // PRE-52 · Historique des versions (route par défaut de l’unité).
  if (versions.status === 'error') return <SystemFeedback {...versions.error!} retry={versions.reload} />;
  if (versions.status === 'loading' || !versions.data) return <LoadingBlock label="Chargement de l’historique" rows={4} />;

  return (
    <>
      <PageHead
        title={`Historique · ${current.title}`}
        lede="Chronologie réelle des versions du document : numéro, état, empreinte courte, date d’enregistrement. Le log d’usage (quelle version vue par quel employeur) et l’export PDF n’existent pas dans le produit."
        seal={{ tone: 'slate', label: `${versions.data.length} version(s)` }}
      />
      <Panel title="Document réel" zone="list">
        <KeyValues
          items={[
            { label: 'Titre', value: current.title },
            { label: 'Type', value: documentTypeLabel(current.documentType) },
            { label: 'Statut', value: DOCUMENT_STATUS_LABELS[current.status] ?? current.status },
            { label: 'Version courante', value: String(current.currentVersionNumber) },
            { label: 'Créé le', value: formatDate(current.createdAt) ?? '—' },
          ]}
        />
      </Panel>
      <Panel title="Versions (append-only)" zone="list">
        <RecordList
          items={[...versions.data].sort((left, right) => right.versionNumber - left.versionNumber)}
          empty={<EmptyNotice>Aucune version enregistrée.</EmptyNotice>}
          render={(version) => (
            <RecordCard
              title={`Version ${version.versionNumber}`}
              seal={{ tone: version.status === 'ACTIVE' ? 'emerald' : 'slate', label: VERSION_STATUS_LABELS[version.status] ?? version.status }}
              facts={[
                { label: 'Empreinte', value: version.cryptographicHash ? `${version.cryptographicHash.slice(0, 12)}…` : 'Non enregistrée' },
                { label: 'Format', value: version.contentType },
                { label: 'Taille déclarée', value: `${version.declaredSizeBytes} octets` },
                { label: 'Enregistrée le', value: formatDate(version.createdAt) ?? '—' },
              ]}
            />
          )}
        />
      </Panel>
      <ActionRow>
        <Link href={`/prestataire/documents/${documentId}/versions/nouvelle`} className="lbm-candidat__link">
          Déposer une nouvelle version
        </Link>
        <Link href={`/prestataire/documents/${documentId}/verification`} className="lbm-candidat__link">
          Vérification
        </Link>
        <Link href="/prestataire/documents" className="lbm-candidat__link">
          Bibliothèque
        </Link>
        <RetryButton onClick={versions.reload} />
      </ActionRow>
      <GapNotice title="BACKEND_GAP · PRE-52" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}
