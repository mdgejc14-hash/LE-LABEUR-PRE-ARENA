-- LE LABEUR — P0-D — catalogue et matrice RBAC canonique.
--
-- Les permissions existantes sont des capacités transverses ADMIN. Les accès
-- CANDIDATE/EMPLOYER seront contrôlés par rôle + ownership/participation dans
-- les handlers métier : aucune permission `:any` ne doit leur être accordée.
-- Le mapping ADMIN est explicite : une future permission ajoutée au catalogue
-- ne sera jamais accordée automatiquement par un `SELECT ... FROM permissions`.

BEGIN;

INSERT INTO permissions (code) VALUES
  ('users:read:any'), ('users:block'), ('users:unblock'),
  ('offers:read:any'), ('offers:moderate'),
  ('applications:read:any'), ('applications:moderate'),
  ('contracts:read:any'), ('contracts:moderate'),
  ('payments:read:any'), ('payments:approve'), ('payments:reject'),
  ('schedules:read:any'),
  ('incidents:read:any'), ('incidents:arbitrate'),
  ('replacements:read:any'), ('replacements:manage'),
  ('notifications:read:any'), ('calls:read:any'), ('match:read:any'),
  ('communications:read:any'), ('documents:read:any'),
  ('audit:read'), ('stats:read')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role, permission_code) VALUES
  ('ADMIN', 'users:read:any'),
  ('ADMIN', 'users:block'),
  ('ADMIN', 'users:unblock'),
  ('ADMIN', 'offers:read:any'),
  ('ADMIN', 'offers:moderate'),
  ('ADMIN', 'applications:read:any'),
  ('ADMIN', 'applications:moderate'),
  ('ADMIN', 'contracts:read:any'),
  ('ADMIN', 'contracts:moderate'),
  ('ADMIN', 'payments:read:any'),
  ('ADMIN', 'payments:approve'),
  ('ADMIN', 'payments:reject'),
  ('ADMIN', 'schedules:read:any'),
  ('ADMIN', 'incidents:read:any'),
  ('ADMIN', 'incidents:arbitrate'),
  ('ADMIN', 'replacements:read:any'),
  ('ADMIN', 'replacements:manage'),
  ('ADMIN', 'notifications:read:any'),
  ('ADMIN', 'calls:read:any'),
  ('ADMIN', 'match:read:any'),
  ('ADMIN', 'communications:read:any'),
  ('ADMIN', 'documents:read:any'),
  ('ADMIN', 'audit:read'),
  ('ADMIN', 'stats:read')
ON CONFLICT DO NOTHING;

COMMIT;
