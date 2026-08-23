# Railway DB Migration - 2026-05-26

## Scope

- Source database: local Docker Compose PostgreSQL `flownote-db`
- Target database: Railway `Postgres`
- Target app dependency: Railway Spring backend `flownote`

## Actions

- Verified the local PostgreSQL container was healthy.
- Created a Railway Postgres backup before migration.
- Created a local PostgreSQL custom-format dump.
- Restored the local dump into Railway Postgres using `pg_restore` with:
  - `--clean`
  - `--if-exists`
  - `--no-owner`
  - `--no-privileges`
  - `--single-transaction`
- Used PostgreSQL 18 client tools for Railway Postgres because the Railway server is PostgreSQL 18.4.

## Backup Files

- Railway backup path: `/tmp/flownote-railway-before-local-migration-20260526T075753Z.dump`
- Local dump path: `/tmp/flownote-local-20260526T075753Z.dump`

These files are local temporary artifacts and are not committed to the repository.

## Verification

- Local public table count: 16
- Railway public table count: 16
- Local total row count: 250
- Railway total row count: 250
- Table-level counts matched between local and Railway.
- Railway Spring health endpoint returned HTTP 200 with status `UP` after migration.

## Notes

- The migration replaced Railway public schema objects with the local database contents.
- Existing Railway connections were terminated before restore to avoid lock conflicts.
- Secret values were not recorded in this report.
