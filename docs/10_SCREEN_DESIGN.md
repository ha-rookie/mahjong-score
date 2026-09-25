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
| SCR-008 | Backup | Home内 | Legacy localStorage JSON Backup / Restore | Admin | D1運用時はRecovery Runbookを使用 | 1 | Active |

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

複数Group所属に対応する。所属Groupが1つの場合は切替UIを表示せず、2つ以上の場合のみHomeにGroup切替UIを表示する。切替後はMember / Active Session / History / Performanceを選択Group単位で再読込する。Group作成はSystem Adminに限定し、Worker API側でも認可する。

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
- 列 = Session開始時ParticipantSegmentのPlayer。Phase 1ではSession中に参加者を変更しない
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
- ChipはPlayer固定列でN-1入力、残り1人を合計0で自動計算し、換算（1枚=5pt）と最終合計を表示する。保存済みChipは全員分を再表示・再編集でき、合計0なら何度でも更新保存できる
- Session memoはActive Session内で編集・保存する。Participant memo UIはPhase 1対象外とし、将来の本人識別・認可導入後に自分のmemoだけを表示・編集する
- 4人回し三麻は4固定列で実装済み。Productionスマホ実機確認はMerge後Evidenceとして残す

### Phase 1の参加者変更運用
- Session開始後の参加者追加・離脱UIは設けない
- 途中離脱が発生した場合は現在のSessionをチップ精算し、Results確認後に終了を確定する
- その後、残ったメンバーで新しいSessionを開始する
- 同一Session内で参加者構成を変更する機能は将来検討とする

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


### Active Session終了操作
- スコア表・精算欄の後に「Sessionを終了」を配置する
- 誤操作防止の確認を行う
- 成功後はHomeへ戻し、「今日の麻雀を始める」を再表示する


### 訂正操作の実機改善
- 訂正開始時も新規入力と同じN-1入力 + 1人自動計算を維持する
- 保存済み結果の最後のParticipant列を自動計算対象として空欄にし、他の既存値を編集可能にする
- 鉛筆アイコンは視認性を上げ、44x44px以上のタップ領域を確保する
- 訂正中のゴミ箱も同じ操作領域に収め、48pxのタップ領域を確保する


### Production実機レビュー追補
- 編集用鉛筆はタップ領域だけでなく記号自体を約2remで表示し、狭幅スマホでも一目で編集操作と認識できること
- 訂正終了と削除は同一の操作行に固定し、削除アイコンが画面右下へ独立して浮いて見えないこと


### 編集アイコンの実装基準
- フォント依存のUnicode鉛筆記号は使用しない
- 19x19pxのinline SVGを44x44px以上のbutton内に中央配置する
- SVGはcurrentColorを使い既存accentを継承し、外部icon dependencyは追加しない


### SCR-006 Results 実装
- Session終了操作後、finalize前の確認画面として表示する
- Active SessionのResultsでは「修正する」「終了を確定」を表示する
- 「修正する」はActive Sessionへ戻し、「終了を確定」で初めてfinalizedにする
- finalized済みの過去Resultsはread-onlyで表示する
- Score Sheetと同じPlayer固定列を使う
- 行は半荘、小計、チップ、換算、合計、順位
- Homeへ戻る操作を提供する
- finalized Sessionの訂正は行わない
- Session memoが保存されている場合は、日付・対局概要の下、Score Sheetの前に表示する。空の場合は表示しない


### HISTORY / Results再表示
- Homeに「過去の麻雀を見る」を配置
- finalized Sessionを新しい順で表示
- 選択するとResults画面を再利用する
- Results表は上端と下端の両方にPlayer名を表示する
- 過去Session一覧は各Sessionを1行にまとめ、「日付 / N半荘 / Session memo / 削除」を横並び表示する。memoが長い場合は一覧では省略し、全文はResultsで確認する


### Game Tag UI Phase 1対象外
- 実機確認により、想定していたタグ利用方法と現行UIに差があるためPhase 1画面から除外する
- 4人結果表は横幅をScore表示に優先し、タグ列を追加しない
- Domain互換のGame.tagsは残すが、新規/訂正UIからは空配列を保存する
- タグ仕様を再定義するまでUIを再導入しない


### PERFORMANCE
- Homeに「通算成績を見る」を配置する
- Playerごとに最終pt、麻雀pt、1位回数、Session数、半荘数を表示する
- 最終pt降順で表示する


### PERFORMANCE period controls
- 成績画面上部で「通算 / 年間 / 月間」を切り替える
- 年間は年、月間は年+月を選択する
- 初期表示は通算とする


### Home member summary / Member management
- Homeでは登録人数とメンバー名をコンパクト表示し、頭文字アイコンと常設追加フォームは表示しない
- Homeから「メンバー管理」へ遷移する
- メンバー管理では一覧を表示し、「＋ メンバーを追加」を押した時だけ追加フォームを開く
- 名前変更・削除はデータ整合性設計を伴うため本変更では実装しない


### Performance diverging point chart
- 成績画面でPlayer名を中央列に固定する
- 最終ptが負なら名前から左、正なら右へ棒を伸ばす
- 棒長は表示対象Playerの最大絶対値を100%として正規化する
- 数値を棒の外側に表示し、0ptも明示する
- 通算/年間/月間の現在の集計結果と連動し、既存数値一覧は下に残す


### JSON Backup / Restore
- Backup / Restoreは管理者機能とする
- Current runtimeではSystem Admin / Group Admin / Memberのroleに基づき表示を制御し、Worker API側でも同じauthorization boundaryを強制する
- 認証・認可導入後はAdminにだけ表示・実行を許可する
- Homeから端末Dataをschema version付きJSONとして保存できる
- 復元はJSONファイルを選択し、現在Dataを置換する前に確認を表示する
- 不正JSON / 不正schemaは拒否し、既存Dataを保持する
- 復元成功後はHomeを再読込する


## Active Session manual refresh
- SCORE SHEET見出し右側に円形矢印アイコン付き「更新」操作を配置する
- 更新は自動PollingではなくUser操作で実行する
- Session / Game / Chip / Session Memoをserverの最新状態へ差し替える
- 未保存入力がある場合のみ確認Dialogを表示し、明示確認後に破棄する
- 更新失敗時は現在の未保存入力を保持する
- 他端末でSession終了済みの場合は対局中画面を閉じる


## Toast notifications
- 成功/状態通知とエラー通知は本文レイアウトを押し下げないfixed toastとして表示する
- 成功通知は約3秒で自動消去する
- エラー通知は利用者が閉じるまで保持する
- 通知はheader直下の画面上部に重ねて表示し、SCORE SHEET等の位置を変えない


## Active Session refresh visibility
- active Session中の更新操作はsticky app headerに配置し、SCORE SHEETをスクロールしても常時操作可能にする
- 見出し内には更新ボタンを重複表示しない
- 画面幅が極端に狭い場合は「更新」文字を隠し、更新アイコンのみ残す
