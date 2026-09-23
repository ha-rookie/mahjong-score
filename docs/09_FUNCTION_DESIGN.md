# 機能設計

## 1. 目的
機能一覧と機能詳細をDesign IDで管理する。

## 2. Function Catalog

| ID | 機能 | Phase | Status |
| --- | --- | --- | --- |
| FUNC-001 | Group / Player管理 | 1 | Active: UI connected |
| FUNC-002 | Session開始・参加者選択 | 1 | Active: UI connected |
| FUNC-003 | 半荘結果入力 | 1 | Planned: score rules decision pending |
| FUNC-004 | 参加者変更 | 1 | Planned |
| FUNC-005 | Chip精算 | 1 | Planned |
| FUNC-006 | 成績集計 | 1 | Planned |
| FUNC-007 | Backup export/import | 1 | Application active / UI pending |
| FUNC-008 | 認証・認可 | 2-3 | Deferred |

## 3. FUNC-003 半荘結果入力の前提

3人三麻:
- 半荘結果対象は3人
- 開始時総点105,000点

4人回し三麻:
- 局ごとの着席は3人、待機は1人
- 親番終了等に応じて人が交代する運用
- 局単位のローテーションはアプリ管理外
- 半荘結果対象は4人
- 開始時総点140,000点

入力設計:
- 半荘参加者全員をResult対象にする
- 1人分を未入力にして残りからbalance計算する方針
- 箱下を許可する
- 100点端数 / 同点順位はTBD-001 / TBD-002のHuman決定待ち

## 4. Phase 1 Vertical Slice

```text
Home
 -> Group作成
 -> Member追加
 -> 参加者選択
 -> Session開始
 -> Active Session表示
```

UIはApplication Use Caseを経由し、localStorageへ直接accessしない。

## 5. Processing Flow

```text
Event -> UI validation -> Use Case -> Domain -> Repository -> Persistence -> Result -> UI
```
