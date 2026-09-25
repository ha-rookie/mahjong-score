# Requirements

## 1. 文書目的
この文書は「何を満たすべきか」の正本とする。実装方法はArchitecture / Design文書へ分離する。

## 2. 対象ユーザー
Phase 1はRepository owner本人。Phase 2では普段一緒に三麻をする固定GroupのMemberへ拡張済み。

## 3. 解決する課題
仲間内の三麻について、卓上で入力負荷を増やしすぎず、半荘結果・Chip・Session・月間・年間・通算成績と印象的な出来事を継続して記録・振り返れるようにする。

同時に、本Projectを業務システムのAI駆動開発PoCとして利用し、設計・共通化・Security・Test・Operationの再利用可能性を検証する。

## 4. 利用シナリオ

| ID | シナリオ | 主体 | 成功条件 |
| --- | --- | --- | --- |
| REQ-001 | GroupとPlayerを管理する | User | 5人以上の候補Memberを登録しSessionで選択できる |
| REQ-002 | Sessionを開始し参加者を選ぶ | User | 3人または4人で開始でき、Session中は参加者構成を固定する |
| REQ-003 | 半荘結果を登録する | User | 3人三麻は3人分、4人回し三麻は4人分の半荘結果を順位順に保存できる |
| REQ-004 | Session終了時にChipを精算する | User | Player別Chip数を入力し、合計0の場合のみ確定できる |
| REQ-005 | 成績を集計する | User | 日次・月間・年間・通算を確認できる |
| REQ-006 | 履歴へMemoを残す | User | Session Memoを保持できる |
| REQ-007 | DataをBackup/Restoreする | Admin | JSON export/importで端末変更・復旧に備えられる |

## 5. 半荘と4人回し三麻の定義

- `Game` は1半荘の結果単位
- 3人三麻ではGameResultは3人分
- 4人回し三麻では局ごとに着席3人・待機1人が入れ替わるが、GameResultは半荘に参加した4人分
- 局ごとの着席者/待機者ローテーション自体はアプリでは管理しない
- 3人三麻の開始時総点は 35,000 × 3 = 105,000点
- 4人回し三麻の開始時総点は 35,000 × 4 = 140,000点

## 6. 半荘結果入力ルール

Human確認済み:
- 入力する数値は最終持点ではなくScore Point
- 符計算は行わず、100点単位は扱わない
- 1point = 1,000点としてScore Pointは整数で入力する
- Playerの入力順がそのまま順位を表す
- 同じScore Pointでも入力順で順位を判定するため、Score値からTie-breakしない
- 1位PlayerのScore Pointは入力せず、残りPlayerのScore Point合計の符号反転で自動計算する
- 3人三麻では2人分を入力し、1位を自動計算
- 4人回し三麻では3人分を入力し、1位を自動計算
- 箱下相当の負Score Pointを許可する

例:
```text
入力順 = 1位 → 2位 → 3位 → 4位

1位 A: [自動]
2位 B: +3
3位 C: -8
4位 D: -15

1位 A = +20
合計 = 0
```

同点例:
```text
1位 A: +10
2位 B: +10
3位 C: -20

AとBのScore Pointが同じでも、入力順によりA=1位、B=2位
```

## 7. 機能要件

| ID | 要件 | 優先度 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- | --- |
| REQ-001 | Groupは5人以上のPlayerを登録可能 | Must | 5人以上を保持できるData Model | Active |
| REQ-002 | Sessionは日付と別Entityとし同日複数Sessionを許可 | Must | Session IDで個別管理できる | Active |
| REQ-003 | Session開始時の参加者構成を保持 | Must | ParticipantSegmentでGameとの対応を保持し、Phase 1ではSession中に変更しない | Active |
| REQ-004 | Game結果はSessionの方式に応じ3人または4人分を扱う | Must | 3人三麻=3人、4人回し三麻=4人 | Active |
| REQ-005 | 1point=1,000点の整数Score Pointを入力し、1Game合計0にする | Must | manual inputs + auto top = 0 | Active |
| REQ-006 | 入力順を順位とし、1位Scoreは残りから自動計算する | Must | 同Scoreでも入力順で順位確定 | Active |
| REQ-007 | 負Score Pointを許可する | Must | negative score pointを拒否しない | Active |
| REQ-008 | ChipはSession終了時にPlayer別net枚数を入力し合計0を必須とする | Must | balance validation | Active |
| REQ-009 | 1 Chip = 5pointとしてOverall Scoreへ反映 | Must | calculation test | Active |
| REQ-010 | GameTag | Deferred | Phase 1 UIから除外。利用方法を再定義してから再検討 | Deferred |
| REQ-011 | Session Memoを保持 | Should | Session単位のoptional memoを保存できる。Player別Memo UIは本人識別・認可導入まで延期 | Active |
| REQ-012 | JSON Backup/Restore | Must | 管理者のみ利用可能。schema version付きexport/import。復元前に確認し、不正ファイルでは既存Dataを変更しない | Active |
| REQ-013 | 0半荘のactive Sessionは終了ではなく取り消せる | Must | Game 0件ではSessionを削除して履歴へ残さず、Game 1件以上は取り消し不可。0半荘finalizeも拒否する | Active |

## 8. 非機能要件

詳細Catalogは `16_NFR_DESIGN.md` を正本とする。

- NFR-001 Usability: 卓上スマホ操作
- NFR-002 Integrity: Score/Chip invariant
- NFR-003 Recoverability: Backup/Restore
- NFR-004 Security: Secret/公開境界
- NFR-005 Performance: SPA baseline
- NFR-006 Availability: Production delivery
- NFR-007 Accessibility
- NFR-008 Concurrency: Phase 2

## 9. Data / External Information

- Phase 1 legacy dataはBrowser localStorageに残る場合がある
- Phase 2 runtimeのsource of truthはCloudflare D1
- localStorage -> D1 migrationはSystem Adminが明示的に実行する
- 実在MemberのSample DataをPublic Repositoryへcommitしない
- LINE LoginのChannel Secret / application session secretをPublic Repositoryへ保存しない
- D1のGroup / Player / Session / Game等はstable IDを維持する

## 10. 制約

- Frontend: React + TypeScript + Vite
- Hosting / API: Cloudflare Workers + Static Assets
- Database: Cloudflare D1
- Authentication: LINE Login
- Authorization: Worker API側でSystem Admin / Group Admin / Memberを強制
- Deploy: GitHub Actions + Wrangler
- Public RepositoryへSecretを保存しない

## 11. Out of Scope

Phase 1:
- 四人麻雀
- GameTag UI（仕様再定義まで保留）
- Player別Memo UI（本人識別・認可導入まで保留）
- D1 / Worker API
- LINE / Google Login
- Group authorization（System Admin / Group Admin / MemberをWorker API側で強制。Group作成はSystem Admin、Group管理操作は権限に応じて制御する）
- multi-device sync
- server audit log

## 11.5 Phase 2 Requirements

- AuthenticationでUserを識別する
- Group単位でAdmin / Memberを認可する
- User（認証主体）とPlayer（成績対象）を分離し、ログインしていないPlayerも保持可能とする
- AdminはPlayer編集から未ログインPlayerを招待でき、認証完了後にそのUserとPlayerを紐付ける
- 既存UserはAdminが対象Playerへ紐付けできる。紐付け時にGroup Membershipも作成または確認する
- AdminはGroup/Membership管理・Backup/Restoreを実行でき、Memberは通常の麻雀記録・参照を実行できる
- 認可はFrontend表示制御だけでなくWorker API側で強制する
- Group作成、Backup / RestoreはAdminのみ実行できる
- Worker API / D1で複数端末からGroup dataを共有する
- stale updateを検知し、競合を黙って上書きしない
- 認証失敗・認可失敗・重要操作をserver側で監査可能にする

### Phase 2 Deferred
- PWA（Manifest / App Icon / Service Worker / installability / standalone / static asset cache）はPhase 3以降へDeferred
- backlog: Issue #160
- D1/APIへのoffline write/syncはPWAとは別設計で扱う

## 12. 未決事項

| ID | 論点 | 決定者 | 状態 |
| --- | --- | --- | --- |
| TBD-001 | 100点単位の端数処理 | Human | Resolved: 符計算なし。100点単位は扱わず、1point=1,000点の整数入力 |
| TBD-002 | 同点Top / rank処理 | Human | Resolved: 入力順を順位として保持 |
| TBD-003 | 確定Sessionの再編集/訂正 | Human | Resolved: Phase 1は確定前ResultsからActiveへ戻して訂正可能。finalized後の訂正は将来検討 |
| TBD-004 | 離脱PlayerのChip精算運用 | Human | Resolved: Phase 1は同一Session内で離脱を扱わず、現Sessionを精算・終了後に残ったメンバーで新Sessionを開始 |
| TBD-005 | 複数Groupを扱うUI | Human | Resolved: 複数Group所属時のみHomeに切替UIを表示。Group作成はSystem Adminに限定し、Worker APIでも認可する |

未決事項をAIが推測で確定しない。


## 13. Phase 2 Completion Mapping

Phase 2 requirementの実装状態:
- Authentication: LINE Login実装済み
- Group authorization: API-side enforcement実装済み
- User / Player separation: D1 modelで実装済み
- Invitation / linking: one-time invitation + existing User management API実装済み
- Multi-device: D1共有 + active Session manual refresh実装済み
- Concurrency: Session / Game versionによる409 stale_update実装済み
- Audit: Worker structured audit log + request correlation実装済み
- Security Headers: Production smokeで検証済み
- Recoverability: D1 Time Travel runbook + Preview recovery rehearsal実施済み
- PWA: Phase 3以降へDeferred（Issue #160）


## 14. Original 4-Phase Roadmap Mapping

Projectのroadmap正本は次の4 Phase。

| Phase | Purpose | Current Status |
| --- | --- | --- |
| Phase 1 | localStorage / 認証なしで麻雀アプリの機能PoC | Completed |
| Phase 2 | D1 / Worker API / Security / Concurrency / Audit / Recovery | Completed |
| Phase 3 | LINE Login / Invitation / User-Player linking / Group authorization / Multi-device | Functionally Completed |
| Phase 4 | Google Login等の追加Authentication Provider / 複数External Identity | Not Started |

Phase 3機能は実装上Phase 2と連続して前倒し実装し、Issue #145のPhase 2 completion auditへ含めた。Roadmap上はPhase 2とPhase 3の責務を分けて扱う。

会社のSE向けUser Testは新しいPhaseではなく **Phase 3 Release Candidate Gate** とする。ReadinessはIssue #165で管理する。

PWA #160と長期性能試験 #137は4 Phaseとは別のCross-Phase Backlog。
