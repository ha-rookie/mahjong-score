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

### Result order

`Game.results` の配列順を順位順として扱う。

- index 0 = 1位
- index 1 = 2位
- index 2 = 3位
- 4人回し時のみ index 3 = 4位
- Score Pointが同値でも配列順が順位を決める
- Score Pointから順位を再算出しない

### Score value

- User inputはScore Point
- 符計算は行わず、100点単位は扱わない
- 1point=1,000点としてScore Pointは整数
- 最終持点そのものは入力元にしない
- 1位Score Pointは2位以下の合計の符号反転で算出
- GameResult全体のScore Point合計は0
- 負値を許可

## 4. Runtime GameResult Contract

Issue #20でRuntime ModelをHuman確認済み入力契約へ整合する。

```text
GameResult
- playerId
- scorePoint: integer

rank = Game.results array order
```

旧 `finalPoints` / `mahjongScore` は廃止する。半荘結果入力UIはIssue #20時点で未実装であり、ProductionのUser操作ではGame recordを生成できなかったため、既存Group / Player / Session / ParticipantSegmentを保持したままschemaVersion 1を継続する。legacy GameResult shapeを含む手動/旧Backupはstrict validatorで不正として扱う。

## 5. Invariants

- ParticipantSegmentは3人または4人
- 同一Segment内Player重複禁止
- GameResultはParticipantSegment人数と一致する3人または4人
- GameResult内Player重複禁止
- GameResultのPlayer集合は対象ParticipantSegmentのPlayer集合と一致する
- Game.results順序をrankとして保持
- Score Pointは整数
- Score Point合計は0
- 1位Scoreは自動算出
- negative Score Pointを許可
- ChipResult内Player重複禁止
- Chip合計は0

## 6. Score Calculation Decisions

| Rule | Decision |
| --- | --- |
| user input | Score Point直接入力 |
| precision | integer point only |
| point basis | 1point = 1,000点 |
| rank | input order / Game.results order |
| tied Score Point | input orderで順位確定 |
| first place score | negative sum of remaining scores |
| game score sum | 0.0 |
| negative score | allowed |
| participant count | 3 or 4 according to ParticipantSegment |

## 7. Phase 1 Persistence

- storage key: `mahjong-score:app-data:v1`
- 現行schemaVersion: `1`
- 1 keyにAppDataSchema全体をJSON保存
- write時は全root schemaをvalidationしてから保存

GameResultは`scorePoint`整数契約。strict validatorも同一shapeを要求する。


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

Phase 1 aggregate JSON is normalized into D1 tables for Group, Player, Session, Segment, Game and child results, plus authentication/authorization entities.

- Existing domain IDs remain primary keys so historical references can be migrated unchanged
- Game result rank and segment player order are persisted explicitly
- Mutable Session / Game roots use integer `version` for optimistic concurrency
- `group_players.user_id` is nullable: Player may exist without login linkage
- User and LINE provider subject are separated by `external_identities`
- Invitation raw token is not stored; only token hash is persisted
- LINE state is short-lived, single-use, and stored server-side
- GameTag compatibility is retained although its UI remains deferred
- Preview migration is applied/validated before Production migration

## 10. Phase 2 Runtime Source of Truth / Legacy Data

- D1 modeのsource of truthはCloudflare D1
- Phase 1 localStorageはlegacy migration source / rollback evidenceとして残る場合がある
- System Adminのみ `POST /api/admin/migrate-local-v1` で明示移行する
- D1 gameplay tablesが空でない場合はmigrationを拒否する
- migration成功後はD1 modeへ切り替える
- D1 modeではlegacy JSON backup/restore UIをruntime recoveryとして使用しない

## 11. Recovery

- Primary point-in-time recoveryはD1 Time Travel
- Production restoreはHuman承認を必要とする
- Preview DBでrecovery rehearsalを実施済み
- 詳細は `21_D1_RECOVERY_RUNBOOK.md`

