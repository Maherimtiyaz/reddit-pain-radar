-- Runs once, as the superuser, on an empty data dir (see docker-compose.yml).
--
-- Two roles so row-level security is genuinely exercised locally:
--   rpr_owner — owns the database/tables. Migrations run as this role; owners
--               bypass RLS.
--   rpr_app   — the app runtime role. Non-owner, so the tenant_isolation
--               policies in drizzle/*/migration.sql actually apply.

CREATE ROLE rpr_owner LOGIN PASSWORD 'rpr_owner';
CREATE ROLE rpr_app LOGIN PASSWORD 'rpr_app';

-- Ownership so the migrator can create its `drizzle` schema and the tables.
ALTER DATABASE pain_radar OWNER TO rpr_owner;
GRANT USAGE, CREATE ON SCHEMA public TO rpr_owner;
GRANT USAGE ON SCHEMA public TO rpr_app;

-- Tables/sequences the owner creates later (i.e. by `drizzle-kit migrate`) are
-- automatically usable by the app role.
ALTER DEFAULT PRIVILEGES FOR ROLE rpr_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rpr_app;
ALTER DEFAULT PRIVILEGES FOR ROLE rpr_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO rpr_app;
