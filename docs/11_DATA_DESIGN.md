# Data / DB設計

## 1. 目的
Logical Data Model、Dictionary、State、Lifecycle、Transaction、Concurrencyを管理する。

## 2. Phase 1 Logical Model

```text
Group
 ├─ GroupMember -> Player
 └─ Session
     ├─ ParticipantSegment
     │   └─ Game
     │       ├─ GameResult
     │       └─ GameTag
     ├─ SessionParticipantNote
     └─ ChipResult
```

## 3. Game / GameResult Semantics

`Game` は1半荘の結果単位。局単位ではない。

- 3人三麻: GameResult = 3人分
- 4人回し三麻: GameResult = 4人分
- 4人回しでは局ごとに着席3人・待機1人が入れ替わる
- 局ごとの着席/待機履歴はPhase 1では保存しない
- Gameはその半荘に対応するParticipantSegmentを参照する

### Result order / legacy rank

Runtimeの`Game.results`配列順とD1の既存`game_results.rank`は、Player固定列/入力順を保持するlegacy orderであり、麻雀上の実順位ではない。

- 既存`rank`の意味は互換性のため変更しない
- 既存`UNIQUE(game_id, rank)`も維持する
- 実順位の分析に`rank`を使用しない
- APIのGame readは従来どおりlegacy rank順で結果を返せる

### Actual placement / last place

Issue #299以降、D1の`game_results`は実順位を別列で保持する。

```text
placement INTEGER NULL
is_last   INTEGER NOT NULL DEFAULT 0
```

`placement`はScore Pointからserver側で算出する。

```text
placement = 自分よりscore_pointが高いPlayer数 + 1
```

例:

```text
3人: +50, +10, -60     -> 1,2,3
3人: +50, -25, -25     -> 1,2,2
4人: +50, +10,+10,-70  -> 1,2,2,4
4人: +50, +10,-30,-30  -> 1,2,3,3
4人: +60, -20,-20,-20  -> 1,2,2,2
```

`is_last=1`はそのGameの最小Score Pointと一致する全Playerへ付与する。したがって最下位タイでは複数行が`is_last=1`になる。

業務ルール上、保存される最終Score Pointの1位は必ず一意とする。最高Score Pointが複数Playerで同点になるGameは新規保存/訂正時に拒否する。既存データのbackfillで最高点同点が見つかった場合も、推測でwinnerを決めずMigration/検証を失敗させる。

`placement`にはUNIQUE制約を付けない。下位同点を`1,2,2`や`1,2,3,3`として表現するためである。一方、D1には`placement=1`だけを対象とするpartial unique indexを置き、1位が複数保存されないことを防御する。

### Score value

- User inputはScore Point
- 符計算は行わず、100点単位は扱わない
- 1point=1,000点としてScore Pointは整数
- 最終持点そのものは入力元にしない
- 3人なら任意2人、4人なら任意3人を入力し、残り1人は合計0になるよう算出する
- GameResult全体のScore Point合計は0
- 負値を許可

## 4. Runtime GameResult Contract

Frontend/ApplicationのRuntime Modelは従来どおり表示・編集に必要な最小shapeを使う。

```text
GameResult
- playerId
- scorePoint: integer
```

D1の`rank` / `placement` / `is_last`はPersistence/aggregate側の列であり、Issue #299ではGame read payloadへ追加しない。新規Game/訂正時の`placement` / `is_last`はclient入力を信用せずWorkerがScore Pointから算出して保存する。

旧 `finalPoints` / `mahjongScore` は廃止する。legacy GameResult shapeを含む手動/旧Backupはstrict validatorで不正として扱う。

## 5. Invariants

- ParticipantSegmentは3人または4人
- 同一Segment内Player重複禁止
- GameResultはParticipantSegment人数と一致する3人または4人
- GameResult内Player重複禁止
- GameResultのPlayer集合は対象ParticipantSegmentのPlayer集合と一致する
- D1 `rank` はlegacy result-array orderとして保持し、実順位には使わない
- Score Pointは整数
- Score Point合計は0
- 最高Score Pointは1人だけ
- `placement = higher score count + 1`
- 各Gameの`placement=1`はちょうど1人
- `placement`は1〜4
- 各Gameの`is_last=1`は1人以上
- 最小Score Point同点時は全員`is_last=1`
- negative Score Pointを許可
- ChipResult内Player重複禁止
- Chip合計は0

## 6. Score Calculation Decisions

| Rule | Decision |
| --- | --- |
| user input | Score Point直接入力。N-1人入力、残り1人を合計0で算出 |
| precision | integer point only |
| point basis | 1point = 1,000点 |
| legacy rank | Game.results / Player固定列の入力順 |
| actual placement | Score Pointよりserver側で算出し`placement`へ永続化 |
| tied Score Point | 1位同点は禁止。下位同点は同じ`placement`を持つ |
| last place | 最小Score Pointの全Playerを`is_last=1` |
| game score sum | 0 |
| negative score | allowed |
| participant count | 3 or 4 according to ParticipantSegment |

## 7. Phase 1 Persistence

- storage key: `mahjong-score:app-data:v1`
- 現行schemaVersion: `1`
- 1 keyにAppDataSchema全体をJSON保存
- write時は全root schemaをvalidationしてから保存

GameResultは`scorePoint`整数契約。strict validatorも同一shapeを要求する。`placement` / `is_last`はD1 runtimeで導入するためlocalStorage schemaVersionは変更しない。

## 8. Phase 2 Identity / Group Authorization Model

Phase 2では麻雀上のPlayerとログイン主体Userを分離する。Playerは成績対象、Userは認証・認可主体であり、同一Entityにしない。

```text
User
 └─ GroupMembership -> Group
                     ├─ Player
                     └─ Session / Game / Results
```

### User
- id: stable internal ID
- externalIdentity: authentication provider側subjectとの対応
- displayName: UI表示用
- createdAt / updatedAt

### System role
- `users.system_role`: `admin | user`
- System Adminは全Groupを管理できる

### GroupMembership
- groupId
- userId
- role: `group_admin | member`
- createdAt / updatedAt
- 同一Group/Userの重複Membershipは禁止

### Role semantics
- System Admin: Group作成、Membership/User/Player管理等のsystem-wide管理操作
- Group Admin: 対象Groupの招待管理およびAPIで明示的に許可されたGroup管理操作
- Member: Session / Game / Chip / Memo / History / Performance等の通常操作

Group resourceへのread/writeは、Frontend表示状態ではなくWorker API側でMembershipを確認して許可する。

### Playerとの関係
UserとPlayerは別Entityのまま、Group内Playerを必要に応じてUserへ紐付ける。

- Playerは未ログイン状態でも作成・成績記録できる
- Playerは0または1つのUserへ紐付け可能
- 1 Userは複数GroupそれぞれのPlayerへ紐付くことができる
- 同一Group内では1 Userを複数Playerへ紐付けない
- User紐付け後も過去のGameResult等はPlayer IDを維持し、成績履歴を作り直さない

### Invitation / Linking flow
管理者はGroupのPlayer編集画面からPlayerをUserへ紐付ける。

1. Playerが未ログインならAdminが招待を発行する
2. 招待された人が認証を完了した時点で、そのUserを対象PlayerとGroupMembershipへ紐付ける
3. 対象者がすでにUserとして登録済みなら、Adminは既存Userを選択してPlayerへ紐付ける
4. 既存Userを紐付ける場合も対象GroupのMembershipを作成または確認する
5. Admin自身を含め、同一Group内のPlayer/User重複紐付けは禁止する

Invitationは実装済み。
- raw tokenは43文字base64url相当のrandom値
- D1にはSHA-256 hashのみ保存
- 有効期限は7日
- 同一Playerへ新規発行すると既存の未使用Invitationをrevoke
- used_at / revoked_atでsingle-useと取消を管理
- LINE Login stateへinvitation IDをserver-sideで紐付ける

### Concurrency
D1のSession / Gameは既存のinteger `version` を楽観ロックに使用する。

- read APIは `version` を返す
- Session更新・Game更新はclientが `expectedVersion` を送る
- UPDATEは `WHERE id=? AND version=?` を必須とし、成功時に `version=version+1`
- Game/Session削除も同じversion条件を要求する
- version不一致はHTTP 409 / `stale_update` とし、後勝ち上書きを行わない
- Gameのresults/tags置換は同じversion条件下でD1 batch内にまとめる
- Game訂正ではresultsと同時に`placement` / `is_last`も再算出・置換する
- finalized Session配下のGameは更新・削除不可
- Session削除はD1 FK cascadeを正規経路とし、Game一括DELETE APIは使用しない
- 新規Game同時追加は `UNIQUE(session_id,sequence)` でも競合を検出する

Group/Player等、現時点で通常UIから更新しないEntityのversion利用は将来の更新機能追加時に同じ方式へ揃える。

## 9. Phase 2 D1 Physical Schema

Migrations:
- `0001_initial.sql`: gameplay core tables
- `0002_auth_foundation.sql`: User / ExternalIdentity / GroupMembership
- `0003_group_player_user_link.sql`: Group-Player-User linking
- `0004_system_group_roles.sql`: system / group roles
- `0005_player_invitations.sql`: one-time invitation data
- `0006_line_login_states.sql`: server-side LINE OAuth state / nonce
- `0007_group_mahjong_rules.sql`: Group default Mahjong rules
- `0008_session_mahjong_rules.sql`: Session rule snapshot
- `0009_game_session_versions.sql`: optimistic-lock versions
- `0010_game_result_placement.sql`: actual placement / last-place columns and historical backfill

Phase 1 aggregate JSON is normalized into D1 tables for Group, Player, Session, Segment, Game and child results, plus authentication/authorization entities。

- Existing domain IDs remain primary keys so historical references can be migrated unchanged
- `game_results.rank`はlegacy result-array orderとして保持する
- `game_results.placement` / `is_last`はScore Point由来の分析用事实を保持する
- `placement=1` partial unique indexで1位複数保存を防止する
- Mutable Session / Game roots use integer `version` for optimistic concurrency
- `group_players.user_id` is nullable: Player may exist without login linkage
- User and LINE provider subject are separated by `external_identities`
- Invitation raw token is not stored; only token hash is persisted
- LINE state is short-lived, single-use, and stored server-side
- GameTag compatibility is retained although its UI remains deferred
- MigrationはLocal -> Preview -> Performance -> Productionの順で検証し、ProductionではRecovery Point取得後に適用する

`0010`はadditive migrationとし、既存Gameplay rowを削除・再作成しない。既存`score_point`から一度だけbackfillし、Game/GameResult件数不変、`placement IS NULL=0`、各Gameの1位1件以上ではなく**ちょうど1件**、`is_last=1`が1件以上であることを検証する。

## 10. Phase 2 Runtime Source of Truth / Legacy Data

- D1 modeのsource of truthはCloudflare D1
- Phase 1 localStorageはlegacy migration source / rollback evidenceとして残る場合がある
- System Adminのみ `POST /api/admin/migrate-local-v1` で明示移行する
- D1 gameplay tablesが空でない場合はmigrationを拒否する
- local-v1 migrationでもGameの`placement` / `is_last`をserver側で算出し、最高Score Point同点は拒否する
- migration成功後はD1 modeへ切り替える
- D1 modeではlegacy JSON backup/restore UIをruntime recoveryとして使用しない

## 11. Recovery

- Primary point-in-time recoveryはD1 Time Travel
- Production restoreはHuman承認を必要とする
- Preview DBでrecovery rehearsalを実施済み
- 詳細は `21_D1_RECOVERY_RUNBOOK.md`

関連Decision: `adr/ADR-0001-game-result-placement.md`
