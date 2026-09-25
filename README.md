# Mahjong Score

仲間内の三人麻雀・4人回し三麻のスコア、チップ、月間・年間・通算成績を管理するWebアプリです。

Phase 1の端末内PoCを経て、元の4 Phase roadmap上のPhase 2（D1/API/業務基盤）とPhase 3（LINE Login/招待/複数ユーザー）までProductionへ実装済みです。

## Current Phase

- Frontend: React + TypeScript + Vite
- Hosting / API: Cloudflare Workers + Static Assets
- Persistence: Cloudflare D1
- Authentication: LINE Login
- Authorization: System Admin / Group Admin / Member
- Multi-device: D1をsource of truthとして共有
- Concurrency: Session / Game versionによるoptimistic concurrency
- Audit: Worker structured audit log + request correlation
- Recovery: D1 Time Travel
- Deploy: GitHub Actions + Wrangler

Phase 2完了監査はIssue #145で管理する。PWAはPhase 3以降へDeferredし、Issue #160で再検討する。

## Development

```bash
npm install
npm run dev
```

Validation:

```bash
npm run lint
npm run build
```

## Deploy

Production deployは `.github/workflows/deploy-production.yml` から行います。

必要なGitHub Actions Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Secret値はRepositoryへcommitしません。

## Design / Development Rules

設計書の入口は [docs/README.md](docs/README.md) です。

開発は原則として以下の順で行います。

1. 設計確認
2. Issue
3. Issue専用Branch
4. 実装
5. lint / build
6. Pull Request
7. CI
8. Human review
9. Merge
10. Production verification
