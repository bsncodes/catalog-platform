#!/bin/sh
# Creates one logical database and one login role per service (ADR-006 / ASM-018).
# Each role owns only its own database and cannot connect to the other's.
# Passwords are passed as psql variables (:'var' quoting) so special characters are safe.
# Runs only on first initialisation of the data volume; after changing a password in .env,
# reset local data with `docker compose down -v`.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v catalog_password="$CATALOG_DB_PASSWORD" \
  -v notification_password="$NOTIFICATION_DB_PASSWORD" <<'SQL'
CREATE ROLE catalog_svc LOGIN PASSWORD :'catalog_password';
CREATE ROLE notification_svc LOGIN PASSWORD :'notification_password';
CREATE DATABASE catalog OWNER catalog_svc;
CREATE DATABASE notification OWNER notification_svc;
REVOKE CONNECT ON DATABASE catalog FROM PUBLIC;
REVOKE CONNECT ON DATABASE notification FROM PUBLIC;
GRANT CONNECT ON DATABASE catalog TO catalog_svc;
GRANT CONNECT ON DATABASE notification TO notification_svc;
SQL
