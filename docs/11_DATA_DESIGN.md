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

## 4. GameResult Persistence Contract

Issue #18でRuntime Modelを確定仕様へ更新する。

```text
GameResult
- playerId
- scorePoint

rank = Game.resultsの配列順
```

`finalPoints` / `mahjongScore` はRuntime永続化契約から削除する。Score Pointは整数で、1point=1,000点。

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

Current:
- storage key: `mahjong-score:app-data:v2`
- schemaVersion: `2`
- legacy key: `mahjong-score:app-data:v1`
- 1 keyにAppDataSchema全体をJSON保存
- write時は全root schemaをvalidationしてから保存

### v1 -> v2 migration

- v2 keyが存在する場合はv2を優先
- v2 keyがなくv1 keyがある場合のみmigration
- v1で `games.length === 0` の場合だけlossless migration
- v1にGame recordがある場合はscore意味を推測せず `storage_migration_manual_required`
- migration成功後もlegacy v1 keyは削除しない
- Backup importも同じnormalize/migration policyを使う

この方針により、既存ProductionのGroup / Player / Session / ParticipantSegmentを保持したままv2へ移行できる。
