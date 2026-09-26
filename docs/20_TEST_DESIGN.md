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

## 4. Current Automated / CI Coverage

Domain:
- 3/4人Participant validation
- duplicate participant
- GameResult participant count / negative Score Point
- score total invariant
- Chip balance

Infrastructure / persistence:
- AppDataSchema exact root validation
- schema v1 round trip
- localStorage adapter regression
- D1 migrations local validation
- Pull Request CIはremote Preview D1へmigrationを適用しない
- Active Session / Games / Segmentsのfixed query-count regression
- 5y / 10y local D1 performance fixture / benchmark

Application:
- Group作成
- Player + GroupMember atomic save
- Session + initial Segment atomic save
- invalid Session開始時のpartial write防止
- Backup export/import legacy regression
- invalid import時のexisting data保護

Phase 2 / Phase 3 evidence:
- optimistic concurrency: Session/Game version + stale_update
- structured audit logging / request correlation
- Static Assets Security Headers artifact validation
- Production Security Headers historical smoke evidence
- Preview D1 Time Travel recovery rehearsal historical evidence
- Worker API authorization / Group boundary / role tests
- 0半荘Session cancel tests
- History delete stale recovery behavior

## 5. CI Gate

2026-09-26以降、remote D1 quota事故防止のためPR / Mergeとremote D1操作を分離する。

### Pull Request CI

```text
Install
 -> Lint
 -> Test
 -> Build
 -> Static Security Headers artifact validation
 -> Local D1 migration validation
 -> STOP (no remote D1 / no deploy)
```

Pull Requestの更新ではPreview / Production D1へアクセスしない。

### Production Release

Production反映は`main`からHumanが明示的に開始するmanual `workflow_dispatch`のみ。

```text
Install
 -> Lint
 -> Test
 -> Build
 -> Static Security Headers artifact validation
 -> Local D1 migration validation
 -> Secret validation
 -> Production D1 migration
 -> Worker deploy
 -> Production Security Headers smoke
```

`main`へのMergeだけではProduction D1 migration / Worker deployは起動しない。

Test / Build / local migration validation failure時はremote operationへ進まない。remote D1がquota-limitedまたは利用不能な場合はmanual Production workflow自体を開始しない。

### Performance remote workflows

- long-term regressionの正本はlocal D1 5y / 10y benchmark
- `.github/workflows/d1-performance-benchmark.yml` のPreview D1 benchmarkはhistorical compatibility用のmanual-only workflowであり、通常のPR Gateではない
- dedicated remote Performance D1のsetup / seed / deployもmanual-onlyかつconfirmation入力必須
- Production / Previewへlarge fixtureを投入しない
- D1 quota-limited中にremote performance workflowを実行しない

Current performance strategyは `23_PERFORMANCE_D1_TEST.md` を正本とする。

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

### Performance diverging chart
- 負数が左、正数が右に表示されること
- 最大絶対値を基準に棒長が正規化されること
- 0ptで表示崩れしないこと
- 期間切替後の集計値とグラフ値が一致すること
- 3〜5人程度のスマホ幅でPlayer名と数値が判読できること

### Phase 2 optimistic concurrency
- Session readでversionを取得し、更新時にexpectedVersionを送ること
- 同じSession versionで2回更新した場合、先行更新のみ成功し後続は409 stale_updateになること
- stale Session更新時にmemo/chip child rowsを変更しないこと
- Game readでversionを取得し、訂正時にexpectedVersionを送ること
- stale Game訂正時にGameResult/GameTagを変更しないこと
- stale Game/Session削除は409となり対象Dataを削除しないこと
- 正常なSession/Game更新時にversionが1増えること
- finalized Session配下のGame訂正/削除を拒否すること

### Active Session manual refresh
- SCORE SHEETから手動で最新Session/Gameを再取得できること
- 他端末で追加されたGameが更新後に表示されること
- Sessionのchip/memoも最新値へ更新されること
- 未保存のScore入力・訂正中・chip/memo変更がある場合のみ破棄確認を表示すること
- 更新API失敗時は未保存入力を保持すること
- 他端末でSessionがfinalized済みの場合、active Session表示を終了すること
- smartphone幅で日付と更新ボタンが重ならないこと

### Toast notifications
- success/status message表示でmainコンテンツのY座標が変化しないこと
- status messageは約3秒で自動消去すること
- error messageは自動消去せず閉じる操作ができること
- smartphone幅でheaderとtoastが重ならないこと
- role=status / role=alertが維持されること

### Active Session refresh visibility
- SCORE SHEETをチップ・メモ付近までスクロールしても更新操作がsticky headerに見えていること
- active Session以外ではheaderに更新操作が表示されないこと
- 320px程度の狭い画面でもbrand/account/updateが横崩れしないこと
- 手動更新の前後でwindow scroll positionが維持され、画面上部へジャンプしないこと

### Phase 2 audit / request correlation
- protected APIへ未認証でアクセスした場合、authentication_failureを構造化Logへ出すこと
- Membership/role不足で403となる場合、authorization_failureを構造化Logへ出すこと
- LINE Loginの主要failure/successがrequestId付きで記録されること
- Session削除、Invitation発行/取消、Player/User unlink、Membership変更、Admin bootstrap、migration等の重要操作成功が記録されること
- Audit LogにOAuth/LINE token、Invitation token、Cookie、request body、Memo本文、displayNameを含めないこと
- requestIdはCF-Rayを優先し、存在しない場合はUUIDへfallbackすること

### Phase 2 Production Security Headers
- Vite build後に `dist/client/_headers` が存在すること
- Production rootでContent-Security-Policyが返ること
- CSPに `frame-ancestors 'none'` が含まれること
- Strict-Transport-Securityが `max-age=31536000` で返ること
- X-Frame-OptionsがDENYであること
- X-Content-Type-Optionsがnosniffであること
- Referrer-Policyがstrict-origin-when-cross-originであること
- Permissions-Policyが返ること
- X-Permitted-Cross-Domain-Policiesがnoneであること
- Headerが欠落したmanual Production deployはpost-deploy smokeで失敗すること

### Phase 2 D1 backup / recovery
- Preview / Production D1 database IDが異なることをrehearsal前にassertすること
- Previewでbaseline bookmarkを取得できること
- rehearsal probe table / markerをPreviewへ作成し存在確認できること
- baseline bookmarkへのTime Travel restoreが成功すること
- restore後にprobe tableが消えていること
- rehearsal途中でfailureした場合もtrapでbaseline restoreを試行すること
- Production DBにrehearsal probeを書き込まないこと
- Production restore手順にpre-restore bookmark / target bookmark / smoke / undoを含むこと

## 11. Phase 2 Completion Evidence

| Area | Evidence |
| --- | --- |
| LINE Login / User session | Production flow + PR #105/#106/#117/#118/#123 |
| System / Group authorization | PR #112/#120 + API-side checks |
| Invitation / linking | PR #113/#116/#119/#120 |
| D1 runtime | PR #94/#97/#98/#100/#114 |
| Optimistic concurrency | #146 / PR #147 |
| Multi-device active refresh | #148 / PR #149, #152 / PR #153 |
| Audit / request correlation | #154 / PR #155 |
| Security Headers | #156 / PR #157, main run #36071486621 |
| D1 recovery | #158 / PR #159, run #36072191864 |
| PWA | #160へDeferred |

Phase 2最終smokeはIssue #145で管理する。

### Empty Session cancellation
- Game 0件のactive SessionではUIに「Sessionを取り消す」を表示し、「Sessionを終了」は表示しないこと
- Game 1件以上では「Sessionを終了」を表示し、取り消し操作を表示しないこと
- Group Memberが自GroupのGame 0件active Sessionを取り消せること
- Game 1件以上のcancel APIは409 `session_not_empty`になること
- finalized Sessionのcancel APIは409 `session_not_active`になること
- stale expectedVersionのcancel APIは409 `stale_update`になること
- 0半荘SessionのfinalizeをApplication / Worker API双方で拒否すること
- 通常のSession DELETEは引き続きSystem Admin / Group Adminのみで、Memberは403となること
- smartphoneで0半荘取り消し後にHomeへ戻り、履歴へ0半荘Sessionが追加されないこと

### History delete stale recovery
- History Session削除が409 `stale_update`の場合、現在表示中の対象月を再読込すること
- 再読込成功後、最新状態を確認して再操作するようUserへ通知すること
- stale以外の削除errorでは従来のerror handlingを維持すること
- 成功削除時の従来flowを変更しないこと

### Long-term performance / query-count regression
- 5y fixture: 260 Session / 3,120 Game / 9,360 GameResultをlocal D1で再現できること
- 10y fixtureで履歴量を倍増してもActive Session / Games / Segmentsのdata query countが履歴件数に比例しないこと
- Active Session: activeありの場合4 data query以内
- Games: non-empty Sessionで3 data query以内
- Segments: non-empty Sessionで2 data query以内
- All-time aggregateは総履歴量に応じた増加を許容するが、N+1 queryへ戻らないこと
- local benchmarkはremote D1 billing / rows-readの代替指標として扱わないこと
- final User-facing判定はD1復旧後のProduction smartphone felt-performanceで行うこと
