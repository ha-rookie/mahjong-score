# 画面設計

## 1. 目的

Screen Map、画面遷移、項目、Event、画面-Data Mapping、Wireframe/Mockの責務を管理する。

## 2. Screen Map

| Screen ID | 名称 | Route | Purpose | Actor | Permission | Phase | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SCR-001 | Home | Single-page state | 入口 / 現在状態 | User | Phase 1なし | 1 | Active |
| SCR-002 | Group / Member Setup | Home内 | Group作成 / Member追加 | User | Phase 1なし | 1 | Active |
| SCR-003 | Session Setup | Single-page state | 日付 / 参加者選択 / Session開始 | User | Phase 1なし | 1 | Active |
| SCR-004 | Score Sheet | TBD | 半荘結果入力・累計 | User | TBD | 1 | Planned |
| SCR-005 | Chip Settlement | TBD | Session終了時Chip精算 | User | TBD | 1 | Planned |
| SCR-006 | Results | TBD | Session / 日次成績 | User | TBD | 1 | Planned |
| SCR-007 | Statistics | TBD | 月・年・通算 | User | TBD | 1 | Planned |
| SCR-008 | Settings | TBD | Group / Backup等 | User | TBD | 1 | Planned |

Routerはまだ採用せず、Phase 1最初のVertical SliceはReact stateでHome / Session Setupを切り替える。

## 3. Current Flow

```text
初回
 -> Group作成
 -> Member追加
 -> Home

Home
 -> 今日の麻雀を始める
 -> Session Setup
 -> 3人/4人選択
 -> Session開始
 -> Home / Active Session表示
```

Active Session開始後のScore Sheet接続は次Feature。

## 4. Home

表示:
- アプリ名 / ブランド
- Group名
- Member数
- Active Sessionがある場合は日付・3人/4人・参加者
- Active SessionがなくMember 3人以上なら「今日の麻雀を始める」
- Member追加

状態:
- loading
- empty group
- member不足
- active session
- storage/application error
- success status

## 5. Group / Member Setup

初回Groupがない場合はGroup名入力を表示する。

Member:
- 表示名
- 追加
- 登録済み一覧
- 空欄はApplication Use Caseで拒否

Phase 1の複数Group切替UIは未決のため、このVertical Sliceでは既存先頭Groupをcurrent groupとして扱う。複数Group方針はTBDのまま維持する。

## 6. Session Setup

- 日付
- 登録済みMember一覧
- checkboxで参加 / 不参加
- 最大4人
- 3人または4人でのみ開始可能
- 選択数に応じ「3人三麻 / 4人回し三麻」を表示
- 「このメンバーで開始」
- 戻る

3人/4人のみ登録済みの場合は初期選択する。5人以上の場合は未選択から開始する。

## 7. UI Rules

- 320px以上で横スクロールさせない
- Touch targetは概ね48px以上
- 生成り背景 / 墨色 / 青緑accent
- 強い枠線やCardを多用しない
- Status/Errorは色だけに依存せずtextで伝える
- focus-visibleを明示する
- Button / TextField / Sectionを最小Reusable Componentとして利用する

## 8. Future Flow

```text
Active Session
 -> Score Sheet
      -> Result Add
      -> Participant Change
      -> Finish
           -> Chip Settlement
           -> Results
```

## 9. Screen / API / Domain / DB Mapping

Phase 1ではDB ColumnをN/Aとし、Use Case / Domain / localStorage modelとの対応を追跡する。Phase 2でAPI/DB Mappingを追加する。
