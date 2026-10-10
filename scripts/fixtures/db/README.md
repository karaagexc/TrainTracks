# Isolated PostgreSQL Permission Tests

`bootstrap.sql` supplies only the database boundary normally supplied by Supabase:
roles, synthetic JWT settings, auth user records, storage schema placeholders, and
the public-schema default grants. The real repository schema and security
migrations are applied unchanged. `legacy-data.sql` supplies synthetic existing
accounts, an admin, maintenance configuration, and historical trip data.
`secured-data.sql` adds already-resolved incidents, reports, and resolution votes
before incremental repair, so migration preservation checks cover existing crowd data.

Install the separate dependency prefix from the repository root on Windows:

```powershell
npm.cmd install --prefix .tmp-edge-debug/isolated-db --save-exact embedded-postgres@17.10.0-beta.17 pg@8.23.1
npm.cmd run test:db
```

The ignored prefix pins `embedded-postgres@17.10.0-beta.17` and `pg@8.23.1`.
Its platform package requires npm lifecycle scripts. No dependency is added to
the production application. The runner creates a new cluster beneath this prefix
for every run, binds only `127.0.0.1` on an unused ephemeral port, uses random local
credentials, and stops PostgreSQL in `finally`. Cluster data and diagnostic reports
remain available for inspection; no preexisting cluster or fixture is deleted.

The `smoke.realtime_observations` table is a transport stub. Twenty independent
PostgreSQL clients race through the real crowd RPCs, and only the winning claimant
records an observation. This does not verify WebSocket delivery, Supabase JWT
signature validation, GoTrue sessions, PostgREST upsert translation, Storage HTTP,
OAuth, or hosted-project grants. Validation tests load the actual application
validators and then persist accepted edits through real PostgreSQL permissions.

Incremental migrations are also replayed transactionally and rolled back to check
that existing data, role authority, and function definitions are not lost. This is
a migration transaction-rollback check, not a supported production down migration
or a guarantee that old application code understands new RPC signatures.

The runner exits nonzero on permission or rollout-compatibility failures, while
continuing independent checks. Its ignored `latest-report.json` includes actual
PostgreSQL version, migration hashes, SQLSTATE/assertion diagnostics, concurrent
client counts, and shutdown confirmation. Failures must be reviewed by the owning
migration agent; this test does not silently adjust grants or install shims.
