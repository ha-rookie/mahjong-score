# Application Architecture

## 1. 文書目的

この文書は、アプリ内部の論理構成、Module責務、依存関係、状態、データ処理、エラー境界の正本とする。

システム外部との配置関係は `02_SYSTEM_ARCHITECTURE.md`、物理ファイル配置は `04_REPOSITORY_STRUCTURE.md` に分離する。

## 2. Logical Architecture

```text
Presentation / UI
      |
      v
Application / Use Case
      |
      v
Domain / Core Logic
      |
      v
Infrastructure / External I/O
```

この4層を必須とはしない。採用しない場合は実際の責務分割を記載する。

## 3. Component Responsibilities

| ID | Component | Responsibility | Inputs | Outputs | Must Not Do |
| --- | --- | --- | --- | --- | --- |
| APP-001 | CHANGE-ME | CHANGE-ME | CHANGE-ME | CHANGE-ME | CHANGE-ME |

「Must Not Do」を記載し、責務の肥大化を防ぐ。

## 4. Dependency Rules

- UIから外部APIを直接呼ぶか: CHANGE-ME
- Domain/CoreがDOMへ依存するか: CHANGE-ME
- InfrastructureがUI状態を持つか: CHANGE-ME
- Module間の循環依存: 禁止/CHANGE-ME
- 外部ライブラリ追加条件: CHANGE-ME

## 5. Routing / Screen Composition

| ID | Route/Screen | Purpose | Entry | Main Actions | Exit |
| --- | --- | --- | --- | --- | --- |
| UI-001 | CHANGE-ME | CHANGE-ME | CHANGE-ME | CHANGE-ME | CHANGE-ME |

画面の視覚詳細は `design/` を正本とし、ここでは役割と遷移だけを扱う。

## 6. State Management

| State | Scope | Source of Truth | Persistence | Reset Condition |
| --- | --- | --- | --- | --- |
| CHANGE-ME | UI/App/Server | CHANGE-ME | none/localStorage/server | CHANGE-ME |

- 永続化が必要な理由を明記する
- localStorage/Cookieへ個人識別情報を入れる場合はSecurity設計を更新する
- 初期値、壊れた保存値、schema version変更時の挙動を定義する

## 7. Runtime Sequence

```text
User Action
  -> UI validation
  -> Application use case
  -> Core calculation / data access
  -> Result
  -> UI render
```

主要ユースケースごとに必要ならSequenceを追加する。

## 8. Data Model

| ID | Model | Key Fields | Owner | Validation | Persistence |
| --- | --- | --- | --- | --- | --- |
| DATA-001 | CHANGE-ME | CHANGE-ME | CHANGE-ME | CHANGE-ME | CHANGE-ME |

DBを使わない場合も、JSON schemaやブラウザ内データ構造を記載する。

## 9. Interfaces

| ID | Interface | Direction | Request/Input | Response/Output | Error Contract |
| --- | --- | --- | --- | --- | --- |
| IF-001 | CHANGE-ME | In/Out/Internal | CHANGE-ME | CHANGE-ME | CHANGE-ME |

API、Pages Functions、Workers、静的JSON、外部リンクなどを含む。

## 10. Error Handling

- 入力不正: CHANGE-ME
- 外部I/O失敗: CHANGE-ME
- データ欠損: CHANGE-ME
- タイムアウト: CHANGE-ME
- Storage失敗: CHANGE-ME
- Analytics失敗: Core機能へ波及させない/CHANGE-ME

「例外を握りつぶして正常値を返す」を標準にしない。

## 11. PWA / Offline

- PWA採用: Yes / No / TBD
- Service Worker: CHANGE-ME
- Cache対象: CHANGE-ME
- Cacheしない対象: CHANGE-ME
- 更新戦略: CHANGE-ME
- Offline時の縮退: CHANGE-ME

## 12. Analytics

- Page view: CHANGE-ME
- Custom event: CHANGE-ME
- User identifier: 原則作らない/CHANGE-ME
- Failure isolation: CHANGE-ME

## 13. Security Boundaries

- Sanitization / validation: CHANGE-ME
- Secrets access layer: CHANGE-ME
- CSP impact: CHANGE-ME
- Dangerous operations: CHANGE-ME
- Human approval points: CHANGE-ME

## 14. Test Architecture

| Layer | Test Type | Main Targets |
| --- | --- | --- |
| Core | Unit | Pure logic / calculations |
| Application | Unit/Integration | Use cases / state |
| Infrastructure | Integration | API / storage / bindings |
| UI | Regression/E2E | Main flows / mobile |
| Security | Static/Regression | CSP / headers / input |
| Release | Manual | Preview / smartphone / secret mode |

実際の技術スタックに合わせて調整する。

## 15. 未決事項

- TBD-APP-001: CHANGE-ME
