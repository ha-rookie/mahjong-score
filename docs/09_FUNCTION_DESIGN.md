# 機能設計

## 1. 目的

機能一覧と機能詳細をDesign IDで管理する。

## 2. Function Catalog

| ID | 機能 | Phase | Status |
| --- | --- | --- | --- |
| FUNC-001 | Group / Player管理 | 1 | Active: UI connected |
| FUNC-002 | Session開始・参加者選択 | 1 | Active: UI connected |
| FUNC-003 | 半荘結果入力 | 1 | Planned |
| FUNC-004 | 参加者変更 | 1 | Planned |
| FUNC-005 | Chip精算 | 1 | Planned |
| FUNC-006 | 成績集計 | 1 | Planned |
| FUNC-007 | Backup export/import | 1 | Application active / UI pending |
| FUNC-008 | 認証・認可 | 2-3 | Deferred |

## 3. Phase 1 Vertical Slice

Issue #12で最初のRuntime Vertical Sliceを接続する。

```text
Home
 -> Group作成
 -> Member追加
 -> 参加者選択
 -> Session開始
 -> Active Session表示
```

UIはApplication Use Caseを経由し、localStorageへ直接accessしない。

## 4. Read Query Use Cases

- ListGroupsUseCase
- ListPlayersByGroupUseCase
- GetActiveSessionUseCase

Write Use Caseと同じApplication境界へ置き、PresentationからRepository実装を直接操作しない。

## 5. Function Detail Template

各FunctionはPurpose、Actor、Preconditions、Trigger、Normal/Alternate/Error Flow、Validation、Authorization、Transaction、Audit、Message、Data、IF、NFRを持つ。

## 6. Processing Flow

```text
Event -> UI validation -> Use Case -> Domain -> Repository -> Persistence -> Result -> UI
```
