# Session Result Sharing Design

## 1. Purpose

Issue #326 の確定済みSession結果共有を設計する。

本機能はLINEやGoogle Chatの専用連携ではなく、BrowserのWeb Share APIを利用する汎用共有とする。特定サービスへの自動投稿、Bot、Webhookは導入しない。

## 2. Design IDs

- `FUNC-012`: finalized Session結果共有
- `SCR-006`: Results画面拡張
- `ITEM-012-01`: 共有ボタン
- `EVT-012-01`: 共有開始
- `MSG-012-01`: 共有内容コピー成功

Related Issue: #326
Future deep link: #327

## 3. Scope Lock

### In Scope

- 「過去の麻雀」から開いた `finalized` Session Resultsだけを共有可能にする
- 日付右側に軽量な「共有」操作を置く
- 対局日、対局形式、半荘数、Session最終順位、合計ptを共有する
- Web Share APIでOS共有シートを開く
- Web Share API非対応時はClipboardへ共有本文とTOP URLをコピーする
- 共有先URLは三麻スコアのTOP URLとする

### Out of Scope

- Active Session / 終了確定前Resultsの共有
- Session deep link
- LINE Login後の共有元Session復帰
- LINE Messaging API / LIFF / Flex Message
- Google Chat API / Incoming Webhook / Card Message
- Sessionメモ / 半荘メモ / 各半荘スコア内訳の共有
- DB schema変更

## 4. UI

`SCR-006 Results` のHistory表示時のみ共有操作を表示する。

```text
SESSION RESULTS

2026-09-30                         ↗ 共有
3人三麻・6半荘
```

Rules:

- `resultsBackView = history` かつ `session.status = finalized` 相当の状態だけに表示する
- 日付と同じSession header領域の右側に配置する
- 主操作ではないため塗りつぶしのPrimary buttonにはしない
- 44px以上のtap targetを確保する
- 320px以上で日付と共有操作が衝突しないことを確認する
- 対局中Resultsには表示しない

## 5. Share Text

標準形式:

```text
🀄 三麻スコア
2026-09-30｜3人三麻・6半荘

🥇 田中　+208
🥈 石村　-82
🥉 山名　-126

三麻スコアを開く
https://<app>/
```

Web Share APIでは `text` と `url` を分けて渡す。`text` 末尾は「三麻スコアを開く」とし、`url` はOriginのTOP `/` とする。Clipboard fallbackでは `text + URL` を1つの文字列にする。

4人回し三麻では4人目も共有し、表示ラベルは1〜3位を `🥇 / 🥈 / 🥉`、4位を `4位` とする。

## 6. Score / Rank Derivation

共有用Session最終ptは既存Results表示と同じ意味に合わせる。

```text
mahjongPoint(player)
  = Session内Game scorePoint合計

chipPoint(player)
  = Session chipCount × Session chipRate

finalPoint(player)
  = mahjongPoint + chipPoint
```

Session順位はfinalPointの降順とし、同点時は既存Resultsのcompetition rankingと同じく「自分より高いfinalPointの人数 + 1」と同等の順位を使う。

共有処理は保存Dataを書き換えない。共有用集計値をDBへ追加保存しない。

## 7. Processing Flow

```text
History
  -> finalized Session Results
      -> 共有
          -> 必要なread dataを取得
          -> 共有本文を生成
          -> navigator.share が利用可能
               -> OS共有シート
               -> User cancelは無通知
          -> navigator.share 非対応
               -> Clipboard copy
               -> 「共有内容をコピーしました。」
```

共有準備のreadに失敗した場合、共有シートは開かず通常のError Toastで通知する。

## 8. Security / Privacy

共有本文へ以下を含めない。

- Session ID
- Group ID / Player ID
- Cookie / Token / Authentication情報
- Sessionメモ
- 半荘メモ
- 内部Version / Audit情報

TOP URLは `window.location.origin + "/"` 相当とし、現在URLのquery/hash/pathを引き継がない。

## 9. Failure Handling

- `AbortError`: Userによる共有キャンセルとして無通知
- Web Share API失敗: 「結果を共有できませんでした。」
- Clipboard fallback成功: `MSG-012-01`「共有内容をコピーしました。」
- Clipboard fallback失敗: 「共有内容をコピーできませんでした。」
- read data取得失敗: 「共有する結果を準備できませんでした。」

## 10. Validation

Automated:

- 共有本文に日付 / mode / 半荘数 / finalPoint順位が含まれる
- chip換算込みfinalPointを使う
- memo / internal IDを共有本文へ含めない
- 3人 / 4人の表示
- 同点順位
- TOP URL正規化

Human / device:

- History finalized Resultsだけに共有buttonが表示される
- 日付右側のUIが320px以上で破綻しない
- Android Chrome / ホーム画面Web Appで共有シートが開く
- LINE / Google Chatを共有先として選択できる
- 共有キャンセル時にError Toastが出ない

## 11. Future

Session詳細deep linkとログイン後復帰はIssue #327で別設計とする。#326の初版には混ぜない。
