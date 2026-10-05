-- LE LABEUR — Phase 2 — permissions ADMIN (seed). PRÉPARÉE, non appliquée.

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

INSERT INTO role_permissions (role, permission_code)
SELECT 'ADMIN', code FROM permissions
ON CONFLICT DO NOTHING;

COMMIT;
