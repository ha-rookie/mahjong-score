# 画面設計

## 1. 目的

Screen Map、画面遷移、項目、Event、画面-Data Mapping、Wireframe/Mockの責務を管理する。

## 2. Screen Map

| Screen ID | 名称 | Route | Purpose | Actor | Permission | Phase | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SCR-001 | Home | Single-page state | 入口 / 現在状態 | User | Phase 1なし | 1 | Active |
| SCR-002 | Group / Member Setup | Home内 | Group作成 / Member追加 | User | Phase 1なし | 1 | Active |
| SCR-003 | Session Setup | Single-page state | 日付 / 参加者選択 / Session開始 | User | Phase 1なし | 1 | Active |
| SCR-004 | Score Sheet | Single-page state | 半荘結果入力・累計 | User | Phase 1なし | 1 | Active |
| SCR-005 | Chip Settlement | Score Sheet内 | Session Chip精算・最終合計 | User | Phase 1なし | 1 | Active |
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

Active Session開始後は「＋ 半荘結果を追加」からScore Sheetへ遷移する。

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

## 7. Score Sheet

Production実機レビューで紙の麻雀得点記録表を操作モデルとして採用する。

- Active Session画面そのものをScore Sheetとする
- 列 = 現在ParticipantSegmentのPlayer
- 行 = 保存済みGame（半荘）
- 最下部に新規入力行を常設
- 3人なら任意2セル、4人なら任意3セルを入力
- 残り1セルは合計0になるよう自動計算して同じ行に表示
- 順位選択 / 順位並べ替えUIは持たない
- 1pt=1,000点、小数入力不可、負値可
- 負数は数字入力後の`±`操作で符号を切り替え、スマホキーボードで`-`を探さなくてよい
- 小計行をPlayer列ごとに表示
- 保存成功後もScore Sheetに留まり次の半荘入力へ続けられる
- Active Session中はGroup / Member追加UIを隠す
- 保存済みGame行は鉛筆アイコンから編集する。削除は訂正中だけゴミ箱アイコンを表示し、実行前に確認を要求する
- Game入力時に役満を直接ボタンで選択でき、対象Player選択は行わない
- ChipはPlayer固定列でN-1入力、残り1人を合計0で自動計算し、換算（1枚=5pt）と最終合計を表示する
- Session memo / Participant memoを同じActive Session内で編集・保存する
- 4人回し三麻は4固定列で実装済み。Productionスマホ実機確認はMerge後Evidenceとして残す

## 8. UI Rules

- 320px以上で横スクロールさせない
- Touch targetは概ね48px以上
- 生成り背景 / 墨色 / 青緑accent
- 強い枠線やCardを多用しない
- Status/Errorは色だけに依存せずtextで伝える
- focus-visibleを明示する
- Button / TextField / Sectionを最小Reusable Componentとして利用する

## 9. Future Flow

```text
Active Session
 -> Score Sheet
      -> Result Add
      -> Participant Change
      -> Finish
           -> Chip Settlement
           -> Results
```

## 10. Screen / API / Domain / DB Mapping

Phase 1ではDB ColumnをN/Aとし、Use Case / Domain / localStorage modelとの対応を追跡する。Phase 2でAPI/DB Mappingを追加する。
