-- LE LABEUR — P0-CRON-QUEUE — déclenchement périodique sur la queue EXISTANTE.
--
-- Périmètre : rendre les automatisations planifiées réellement déclenchables
-- sans intervention manuelle, SANS créer ni un deuxième scheduler, ni une
-- deuxième queue, ni un nouveau mécanisme de dead-letter.
--
-- Constat d'inspection (ce qui existait déjà, ce qui manquait réellement) :
--   * `automation_outbox`      : EXISTANT (0006) — file réelle (status,
--                                attempts, available_at, last_error), claim
--                                `FOR UPDATE SKIP LOCKED`. Il manquait le
--                                HORODATAGE DU CLAIM : une ligne `PROCESSING`
--                                (crash du worker APRÈS réservation, AVANT
--                                ack) était irrécupérable — silencieusement
--                                perdue. Ajout de `processing_started_at`
--                                (colonne AVANT, jamais de table parallèle).
--   * `automation_jobs`        : EXISTANT (0006/0007) — porte déjà
--                                `started_at` (posé par le claim) : suffisant
--                                pour détecter les jobs `RUNNING` orphelins.
--                                Il manquait un index de récupération bornée.
--                                Ajout d'un index partiel (lecture seule).
--   * retry / dead-letter      : EXISTANTS (worker P0-AUTO-2, bornes
--                                `attempts` + `last_error`) : la récupération
--                                des claims orphelins REUTILISE ces bornes,
--                                elle n'en invente aucune.
--
-- Aucune donnée n'est migrée ni supprimée : migration AVANT uniquement.
-- Aucune modification rétroactive de 0001 → 0016.
-- Aucun nouveau domaine, aucune nouvelle table, aucune règle métier inventée.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. OUTBOX — horodatage du claim (démarrage du traitement).
--
--    Posé par le claim existant (`status = 'PROCESSING'`) et lu par la
--    récupération des claims orphelins : `PROCESSING` dont
--    `processing_started_at` est antérieur à la borne d'exploitation est un
--    crash après réservation ; il repasse `RETRYABLE` (ou `DEAD_LETTER` si la
--    borne de tentatives est atteinte). `NULL` = claim hérité d'avant cette
--    migration : traité comme orphelin (il ne peut pas être en cours).
-- ---------------------------------------------------------------------------
ALTER TABLE automation_outbox
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS automation_outbox_stale_idx
  ON automation_outbox (processing_started_at)
  WHERE status = 'PROCESSING';

-- ---------------------------------------------------------------------------
-- 2. JOBS — index de récupération bornée des claims orphelins.
--
--    `automation_jobs.started_at` est déjà posé par le claim
--    (`status = 'RUNNING'`) ; l'index partiel rend la récupération bornée
--    (jamais un scan complet), sans aucune colonne nouvelle.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS automation_jobs_stale_idx
  ON automation_jobs (started_at)
  WHERE status = 'RUNNING';

COMMIT;
