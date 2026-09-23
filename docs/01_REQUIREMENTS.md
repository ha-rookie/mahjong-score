# Requirements

## 1. 文書目的
この文書は「何を満たすべきか」の正本とする。実装方法はArchitecture / Design文書へ分離する。

## 2. 対象ユーザー
Phase 1はRepository owner本人。将来は普段一緒に三麻をする固定GroupのMemberへ拡張する。

## 3. 解決する課題
仲間内の三麻について、卓上で入力負荷を増やしすぎず、半荘結果・Chip・Session・月間・年間・通算成績と印象的な出来事を継続して記録・振り返れるようにする。

同時に、本Projectを業務システムのAI駆動開発PoCとして利用し、設計・共通化・Security・Test・Operationの再利用可能性を検証する。

## 4. 利用シナリオ

| ID | シナリオ | 主体 | 成功条件 |
| --- | --- | --- | --- |
| REQ-001 | GroupとPlayerを管理する | User | 5人以上の候補Memberを登録しSessionで選択できる |
| REQ-002 | Sessionを開始し参加者を選ぶ | User | 3人または4人で開始でき、Session途中で参加者構成を変更できる |
| REQ-003 | 半荘結果を登録する | User | 三麻Scoreを入力し、確定後の結果を保存できる |
| REQ-004 | Session終了時にChipを精算する | User | Player別Chip数を入力し、合計0の場合のみ確定できる |
| REQ-005 | 成績を集計する | User | 日次・月間・年間・通算を確認できる |
| REQ-006 | 履歴へ出来事とMemoを残す | User | GameTag、Session Memo、Player別Memoを保持できる |
| REQ-007 | DataをBackup/Restoreする | User | JSON export/importで端末変更・復旧に備えられる |

## 5. 機能要件

| ID | 要件 | 優先度 | 受け入れ条件 | 状態 |
| --- | --- | --- | --- | --- |
| REQ-001 | Groupは5人以上のPlayerを登録可能 | Must | 5人以上を保持できるData Model | Active |
| REQ-002 | Sessionは日付と別Entityとし同日複数Sessionを許可 | Must | Session IDで個別管理できる | Active |
| REQ-003 | Session内の参加者構成変更を履歴として保持 | Must | ParticipantSegmentでGameとの対応を保持 | Active |
| REQ-004 | Game結果は3人または4人分を扱う | Must | participant count validation | Active |
| REQ-005 | 35,000点持ち、40,000点基準、1,000点=1pointを前提にScore計算 | Must | 計算仕様Testで確認 | Planned |
| REQ-006 | Topは直接選択せず、1人分をbalance計算できる | Must | Game score calculationで確認 | Planned |
| REQ-007 | 箱下を許可する | Must | negative final pointsを拒否しない | Planned |
| REQ-008 | ChipはSession終了時にPlayer別net枚数を入力し合計0を必須とする | Must | balance validation | Active |
| REQ-009 | 1 Chip = 5pointとしてOverall Scoreへ反映 | Must | calculation test | Planned |
| REQ-010 | GameTagは選択式で複数保持できPlayerを関連付け可能 | Should | 役満/ダブル役満を保持 | Active |
| REQ-011 | Session MemoとPlayer別Session Memoを保持 | Should | optional memo fields | Active |
| REQ-012 | JSON Backup/Restore | Must | schema version付きexport/import | Planned |

## 6. 非機能要件

詳細Catalogは `16_NFR_DESIGN.md` を正本とする。

- NFR-001 Usability: 卓上スマホ操作
- NFR-002 Integrity: Score/Chip invariant
- NFR-003 Recoverability: Backup/Restore
- NFR-004 Security: Secret/公開境界
- NFR-005 Performance: SPA baseline
- NFR-006 Availability: Production delivery
- NFR-007 Accessibility
- NFR-008 Concurrency: Phase 2

## 7. Data / External Information

- Phase 1の麻雀DataはBrowser localStorageへ保存する
- 実在MemberのSample DataをPublic Repositoryへcommitしない
- Phase 1 Runtimeは外部APIへ麻雀Dataを送信しない
- Phase 2でD1へ移行可能なstable ID / schema versionを持つ

## 8. 制約

- Frontend: React + TypeScript + Vite
- Hosting: Cloudflare Workers + Static Assets
- Phase 1: no auth / no D1 / no Worker API
- Deploy: GitHub Actions + Wrangler
- Public RepositoryへSecretを保存しない

## 9. Out of Scope

Phase 1:
- 四人麻雀
- D1 / Worker API
- LINE / Google Login
- Group authorization
- multi-device sync
- server audit log

## 10. 未決事項

| ID | 論点 | 決定者 | 状態 |
| --- | --- | --- | --- |
| TBD-001 | 100点単位の端数処理 | Human | Open |
| TBD-002 | 同点Top / rank処理 | Human | Open |
| TBD-003 | 確定Sessionの再編集/訂正 | Human | Open |
| TBD-004 | 離脱PlayerのChip精算運用 | Human | Open |
| TBD-005 | Phase 1で複数Groupを扱うUI | Human | Open |

未決事項をAIが推測で確定しない。
