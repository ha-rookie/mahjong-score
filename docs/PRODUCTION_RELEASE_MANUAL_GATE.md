# Production Release Safety — Issue #362 (Draft, not deployed)

## Activation status
This branch is based on main `21b890c1ebd70fcc6069b64c84d3bf4c063603b3`. **No main merge, Remote D1, Cloudflare Deploy, GitHub Environment or Secrets changes** are authorized or performed here.

### Release topology
- Existing `.github/workflows/deploy-production.yml`: PR and main-push local tests only. Existing `validate-and-deploy` job ID and historical workflow name remain unchanged to avoid breaking required CI status labels. No Cloudflare credentials, D1 remote command, workflow_dispatch or production network probe.
- New `.github/workflows/release-production.yml`: **workflow_dispatch only**, exact approved 40-character SHA matching both dispatch + current main (before and after Environment approval). Only job with Environment `production` may read Cloudflare Secrets or operate on Production.
- Preflight with `contents:read`, `actions:read`; approved release uses only `contents:read` and `actions:read`; no GitHub write or unnecessary deployment permissions. GitHub Environment API read must confirm Required reviewers + exactly one custom deployment branch policy (`main`). Any 403/404/invalid JSON fails closed.
- A separately provisioned `production` **Environment Secret** `PRODUCTION_RELEASE_ARMED` with value `armed-for-production-release` is required; the corresponding name must NOT exist in repository or organization Secrets. This is a deliberate future provisioning gate, **not created during this task**. Required reviewers still enforced by GitHub, independently of secret.
- Current repository-level `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are referenced **only inside approved release steps**. Move to Environment-scoped Secrets later if explicitly authorized. Token permissions and GitHub Environment bypass policy must be audited before any first production run.
- `concurrency` group serializes all Production release jobs; prior workflow dispatch for same SHA (including failure/cancelled) and any rerun are rejected. An interrupted Migration requires a separately reviewed recovery plan; do not naively retry the same release.
- Human inputs: exact `release_sha`, explicit comma-separated ordered list `approved_migrations`, or `none`. Preflight validates filenames, ordering and source membership without assuming a stale remote applied-state. After Environment approval, the release queries the actual remote `d1_migrations` ledger via Cloudflare D1 read-only SQL, verifies a complete ordered prefix of the source migrations and an exact match between the remaining files and the human-approved list before mutations; after migration it verifies that all source migrations are recorded. Cloudflare query failures, malformed response or unknown remote rows stop the release.

### Required GitHub Environment configuration before use
1. Create/configure Environment named exactly `production`, Required reviewers >=1; if independent reviewer available enable prevent self-review.
2. Deployment branches: selected custom branches, **only `main`**. Disable admin bypass. The GitHub API exposes the reviewer/branch rules, which the release script verifies. If GitHub's Environment API omits `can_admins_bypass: false`, the gate **fails closed**, even when UI shows the policy; separately design an authoritative verifiable signal before enabling Production.
3. Provision Environment-only `PRODUCTION_RELEASE_ARMED` Secret. Only after these steps are separately authorized will the release job be able to proceed.
4. Verify Cloudflare API Token narrow scope and existing repository Secrets separately. No Secret/var changes in this PR.
5. Ensure Android UAT acceptance and real Production rollback/recovery runbook are approved before a release.

### Failure modes / hard stop
| Stage | Fail-closed condition |
|---|---|
| Dispatch / preflight | non-main, invalid SHA, stale HEAD, repeat run, malformed/unknown migration approval, CI failure |
| Environment approval | no required reviewers, no main-only policy, admin-bypass status absent or enabled, GitHub API failure, missing arming Secret |
| D1 preflight | wrong Production D1 UUID/name/binding, unavailable/mismatched remote D1 migration ledger, missing recovery bookmark |
| Migration | failed apply or nonempty pending list after apply; **stop** before Worker deploy, investigate exact applied files and D1 state |
| Deploy / verification | stop, do not automatically restore D1; decide Worker rollback separately |
| Repeated requests | concurrency controls overlap; duplicate SHA and rerun fail closed |

D1 Time Travel rollback is a destructive recovery, not an automatic action. It can revert legitimate updates; obtain separate explicit approval before restoring. Do not run existing Production workflow manually.

### #358 / #361 dependency
- Merge **this safety PR first**, as main push CI-only, after reviewing the static guard.
- PR #358 currently contains the historical `deploy-production.yml` with automatic push-to-main production migration/deploy. Rebase/merge this safety commit into #358, reconcile the old workflow and verify `scripts/check-migration-safety.mjs` topology check still rejects auto deploy. Then rerun all CI.
- PR #361 remains stacked on #358 and must follow the reconciled parent. Migration sequence: #358 adds 0012, 0013; #361 adds 0014. Never Squash-merge #361 before #358, and rebase/reconstruct the child after parent Squash.
- Approved code merge still does not authorize Production Release; that is a separate workflow, explicit SHA, separate Environment reviewer approval and separate decision.
