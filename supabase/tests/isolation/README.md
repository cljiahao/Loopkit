# Concurrency isolation tests

stamp-redemption.spec defines competing reward operations to verify lock serialization and stale-state rejection. Run it with PostgreSQL isolation tooling against a disposable database after applying the ordered migrations; supabase test db runs pgTAP SQL and does not execute this spec. These concurrency checks remain unrun while the local engine is unavailable.
