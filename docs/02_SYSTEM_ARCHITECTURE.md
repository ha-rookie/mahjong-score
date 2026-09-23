# System Architecture

## 1. 文書目的

この文書は、ユーザー・Cloudflare・GitHub・データストア等を含む「システム全体の構成」の正本とする。

## 2. Architecture Goals

- ARCH-001: Phase 1ではサーバー側データストアを持たず、麻雀アプリ本体のUX検証を優先する
- ARCH-002: Phase 2でWorker API / D1へ移行できるよう、UIと永続化処理を分離する
- ARCH-003: Public RepositoryへSecret値を保存しない
- ARCH-004: GitHub Actionsで品質確認後、WranglerからCloudflare WorkersへDeployする
- ARCH-005: Phase 2でPWAを採用し、ホーム画面追加・standalone起動・静的AssetのService Worker cacheを提供する。D1/APIデータのoffline同期は初期PWA範囲に含めない

## 3. System Context

```text
User / Smartphone Browser
      |
      v
React SPA
      |
      v
Repository abstraction
      |
      v
localStorage

GitHub
  |
  v
GitHub Actions
  |- lint
  |- build
  `- wrangler deploy
      |
      v
Cloudflare Workers + Static Assets
```

Phase 1のRuntimeでは外部APIへ依存しない。

## 4. Deployment Architecture

| ID | Component | Platform | Responsibility | Production | Preview |
| --- | --- | --- | --- | --- | --- |
| ARCH-010 | Frontend | React + Vite | UI / client-side logic | Yes | PR CIのみ。Cloudflare Previewは後続判断 |
| ARCH-011 | Static delivery | Cloudflare Workers Static Assets | SPA配信 | Yes | TBD |
| ARCH-012 | Server/API | 該当なし（Phase 1） | 該当なし | No | No |
| ARCH-013 | Data Store | Browser localStorage | Phase 1データ永続化 | Client only | Client only |

### Environment Separation

Phase 1ではサーバー側データを持たない。

- Production deploy用SecretはGitHub Actions Secretsで管理
- Secret値をRepositoryへcommitしない
- PreviewからProductionデータへ書き込むサーバー経路はPhase 1には存在しない
- Phase 2でD1導入時にProduction / Preview Bindingsを分離する

## 5. Runtime Data Flow

```text
User operation
  -> React UI
  -> Application / domain logic
  -> Repository interface
  -> LocalStorageRepository
  -> localStorage
```

Browser外へ麻雀データを送信しない。

## 6. Build / Deploy Data Flow

```text
Issue branch
  -> Pull Request
  -> GitHub Actions
       -> npm install
       -> lint
       -> build
  -> Human review
  -> Merge to main
  -> GitHub Actions
       -> lint
       -> build
       -> wrangler deploy
  -> Cloudflare Workers + Static Assets
```

## 7. External Dependencies

| ID | Service | Purpose | Runtime Dependency | Auth | Failure Behavior |
| --- | --- | --- | --- | --- | --- |
| IF-001 | Cloudflare Workers | SPA hosting | Yes | Deploy時のみAPI Token | 配信不可 |
| IF-002 | GitHub Actions | CI / Deploy | No | Repository Secrets | Deploy不可。ローカル利用には影響なし |

## 8. Trust Boundaries / Security

- Browserで保持してよい情報: Phase 1の麻雀スコア、グループ、メンバー名、任意メモ
- Browserへ出してはいけない情報: Cloudflare API Token等のSecrets
- Server側検証: Phase 1はServerなし
- CORS: Phase 1の独自APIなし
- 認証・認可: Phase 1はなし
- 個人情報: 公開Repositoryへ実在メンバーのデータをcommitしない
- Secret管理: GitHub Actions Secrets

## 9. Availability / Failure Strategy

| Failure | User-visible behavior | Fallback | Logging/Detection |
| --- | --- | --- | --- |
| Cloudflare配信障害 | Webアプリへアクセスできない | なし | Cloudflare / Actions |
| localStorage unavailable | 保存できない旨を明示 | JSON export等を後続実装 | Client error |
| 保存データ破損 | 正常値として扱わない | Backup importを後続実装 | Client validation |

## 10. Observability

- Cloudflare Web Analytics: TBD
- Application events: Phase 1では未導入
- Error logs: Client-side最小限、方針は後続Issue
- Deployment history: GitHub Actions / Cloudflare
- Privacy boundary: 個人識別Analyticsは原則導入しない

## 11. Performance / Cost

- SPAの初期表示を軽量に保つ
- Static AssetsをCloudflare Edgeから配信する
- GitHub Public Repositoryのstandard hosted runnerを利用する
- Phase 1では有料APIを利用しない

## 12. Architecture Decisions

- Hosting: Cloudflare Workers + Static Assets
- Deploy: GitHub Actions + Wrangler
- Phase 1 persistence: localStorage
- Phase 2 persistence: D1予定
- SPA: React + Vite
- Auth: Phase 1なし

## 13. 未決事項

- TBD-ARCH-001: Preview環境のCloudflare公開方法
- TBD-ARCH-002: Resolved: Phase 2でPWA採用。初期範囲はManifest / App Icon / Service Worker / installability / standalone / static asset cache。業務データのoffline write/syncは排他・競合解決と合わせて将来判断
- TBD-ARCH-003: Analytics採用
