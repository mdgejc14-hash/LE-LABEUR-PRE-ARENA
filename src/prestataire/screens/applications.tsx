/**
 * PRE-08 → PRE-15 — Candidature : dépôt, confirmation, suivi, registre,
 * retrait, archive.
 *
 * Workflow réel : APPLICATION (statuts PENDING / REVIEW / SHORTLISTED /
 * REJECTED / WITHDRAWN / HIRED / CONTRACTED / CLOSED_OFFER_FILLED). Création
 * POST /offers/:offerId/applications (charge utile serveur : `{ note? }`),
 * retrait POST /applications/:applicationId/withdraw (aucun corps).
 *
 * La lecture du registre candidat (/my/applications) et la lecture d’une
 * candidature (/applications/:id) sont déclarées dans routeContracts.ts SANS
 * handler installé (501) : les écrans tentent la lecture réelle et affichent
 * l’état d’erreur du serveur, en plus du BACKEND_GAP déclaré. Rien n’est simulé.
 */

import { useState } from 'react';
import {
  ActionRow,
  EmptyNotice,
  FilterChips,
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
import { navigate } from '../../routing/navigation';
import type { Application, Offer } from '../../types';
import type { PrestataireApi } from '../api';
import type { PrestataireUnitProps } from '../types';
import { APPLICATION_STATUS_LABELS, PRODUCT_LABELS, formatDate } from '../vocabulary';

const APPLICATION_TONE: Record<Application['status'], 'emerald' | 'amber' | 'slate' | 'gold' | 'clay'> = {
  PENDING: 'amber',
  REVIEW: 'amber',
  SHORTLISTED: 'emerald',
  REJECTED: 'slate',
  WITHDRAWN: 'slate',
  HIRED: 'gold',
  CONTRACTED: 'emerald',
  CLOSED_OFFER_FILLED: 'slate',
};

function ApplicationCard({ application }: { application: Application }) {
  return (
    <RecordCard
      title={application.offerTitle}
      href={`/prestataire/candidatures/${application.id}`}
      seal={{ tone: APPLICATION_TONE[application.status], label: APPLICATION_STATUS_LABELS[application.status] }}
      facts={[
        { label: 'Employeur', value: application.employerName ?? '—' },
        { label: 'Envoyée le', value: formatDate(application.appliedDate) ?? '—' },
      ]}
    />
  );
}

/* ───────────────── PRE-08 / PRE-09 · Dépôt de candidature ───────────────── */

export function Prestataire08Apply({ unitId, params, pathname }: PrestataireUnitProps) {
  const api = usePrestataireApi();
  const offerId = params.id;
  const confirmation = pathname.endsWith('/envoyee');
  const [note, setNote] = useState('');
  const offer = usePrestataireResource(async (client, signal) => client.offer(offerId, signal), [offerId]);
  const apply = usePrestataireAction<Application>();

  if (confirmation) {
    return (
      <>
        <PageHead
          title="Candidature envoyée"
          lede={`Votre ${PRODUCT_LABELS.APPLICATION.singular.toLowerCase()} a été créée (réponse réelle du serveur). La relecture depuis le registre n’est pas disponible à ce stade : la route de lecture est déclarée sans handler (501).`}
          seal={{ tone: 'gold', label: 'Envoyée' }}
        />
        <Panel title="Que se passe-t-il ensuite ?" zone="list">
          <RecordList
            items={[
              `L’employeur examine votre ${PRODUCT_LABELS.APPLICATION.singular.toLowerCase()} (statut réel : « Reçue »).`,
              'Vous serez notifié d’un éventuel examen, présélection ou refus.',
              `Vous pouvez retirer votre ${PRODUCT_LABELS.APPLICATION.singular.toLowerCase()} à tout moment avant sélection, sans aucune conséquence.`,
            ]}
            render={(item) => <p className="lbm-body">{item}</p>}
          />
        </Panel>
        <ActionRow>
          <Link href="/prestataire/candidatures" className="lbm-candidat__link">
            Mes {PRODUCT_LABELS.APPLICATION.plural.toLowerCase()}
          </Link>
          <Link href="/prestataire/missions" className="lbm-candidat__link">
            Retour au marché
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-09" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  if (offer.status === 'error') return <SystemFeedback {...offer.error!} retry={offer.reload} />;
  if (offer.status === 'loading' || !offer.data) return <LoadingBlock label="Chargement de l’offre" rows={4} />;

  if (apply.result) {
    return (
      <>
        <PageHead
          title="Candidature envoyée"
          lede={`Votre ${PRODUCT_LABELS.APPLICATION.singular.toLowerCase()} « ${apply.result.offerTitle} » a été enregistrée (statut réel : ${APPLICATION_STATUS_LABELS[apply.result.status]}).`}
          seal={{ tone: 'emerald', label: APPLICATION_STATUS_LABELS[apply.result.status] }}
        />
        <Panel title="Candidature créée (réponse serveur)" zone="list">
          <KeyValues
            items={[
              { label: 'Offre', value: apply.result.offerTitle },
              { label: 'Identifiant', value: apply.result.id },
              { label: 'Envoyée le', value: formatDate(apply.result.appliedDate) ?? null },
            ]}
          />
        </Panel>
        <ActionRow>
          <Link href={`/prestataire/candidatures/${apply.result.id}`} className="lbm-candidat__link">
            Suivre ma {PRODUCT_LABELS.APPLICATION.singular.toLowerCase()}
          </Link>
          <Link href="/prestataire/candidatures" className="lbm-candidat__link">
            Mes {PRODUCT_LABELS.APPLICATION.plural.toLowerCase()}
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-09" items={prestataireGapsFor(unitId, '/prestataire/candidatures/envoyee')} />
      </>
    );
  }

  return (
    <>
      <PageHead
        title={`Postuler · ${offer.data.title}`}
        lede={`Offre publiée par ${offer.data.employerName}. La candidature réelle n’accepte qu’un message : les pièces jointes à la candidature ne sont pas persistées par le produit.`}
        seal={{ tone: 'gold', label: PRODUCT_LABELS.APPLICATION.singular }}
      />

      <Panel title="Votre message (seul champ persisté)" zone="form">
        <div className="lbm-candidat__fields">
          <label className="lbm-candidat__field">
            Message à l’employeur (facultatif)
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Présentez-vous brièvement : expérience, disponibilité, raison de votre candidature."
              maxLength={2000}
            />
          </label>
        </div>
        <p className="lbm-caption lbm-muted">
          Le serveur n’accepte que ce message (champ « note », facultatif). Aucun autre champ n’est envoyé : aucun identifiant, aucune pièce, aucune disponibilité inventée.
        </p>
      </Panel>

      <ActionRow>
        <NeoPressButton
          variant="primary"
          loading={apply.busy}
          onClick={() => {
            void apply
              .run((signal) => api!.applyToOffer(offerId, note.trim() ? { note: note.trim() } : {}, signal))
              .then((result) => {
                if (result) navigate(`/prestataire/candidatures/${result.id}`);
              });
          }}
        >
          Envoyer ma {PRODUCT_LABELS.APPLICATION.singular.toLowerCase()}
        </NeoPressButton>
        <Link href={`/prestataire/missions/${offerId}`} className="lbm-candidat__link">
          Annuler
        </Link>
      </ActionRow>

      {apply.error ? <SystemFeedback {...apply.error} retry={apply.reset} /> : null}

      <GapNotice title="BACKEND_GAP · PRE-08" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-10 / PRE-12 / PRE-13 · Suivi d'une candidature ───────────────── */

export function Prestataire10ApplicationFollowUp({ unitId, params, pathname }: PrestataireUnitProps) {
  const api = usePrestataireApi();
  const applicationId = params.id;
  const depot = pathname.endsWith('/depot');
  const questions = pathname.endsWith('/questions');
  const application = usePrestataireResource<Application | null>(async (client, signal) => {
    try {
      return await client.application(applicationId, signal);
    } catch {
      // La lecture directe est déclarée sans handler (501) : le suivi retombe
      // sur le registre réel, lui aussi en 501 à ce stade. L'état d'erreur réel
      // est affiché par l'écran appelant ; ici aucune donnée n'est inventée.
      return null;
    }
  }, [applicationId]);
  const registry = usePrestataireResource<Application[]>(async (client, signal) => (await client.myApplications({ limit: 100, signal })).items, []);
  const fromRegistry = registry.data?.find((entry) => entry.id === applicationId) ?? null;
  const withdraw = usePrestataireAction<Application>();

  if (questions) {
    return (
      <>
        <PageHead
          title="Questions de l’employeur"
          lede="Le produit n’installe aucune messagerie encadrée : aucune route de questions/réponses n’existe (les routes /conversations sont déclarées sans handler, 501)."
          seal={{ tone: 'clay', label: 'Indisponible' }}
        />
        <Panel title="Ce qui existe réellement" zone="notice" tone="notice">
          {`Les échanges avec l’employeur passent par les notifications et les canaux du produit. Aucune question ne peut être affichée, répondue ou signalée depuis cet écran : rien n’est simulé.`}
        </Panel>
        <ActionRow>
          <Link href={`/prestataire/candidatures/${applicationId}`} className="lbm-candidat__link">
            Retour au suivi
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-13" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  if (depot) {
    return (
      <>
        <PageHead
          title="Ce que j’ai envoyé"
          lede="La vue du dépôt réellement envoyé n’est pas exposée (aucune route de lecture de candidature installée). Le contenu ci-dessous est celui du registre réel quand il est lisible."
          seal={{ tone: 'slate', label: 'Lecture partielle' }}
        />
        {fromRegistry ? (
          <Panel title="Candidature (registre réel)" zone="doc">
            <KeyValues
              items={[
                { label: 'Offre', value: fromRegistry.offerTitle },
                { label: 'Employeur', value: fromRegistry.employerName ?? null },
                { label: 'Statut', value: APPLICATION_STATUS_LABELS[fromRegistry.status] },
                { label: 'Envoyée le', value: formatDate(fromRegistry.appliedDate) ?? null },
                { label: 'Note', value: fromRegistry.note ?? null },
              ]}
            />
          </Panel>
        ) : (
          <Panel title="Lecture indisponible" zone="notice" tone="notice">
            {`La candidature ${applicationId} n’est pas relisible : la route de lecture est déclarée sans handler (501). L’état réel du serveur est affiché, aucune donnée n’est reconstituée.`}
          </Panel>
        )}
        <ActionRow>
          <Link href={`/prestataire/candidatures/${applicationId}`} className="lbm-candidat__link">
            Retour au suivi
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-12" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  if (application.status === 'error' || registry.status === 'error') {
    return (
      <>
        <PageHead
          title={`Suivi · candidature ${applicationId}`}
          lede="La lecture d’une candidature est déclarée dans le contrat de routes SANS handler installé : le serveur répond 501 NOT_IMPLEMENTED. L’état réel est affiché ; aucune donnée n’est simulée."
          seal={{ tone: 'clay', label: 'Lecture indisponible' }}
        />
        <SystemFeedback state="500" correlationId={application.error?.correlationId ?? registry.error?.correlationId} retry={application.reload} />
        <ActionRow>
          <Link href="/prestataire/candidatures" className="lbm-candidat__link">
            Mes {PRODUCT_LABELS.APPLICATION.plural.toLowerCase()}
          </Link>
          <NeoPressButton
            variant="ghost"
            loading={withdraw.busy}
            onClick={() => {
              void withdraw.run((signal) => api!.withdrawApplication(applicationId, signal)).then((result) => {
                if (result) {
                  application.reload();
                  registry.reload();
                }
              });
            }}
          >
            Retirer ma {PRODUCT_LABELS.APPLICATION.singular.toLowerCase()}
          </NeoPressButton>
        </ActionRow>
        {withdraw.error ? <p className="lbm-caption" role="alert">Le retrait a échoué (état réel du serveur affiché).</p> : null}
        {withdraw.result ? (
          <Panel title="Retrait effectué (réponse serveur)" zone="notice" tone="notice">
            {`Statut réel après retrait : ${APPLICATION_STATUS_LABELS[withdraw.result.status]}.`}
          </Panel>
        ) : null}
        <GapNotice title="BACKEND_GAP · PRE-10" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  if (application.status === 'loading' || registry.status === 'loading') {
    return <LoadingBlock label="Chargement du suivi de candidature" rows={4} />;
  }

  const current = fromRegistry ?? application.data;

  return (
    <>
      <PageHead
        title={current ? current.offerTitle : `Candidature ${applicationId}`}
        lede={current ? `Suivi réel de votre ${PRODUCT_LABELS.APPLICATION.singular.toLowerCase()} auprès de ${current.employerName ?? 'l’employeur'}.` : 'Lecture directe indisponible ; le suivi retombe sur le registre réel.'}
        seal={current ? { tone: APPLICATION_TONE[current.status], label: APPLICATION_STATUS_LABELS[current.status] } : { tone: 'clay', label: 'Lecture partielle' }}
      />

      {current ? (
        <Panel title="État réel" zone="list">
          <KeyValues
            items={[
              { label: 'Statut', value: APPLICATION_STATUS_LABELS[current.status] },
              { label: 'Offre', value: current.offerTitle },
              { label: 'Employeur', value: current.employerName ?? null },
              { label: 'Envoyée le', value: formatDate(current.appliedDate) ?? null },
              { label: 'Note envoyée', value: current.note ?? null },
            ]}
          />
        </Panel>
      ) : (
        <Panel title="Lecture indisponible" zone="notice" tone="notice">
          {`La candidature ${applicationId} n’est pas relisible (501). Le retrait reste possible : la route réelle de retrait est installée.`}
        </Panel>
      )}

      {current ? (
        <Panel title="Historique réel" zone="timeline">
          <RecordList
            items={current.history}
            empty={<EmptyNotice>Aucun événement enregistré.</EmptyNotice>}
            render={(entry) => (
              <p className="lbm-body">
                {entry.action} · {entry.actor} · {formatDate(entry.timestamp) ?? '—'}
              </p>
            )}
          />
        </Panel>
      ) : null}

      <ActionRow>
        <Link href={`/prestataire/candidatures/${applicationId}/depot`} className="lbm-candidat__link">
          Voir le dépôt
        </Link>
        <Link href={`/prestataire/candidatures/${applicationId}/questions`} className="lbm-candidat__link">
          Questions de l’employeur
        </Link>
        <NeoPressButton
          variant="ghost"
          loading={withdraw.busy}
          onClick={() => {
            void withdraw.run((signal) => api!.withdrawApplication(applicationId, signal)).then((result) => {
              if (result) {
                application.reload();
                registry.reload();
              }
            });
          }}
        >
          Retirer ma {PRODUCT_LABELS.APPLICATION.singular.toLowerCase()}
        </NeoPressButton>
      </ActionRow>

      {withdraw.result ? (
        <Panel title="Retrait effectué (réponse serveur)" zone="notice" tone="notice">
          {`Statut réel après retrait : ${APPLICATION_STATUS_LABELS[withdraw.result.status]}. Retirer avant sélection n’a aucune conséquence.`}
        </Panel>
      ) : null}

      <GapNotice title="BACKEND_GAP · PRE-10" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-11 / PRE-15 · Registre & archive ───────────────── */

const REGISTRY_SEGMENTS = [
  { id: 'ALL', label: 'Toutes' },
  { id: 'PENDING', label: 'Reçues' },
  { id: 'REVIEW', label: 'En examen' },
  { id: 'SHORTLISTED', label: 'Présélectionnées' },
  { id: 'HIRED', label: 'Retenues' },
  { id: 'REJECTED', label: 'Écartées' },
  { id: 'WITHDRAWN', label: 'Retirées' },
] as const;

export function Prestataire11Applications({ unitId, pathname }: PrestataireUnitProps) {
  const [segment, setSegment] = useState('ALL');
  const archive = pathname.endsWith('/archive');
  const resource = usePrestataireResource<Application[]>(async (api, signal) => (await api.myApplications({ limit: 100, signal })).items, []);

  if (resource.status === 'error') {
    return (
      <>
        <PageHead
          title={archive ? 'Archives' : `Mes ${PRODUCT_LABELS.APPLICATION.plural.toLowerCase()}`}
          lede={`La route /my/applications est déclarée dans le contrat de routes SANS handler installé : le serveur répond 501 NOT_IMPLEMENTED. Le registre des ${PRODUCT_LABELS.APPLICATION.plural.toLowerCase()} n’est pas lisible à ce stade.`}
          seal={{ tone: 'clay', label: 'Lecture indisponible' }}
        />
        <SystemFeedback state="500" correlationId={resource.error?.correlationId} retry={resource.reload} />
        <ActionRow>
          <Link href="/prestataire/missions" className="lbm-candidat__link">
            Marché des {PRODUCT_LABELS.OFFER.plural.toLowerCase()}
          </Link>
          <RetryButton onClick={resource.reload} />
        </ActionRow>
        <GapNotice title={archive ? 'BACKEND_GAP · PRE-15' : 'BACKEND_GAP · PRE-11'} items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label={`Chargement des ${PRODUCT_LABELS.APPLICATION.plural.toLowerCase()}`} rows={5} />;

  const applications = resource.data;
  const visible = applications.filter((application) => segment === 'ALL' || application.status === segment);
  const closed = applications.filter((application) => ['REJECTED', 'WITHDRAWN', 'CLOSED_OFFER_FILLED'].includes(application.status));

  return (
    <>
      <PageHead
        title={archive ? `Archives des ${PRODUCT_LABELS.APPLICATION.plural.toLowerCase()}` : `Mes ${PRODUCT_LABELS.APPLICATION.plural.toLowerCase()}`}
        lede={archive
          ? 'Candidatures clôturées (écartées, retirées, offre pourvue). Aucune candidature n’est supprimée sans votre action explicite.'
          : `${applications.length} ${PRODUCT_LABELS.APPLICATION.plural.toLowerCase()} réellement enregistrée(s) (registre serveur).`}
        seal={{ tone: 'slate', label: archive ? 'Archive' : 'Registre' }}
      />

      <FilterChips
        label="Segments"
        options={REGISTRY_SEGMENTS.map((entry) => ({ id: entry.id, label: entry.label }))}
        value={segment}
        onChange={setSegment}
      />

      <Panel title={archive ? 'Archives' : PRODUCT_LABELS.APPLICATION.plural} zone="list">
        <RecordList
          items={archive ? closed : visible}
          empty={<EmptyNotice>{archive ? 'Aucune archive pour l’instant.' : `Aucune ${PRODUCT_LABELS.APPLICATION.singular.toLowerCase()} dans ce segment.`}</EmptyNotice>}
          render={(application) => <ApplicationCard application={application} />}
        />
      </Panel>

      <ActionRow>
        <Link href={archive ? '/prestataire/candidatures' : '/prestataire/candidatures/archive'} className="lbm-candidat__link">
          {archive ? 'Voir le registre' : 'Voir les archives'}
        </Link>
        <Link href="/prestataire/missions" className="lbm-candidat__link">
          Marché des {PRODUCT_LABELS.OFFER.plural.toLowerCase()}
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title={archive ? 'BACKEND_GAP · PRE-15' : 'BACKEND_GAP · PRE-11'} items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-14 · Retrait ───────────────── */

export function Prestataire14Withdraw({ unitId, params, pathname }: PrestataireUnitProps) {
  const api = usePrestataireApi();
  const applicationId = params.id;
  const registry = usePrestataireResource<Application[]>(async (client, signal) => (await client.myApplications({ limit: 100, signal })).items, []);
  const withdraw = usePrestataireAction<Application>();

  const current = registry.data?.find((entry) => entry.id === applicationId) ?? null;
  const alreadySelected = current ? ['SHORTLISTED', 'HIRED', 'CONTRACTED'].includes(current.status) : false;

  return (
    <>
      <PageHead
        title="Retirer ma candidature"
        lede={alreadySelected
          ? 'Cette candidature a été présélectionnée ou retenue : le retrait reste possible, avec un impact sur votre réputation de fiabilité (gradation, jamais blocage).'
          : 'Retirer avant sélection n’a aucune conséquence : vous restez libre de votre recherche.'}
        seal={{ tone: alreadySelected ? 'clay' : 'slate', label: current ? APPLICATION_STATUS_LABELS[current.status] : 'Retrait' }}
      />

      <Panel title="Conséquence réelle (règle produit)" zone="kpi">
        <RecordList
          items={[
            { label: 'Avant sélection', value: 'Aucune pénalité.' },
            { label: 'Après sélection', value: 'Impact sur la réputation de fiabilité, expliqué et graduel.' },
          ]}
          render={(item) => (
            <div className="lbm-candidat__kv">
              <div>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            </div>
          )}
        />
      </Panel>

      <Panel title="Candidature concernée" zone="list">
        {registry.status === 'loading' ? <LoadingBlock label="Chargement" rows={2} /> : null}
        {current ? (
          <KeyValues
            items={[
              { label: 'Offre', value: current.offerTitle },
              { label: 'Statut actuel', value: APPLICATION_STATUS_LABELS[current.status] },
            ]}
          />
        ) : (
          <p className="lbm-caption lbm-muted">
            {`La candidature ${applicationId} n’est pas relisible (registre en 501) : le retrait est tenté directement sur la route réelle, sans reconstitution.`}
          </p>
        )}
      </Panel>

      <ActionRow>
        <NeoPressButton
          variant="primary"
          loading={withdraw.busy}
          onClick={() => {
            void withdraw.run((signal) => api!.withdrawApplication(applicationId, signal)).then((result) => {
              if (result) navigate(`/prestataire/candidatures/${result.id}`);
            });
          }}
        >
          Retirer ma {PRODUCT_LABELS.APPLICATION.singular.toLowerCase()}
        </NeoPressButton>
        <Link href={`/prestataire/candidatures/${applicationId}`} className="lbm-candidat__link">
          Annuler
        </Link>
      </ActionRow>

      {withdraw.error ? <SystemFeedback {...withdraw.error} retry={withdraw.reset} /> : null}
      {withdraw.result ? (
        <Panel title="Retrait effectué (réponse serveur)" zone="notice" tone="notice">
          {`Statut réel après retrait : ${APPLICATION_STATUS_LABELS[withdraw.result.status]}. L’employeur est notifié.`}
        </Panel>
      ) : null}

      <GapNotice title="BACKEND_GAP · PRE-14" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}
