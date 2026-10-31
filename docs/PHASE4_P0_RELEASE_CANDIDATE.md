# P0 passkey consolidated release candidate (Draft)

Base: Draft #356, which includes #355 -> #354 -> #346. Added independent P-256 recovery test from #357 without merging the divergent #357 history. Thus a single candidate contains both the real SQLite Worker API journey and the P-256 credential replay/origin checks. Existing PRs are retained for traceability and must NOT be merged separately.

Scope: LINE-free invitation and passkey login; system-admin recovery of the same existing LINE-linked User ID; Group, Player, Membership, LINE identity, Game and Score unchanged; no new User for recovery. This candidate adds no feature logic relative to #356, only an additional independent regression test.

Acceptance: full CI, Local D1 migrations and existing score regression must pass. Android Chrome/iOS Safari manual registration/re-login and administrator identity confirmation are NOT validated by CI. Never merge main, run Remote D1 migrations or deploy Worker without explicit separate approval. Production main remains 21b890c1ebd70fcc6069b64c84d3bf4c063603b3 at creation.

Migration note: 0012_existing_user_passkey_recovery.sql is in this candidate; other abandoned S2-B draft series may also use 0012. Do not merge those separately without reconciling migration filenames and content.
