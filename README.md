# Mahjong Score

仲間内の三人麻雀・4人回し三麻のスコア、チップ、月間・年間・通算成績を管理するWebアプリです。

現在は Phase 1 の機能PoCを構築しています。

## Current Phase

- Frontend: React + TypeScript + Vite
- Hosting: Cloudflare Workers + Static Assets
- Persistence: localStorage
- Authentication: なし
- Database: なし
- Deploy: GitHub Actions + Wrangler

Phase 2以降で Worker API / D1、Cloudflare Access、LINE Loginを段階導入する予定です。

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
