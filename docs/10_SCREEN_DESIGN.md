# 画面設計

## 1. 目的
Screen Map、画面遷移、項目、Event、画面-Data Mapping、Wireframe/Mockの責務を管理する。

## 2. Screen Map

| Screen ID | 名称 | Route | Purpose | Actor | Permission | Phase | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SCR-001 | Home | TBD | 入口 / 現在状態 | User | Phase 1なし | 1 | Planned |
| SCR-002 | Group | TBD | Group / Member選択 | User | TBD | 1 | Planned |
| SCR-003 | Session Setup | TBD | Session開始 | User | TBD | 1 | Planned |
| SCR-004 | Score Sheet | TBD | 半荘結果入力・累計 | User | TBD | 1 | Planned |
| SCR-005 | Chip Settlement | TBD | Session終了時Chip精算 | User | TBD | 1 | Planned |
| SCR-006 | Results | TBD | Session / 日次成績 | User | TBD | 1 | Planned |
| SCR-007 | Statistics | TBD | 月・年・通算 | User | TBD | 1 | Planned |
| SCR-008 | Settings | TBD | Group / Backup等 | User | TBD | 1 | Planned |

RouteはRouting採用時に確定する。

## 3. Screen Flow

```text
Home
 -> Group
 -> Session Setup
 -> Score Sheet
      -> Result Add
      -> Participant Change
      -> Finish
           -> Chip Settlement
           -> Results

Home
 -> Statistics

Home
 -> Settings
```

## 4. Screen Detail Template

各画面は以下を持つ。
- Screen ID / name / route
- purpose
- entry / exit
- required permission
- responsive behavior
- initial / loading / empty / error / disabled states
- field definitions
- event definitions
- message IDs
- analytics events
- audit target
- accessibility notes

## 5. Item Definition

| Field | 内容 |
| --- | --- |
| ITEM ID | ITEM-xxx |
| Screen | SCR-xxx |
| Label ID | LABEL-xxx |
| Control | input/select/button等 |
| Type | string/number/date等 |
| Required | Yes/No |
| Length/Range | 制約 |
| Format | 表示・入力形式 |
| Default | 初期値 |
| Validation | rule |
| Permission | view/edit |
| Message | MSG-xxx |

## 6. Event Definition

| Field | 内容 |
| --- | --- |
| EVT ID | EVT-xxx |
| Trigger | click/change/load/submit |
| Preconditions | 実行条件 |
| Process | 処理 |
| Success | 成功時 |
| Failure | 失敗時 |
| Navigation | 遷移 |
| Audit | Yes/No |
| Analytics | Event ID |

## 7. Screen / API / Domain / DB Mapping

Phase 2で以下を管理する。

| MAP ID | Screen Item | API Field | Domain Field | DB Column | Conversion |
| --- | --- | --- | --- | --- | --- |
| MAP-001 | TBD | TBD | TBD | TBD | TBD |

Phase 1ではDB ColumnをN/Aとし、localStorage modelとの対応を記録する。

## 8. Wireframe / Mock / Production

```text
Wireframe
 -> information hierarchy / flow review
HTML or React Mock
 -> visual / responsive / state review
Production
 -> real data / security / performance verification
```

Design Previewは正本ではない。
