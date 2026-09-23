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
- 0.1point単位を許可
- 最終持点そのものは入力元にしない
- 1位Score Pointは2位以下の合計の符号反転で算出
- GameResult全体のScore Point合計は0.0
- 負値を許可

## 4. Current Model Gap

現在のRuntime `GameResult` は `finalPoints` と `mahjongScore` を保持しているが、Human確認済みの入力契約は「Score Point直接入力」である。

Score Domain実装Issueで、GameResultの永続化契約を入力仕様に合わせて整理する。半荘結果入力UIはまだ未実装でProduction上にGame recordは作成されないため、既存User操作DataへのGame migrationは発生していない。

候補:
```text
GameResult
- playerId
- scorePoint

rankはGame.resultsの配列順で表現
```

schemaVersionを維持するか更新するかは実装Issueでstrict validator / Backup互換性を確認して決定する。

## 5. Invariants

- ParticipantSegmentは3人または4人
- 同一Segment内Player重複禁止
- GameResultはParticipantSegment人数と一致する3人または4人
- GameResult内Player重複禁止
- GameResultのPlayer集合は対象ParticipantSegmentのPlayer集合と一致する
- Game.results順序をrankとして保持
- Score Pointは0.1point単位
- Score Point合計は0
- 1位Scoreは自動算出
- negative Score Pointを許可
- ChipResult内Player重複禁止
- Chip合計は0

## 6. Score Calculation Decisions

| Rule | Decision |
| --- | --- |
| user input | Score Point直接入力 |
| precision | 0.1point |
| rounding | なし |
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

GameResult contract変更は次Implementation IssueでBackup互換性とともに扱う。
