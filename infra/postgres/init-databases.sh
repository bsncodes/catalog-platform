#!/bin/sh
# Creates one logical database and one login role per service (ADR-006 / ASM-018).
# Each role owns only its own database and cannot connect to the other's.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE catalog_svc LOGIN PASSWORD '${CATALOG_DB_PASSWORD}';
CREATE ROLE notification_svc LOGIN PASSWORD '${NOTIFICATION_DB_PASSWORD}';
CREATE DATABASE catalog OWNER catalog_svc;
CREATE DATABASE notification OWNER notification_svc;
REVOKE CONNECT ON DATABASE catalog FROM PUBLIC;
REVOKE CONNECT ON DATABASE notification FROM PUBLIC;
GRANT CONNECT ON DATABASE catalog TO catalog_svc;
GRANT CONNECT ON DATABASE notification TO notification_svc;
SQL
