# 機能設計

## 1. 目的
機能一覧と機能詳細をDesign IDで管理する。

## 2. Function Catalog

| ID | 機能 | Phase | Status |
| --- | --- | --- | --- |
| FUNC-001 | Group / Player管理 | 1 | Planned |
| FUNC-002 | Session開始・参加者選択 | 1 | Planned |
| FUNC-003 | 半荘結果入力 | 1 | Planned |
| FUNC-004 | 参加者変更 | 1 | Planned |
| FUNC-005 | Chip精算 | 1 | Planned |
| FUNC-006 | 成績集計 | 1 | Planned |
| FUNC-007 | Backup export/import | 1 | Planned |
| FUNC-008 | 認証・認可 | 2-3 | Deferred |

## 3. Shared Foundation

Issue #6ではFeature実装前の共通境界としてRepository Ports、Error、Validation、Logger contractを実装する。これはFUNC-001〜007を横断する基盤であり、単独のUser機能とは扱わない。

## 4. Function Detail Template

各FunctionはPurpose、Actor、Preconditions、Trigger、Normal/Alternate/Error Flow、Validation、Authorization、Transaction、Audit、Message、Data、IF、NFRを持つ。

## 5. Processing Flow

```text
Event -> UI validation -> Use Case -> Domain -> Repository -> Persistence -> Result -> UI
```
