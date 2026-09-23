# System Architecture

## 1. 文書目的

この文書は、ユーザー・Cloudflare・GitHub・外部サービス・データストア等を含む「システム全体の構成」の正本とする。

## 2. Architecture Goals

- ARCH-001: CHANGE-ME
- ARCH-002: CHANGE-ME

## 3. System Context

```text
User / Browser
      |
      v
CHANGE-ME Web App
      |
      +--> CHANGE-ME External Service
      |
      +--> CHANGE-ME Data / API

GitHub
  |
  +--> CI / Build / Data Update
  |
  v
Cloudflare Pages / Workers / CHANGE-ME
```

実際の採用構成に合わせ、使わない要素は削除せず「該当なし」と明記する。

## 4. Deployment Architecture

| ID | Component | Platform | Responsibility | Production | Preview |
| --- | --- | --- | --- | --- | --- |
| ARCH-010 | Frontend | CHANGE-ME | CHANGE-ME | CHANGE-ME | CHANGE-ME |
| ARCH-011 | Server/API | CHANGE-ME | CHANGE-ME | CHANGE-ME | CHANGE-ME |
| ARCH-012 | Data Store | CHANGE-ME | CHANGE-ME | CHANGE-ME | CHANGE-ME |

### Environment Separation

- ProductionとPreviewのSecrets/Variables/Bindingsを分離する
- PreviewからProductionデータへ書き込まない
- Production固有のDomain/Auth/Billing設定をPreviewへコピーしない
- 環境差分がある場合はこの文書と `CLOUDFLARE_SETUP.md` の役割を分ける
  - なぜ分けるか・何を分けるか → 本文書
  - 具体的な設定手順 → Cloudflare Setup

## 5. Runtime Data Flow

```text
CHANGE-ME
```

ユーザー操作時に発生する通信・計算・保存を記載する。

## 6. Build / Update Data Flow

```text
CHANGE-ME
```

CI、定期更新、バッチ、事前生成がある場合、Runtimeと分けて記載する。

## 7. External Dependencies

| ID | Service | Purpose | Runtime Dependency | Auth | Failure Behavior |
| --- | --- | --- | --- | --- | --- |
| IF-001 | CHANGE-ME | CHANGE-ME | Yes/No | CHANGE-ME | CHANGE-ME |

外部障害時にコア機能まで停止させるか、縮退できるかを明示する。

## 8. Trust Boundaries / Security

- Browserで保持してよい情報: CHANGE-ME
- Browserへ出してはいけない情報: Secrets / tokens / CHANGE-ME
- Server側検証: CHANGE-ME
- CORS / CSP / same-origin: CHANGE-ME
- 認証・認可: CHANGE-ME
- 個人情報: CHANGE-ME
- Rate limit / abuse対策: CHANGE-ME

## 9. Availability / Failure Strategy

| Failure | User-visible behavior | Fallback | Logging/Detection |
| --- | --- | --- | --- |
| External API unavailable | CHANGE-ME | CHANGE-ME | CHANGE-ME |
| Data missing | CHANGE-ME | CHANGE-ME | CHANGE-ME |
| Analytics unavailable | Core機能へ波及させない/CHANGE-ME | CHANGE-ME | CHANGE-ME |

架空値を生成して正常に見せるより、取得失敗・データ不足を明示する。

## 10. Observability

- Cloudflare Web Analytics: CHANGE-ME
- Application events: CHANGE-ME
- Error logs: CHANGE-ME
- Deployment history: CHANGE-ME
- Privacy boundary: CHANGE-ME

## 11. Performance / Cost

- Performance budget: CHANGE-ME
- Cloudflare無料枠/費用上限: CHANGE-ME
- API費用上限: CHANGE-ME
- Asset/cache strategy: CHANGE-ME

## 12. Architecture Decisions

重要な選択は `adr/` に残す。

例:

- Pages vs Workers
- Runtime API vs static pre-generated data
- Database採用/非採用
- SPA/MPA
- PWA採用
- Analytics方式
- Auth方式

## 13. 未決事項

- TBD-ARCH-001: CHANGE-ME
