# Test Design

## 1. 目的

Requirement / Design / Implementation / EvidenceをTestで接続する。

## 2. Test Layers

| Layer | Type | 主対象 |
| --- | --- | --- |
| Domain | Unit | score calculation / invariant |
| Application | Unit/Integration | use case / state |
| Infrastructure | Integration | storage / API / D1 |
| UI | Component/E2E | major flow / mobile |
| Security | Static/Dynamic | injection / authz / headers |
| NFR | Performance/Recovery/Accessibility | quality target |
| Release | Smoke/Manual | Production |

## 3. Phase 1 Test Foundation

Phase 1では外部Test frameworkを追加せず、既存のTypeScriptとNode 24標準 `node:test` を利用する。

```text
tests/*.test.ts
  ↓ tsc -p tsconfig.test.json
.test-dist/**/*.test.js (CommonJS)
  ↓ node --test
CI pass / fail
```

実行コマンド:

```bash
npm test
```

理由:
- 追加Dependencyなし
- Domain/Application/Infrastructureのpure TypeScriptをTest可能
- Templateへ持ち込みやすい
- React Component/E2Eが必要になった時点で専用frameworkを別判断できる

`.test-dist` は一時生成物でありcommitしない。

## 4. Current Automated Coverage

Domain:
- 3/4人Participant validation
- duplicate participant
- GameResult participant count / negative final points
- Chip balance

Infrastructure:
- AppDataSchema exact root validation
- schema v1 round trip
- localStorage adapter

Application:
- Group作成
- Player + GroupMember atomic save
- Session + initial Segment atomic save
- invalid Session開始時のpartial write防止
- Backup export/import
- invalid import時のexisting data保護

## 5. CI Gate

GitHub Actionsは次の順序で実行する。

```text
Install
 -> Lint
 -> Test
 -> Build
 -> Secret validation (main only)
 -> Deploy (main only)
```

Test failure時はBuild/Deployへ進まない。

## 6. Security Tests

- SQL injection resistance
- XSS / output handling
- authorization / IDOR
- CSRF when applicable
- CORS
- mass assignment
- invalid JSON / import
- rate limit
- secret leakage
- Security Headers production response

Phase 1ではinvalid JSON / import validationの一部のみ自動化済み。その他は該当Phaseで追加する。

## 7. NFR Tests

- performance baseline / regression
- backup / restore
- migration rehearsal
- concurrency / stale update
- accessibility
- supported browser/device
- rollback rehearsal

## 8. UI State Tests

React UI接続後に別Issueで追加する。

- normal
- loading
- empty
- validation error
- API/storage error
- disabled
- unauthorized / forbidden
- long text
- narrow mobile width
- keyboard / focus

## 9. Evidence

自動Test結果はGitHub ActionsをEvidenceとする。

Manual evidence:
- smartphone verification
- Search Console
- Cloudflare Dashboard
- external Security Header diagnostic

Issue/PRへ実施対象、日付、結果、未完了を残す。

## 10. Traceability

`06_REQUIREMENTS_TRACEABILITY.md` で:

```text
Requirement
 -> Design ID
 -> Issue/PR
 -> Implementation
 -> Test
 -> Evidence
```

を追跡する。


### Session finalization
- active Sessionを終了するとstatus=`finalized`、endedAtが設定されること
- finalized SessionがGetActiveSessionの対象外になること
- 終了後に新しい3人/4人Sessionを開始できること


### Score Sheet correction regression
- 3人/4人とも訂正開始時にN-1セルが既存値、1セルが自動計算対象になること
- 訂正保存後も合計0 invariantを維持すること
- 実機で鉛筆・ゴミ箱の視認性とタップ領域を確認すること


### Session Results
- 3人/4人のfinalized Session結果を表示できること
- 複数Gameの小計、chip x 5、最終合計を確認すること
- 同点時は同順位になること
- 結果表示後Homeへ戻れること


### Session History
- Homeからfinalized Session一覧へ遷移できること
- active Sessionは履歴に含めないこと
- 選択したSessionの結果を再表示できること
- Results表の上端/下端でPlayer列が一致すること


### Performance Aggregates
- finalized Sessionのみが対象であること
- 3人/4人混在でPlayer単位に正しく加算されること
- chip枚数を5pt換算して最終ptに含めること
- 同点最高ptは双方の1位回数を加算すること


### Performance Period Filter
- 通算が既存集計と一致すること
- 年指定で他年を除外すること
- 年月指定で他月を除外すること
- 対象データ0件で空表示になること


### Member management UI
- Homeにメンバー追加入力欄が常設されないこと
- Homeの登録メンバー名がコンパクトに確認できること
- メンバー管理画面から追加フォームを開閉できること
- 追加成功後に一覧へ反映されフォームが閉じること
