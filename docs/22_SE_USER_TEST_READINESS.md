# SE User Test Readiness

## 1. Purpose

会社のSEメンバーへ三麻スコアを見せる前に、単なる動作デモではなく、設計・品質・運用の意図を説明できるRelease Candidate状態であることを確認する。

このGateは新しいPhaseではない。元の4 Phase roadmapにおける **Phase 3 Release Candidate Gate** とする。

## 2. Current Gate Status — READY

2026-09-27時点で、**SE User Testを開始可能**。

RC Gate再監査結果:
- known S1 / S2 / User Test前S3 blocker: 0
- Operational Blocker: 0
- current main: Production反映済み
- Android / iPhone: LINE Login / D1 data PASS
- #201 smartphone smoke: PASS
- #137 Production felt-performance: PASS
- #230 / #231 mobile UI polish: PASS
- authorization / multi-group representative gates: PASS
- configurable Mahjong rules representative gates: PASS
- #263 Mutation Boundary全面監査: completed
- stale Game edit / History Session delete / stale Session finalize: Production representative PASS
- #264 iPhone form-focus auto-zoom: Production real-device PASS
- Open Issue再監査: #165以外 0件

large fixture / benchmarkは引き続きremote D1へ投入せず、local D1 regressionを正本とする。

## 3. Test Positioning

User Testの目的は「粗探しを防ぐこと」ではない。

- 実際のUserが迷わず主要taskを完了できるか
- SEが気にする認証・認可・DB・排他・Error・Recoveryへ説明責任を持てるか
- Known Deferredと欠陥を混同せず説明できるか
- 指摘を受けても設計意図または改善Issueへ接続できるか

を確認する。

## 4. Release Candidate Gate

### Core Flow

- LINE Login
- Group選択 / 複数Group切り替え
- System AdminによるGroup追加 / 名前変更
- Session開始
- 3人三麻Score入力
- 4人回し三麻Score入力
- 負Score / ±操作
- 半荘訂正
- Chip精算（各SessionにsnapshotされたchipRateを使用）
- Group標準ルール / Session固有ルール（持ち点・返し点はルール記録、半荘は精算済み±ポイントを直接入力）
- Session Memo
- Session終了
- 0半荘Session取り消し
- History / 月間Calendar
- Performance
- 管理者Session削除

### Authorization

- Memberから管理者専用操作を利用できない
- Worker APIがGroup / role境界を強制する
- 複数Group所属Userには所属Groupのみ表示し、未所属Groupへのaccessを拒否する
- Groupごとのmember / group_admin roleを独立して扱う
- System Adminのみ全Groupの追加 / 名前変更が可能
- Invitation / User-Player linkingが正常に完了する
- logout / re-loginでSession stateが不整合にならない

### Multi-device / Concurrency

- 2端末で同じActive Sessionを開く
- stale updateを409で拒否する
- Active Session refreshで最新状態を取得する
- refresh後もscroll positionを維持する
- 未保存入力がある場合は破棄確認する
- 履歴Session削除のstale_update後に対象月を自動再読込して再操作できる

### Error UX

- API errorで画面全体が壊れない
- Userへ内部実装詳細を露出しない
- toast通知でmain layoutがjumpしない
- reload / browser backで致命的なdata不整合を起こさない

### Operations Evidence

- PR CI: lint / test / build / static security headers / local D1 migration
- Production Security Headers確認済みの過去Evidence
- Audit log / request correlation設計
- D1 Time Travel recovery runbook
- Preview recovery rehearsal evidence
- Public Repository secret / personal-data final scan済み
- Production deployは#205以降manual-only

「過去にProduction deployがgreenだったこと」と「current mainがProductionへ反映済みであること」は分けて扱う。

## 5. Defect Severity

| Severity | Definition | Gate |
| --- | --- | --- |
| S1 | Data integrity / authorization / service availabilityに重大な問題 | User Test開始不可 |
| S2 | Core flow失敗 / 誤集計 / concurrency / role不備 | User Test開始不可 |
| S3 | 操作迷い / responsive崩れ / 軽微な不整合 | 原則修正後に実施 |
| S4 | 文言 / cosmetic | Known issueとして許容可 |

User Test開始条件はS1/S2 = 0に加え、認証を含むProduction core flowが実行可能であること。

## 6. Tester Task Script

説明しすぎず、taskだけ渡して操作を観察する。

1. LINEでログインしてください
2. 3人でSessionを開始してください
3. 2半荘を入力してください
4. 1件のScoreを訂正してください
5. ChipとMemoを入力してSessionを終了してください
6. 今月の履歴からそのSessionを探してください
7. 通算成績を確認してください
8. 管理者としてMember招待を行ってください
9. 別端末で同じActive Sessionを開き、更新競合とrefreshを確認してください

User Test前のOwner smokeとして、0半荘Sessionの取り消しと履歴へ残らないことも確認する。

## 7. Observation Record

Testerごとに以下を残す。

- task success / failure
- 完了までに迷った箇所
- 説明を求められた箇所
- bug
- UX improvement
- Architecture / Securityへの質問
- severity
- fix / defer / no-change decision

Testerの発言をそのまま仕様へ反映せず、複数の事象と既存設計を照合して判断する。

## 8. Three-minute SE Explanation

見せる前に以下を3分程度で説明できる状態にする。

### Why D1
Phase 1はlocalStorageで機能PoCを優先し、複数User / multi-deviceが必要になった時点でD1をsource of truthへ切り替えた。

### Why User and Player are separate
Playerは麻雀成績の主体、UserはAuthenticationの主体。ログインしていないPlayerも成績対象として存在でき、Authentication Provider変更がScore dataへ波及しない。

### Authorization
System Admin / Group Admin / Memberを分離し、Frontendの表示制御ではなくWorker API側で権限を強制する。

### Concurrency
複数端末利用を前提にSession / Gameへversionを持ち、stale updateを409で拒否する。競合検知だけで終わらず、Active Session refreshや履歴削除後の再読込で回復導線も用意する。

### Audit / Security / Recovery
業務System PoCとして、正常系だけでなくAudit、Security Headers、Secret管理、D1 Time Travel recoveryまで設計・検証する。

### Performance
5年相当 / 10年相当の長期データでDB benchmarkを実施済み。#203でActive Session / Games / Segmentsのread pathをbounded queryへ変更し、query-count regression testを追加した。#218ではlocal D1の実運用fixtureを3 Group・350 Sessions・3,840 Games・11,520 Game Resultsへ拡張し、Group別件数とPlayer分離を検証している。残りはD1復旧後のProduction smartphone felt-performance check。

### Known Deferred
未完成ではなく意図的にPhase外へ出したものとして説明する。

- PWA: #160 — installable shell / build regressionは実装済み。Production反映後のAndroid / iOS実機acceptance待ち
- Google等の追加Authentication: Phase 4
- GameTag UI / participant memo等の再検討項目

#137はKnown Deferredではなく、DB performance evidence取得済み・Production実機確認待ちのGate残件として扱う。

## 9. What to Show an SE

D1復旧後、順番は以下を推奨する。

1. Production appでcore flow
2. LINE Login / roleの違い
3. multi-device refresh / concurrency
4. GitHub Actions green
5. Requirements Traceability
6. Security Design
7. D1 Recovery Runbook
8. Long-term performance evidence
9. Known Deferred

「全部作った」ではなく、「どこまでを今のrelease boundaryとしたか」を説明する。

## 10. SE User Test Handoff

### Production URL

https://mahjong-score.ha-rookie.workers.dev/

### Tester setup

1. Tester本人のLINEアカウントでProductionへログインしてもらう
2. Owner側でUser Test用Groupへ招待する
3. 最初はMember権限でcore flowを実施する
4. 管理者taskを行うTesterだけ、必要な時点でGroup Adminへ変更する
5. System Admin権限は通常のTesterへ付与しない

本番の既存Group / 実データをテスト用に流用せず、User Test専用Groupを作ることを推奨する。

### Testerへ渡すTask

説明で誘導しすぎず、まず以下だけを渡す。

1. LINEでログインする
2. 3人のSessionを開始する
3. 2半荘入力する
4. 保存済みの1半荘を訂正する
5. ChipとMemoを入力してSessionを終了する
6. 今月の履歴から今のSessionを探す
7. 通算成績を確認する
8. Group Admin権限を付与されたTesterはMember招待を試す
9. 2端末を使える場合は同じActive Sessionを開き、片方で更新した後にもう片方から古い状態で更新して挙動を確認する

### Feedback record

各指摘は以下へ分類する。

| Field | Record |
| --- | --- |
| Task | 何をしていたか |
| Result | success / failure |
| Observation | 迷った・分からなかった・期待と違った内容 |
| Reproduction | 再現手順 |
| Category | defect / UX improvement / question |
| Severity | S1 / S2 / S3 / S4 |
| Decision | fix / defer / no-change |

S1 / S2が見つかった場合はRC Gateへ戻す。S3 / S4は内容を評価し、User Test継続可否を判断する。

## 11. User Test Exit Criteria

- S1 / S2 = 0
- Operational Blocker = 0
- Core smartphone flow success
- representative authorization case success
- representative concurrency case success
- current mainのProduction反映確認
- PR CI green
- manual Production workflow green
- Known Deferredを説明可能
- User Test URL / invitation準備済み
- Tester feedbackをIssueへ分類済み

## 12. Evidence

Tracking Issue: #165

Current RC evidence:
- #137: Production felt-performance PASS
- #201: 0半荘取消 / 1半荘通常終了 smartphone PASS
- #217-#219: Group management / multi-group authorization
- #221-#228: configurable Mahjong rules + regression guards
- #248 / #254 / #256: D1 source-of-truth / persistence selector
- #259 / PR #260: stale Game edit fix + Production PASS
- #261 / PR #262: History stale delete + Mutation Boundary remediation
- #263: Mutation Boundary全面監査 completed
- #264 / PR #265: iPhone form-focus auto-zoom Production PASS

Current readiness:
- known S1 / S2 / User Test前S3 blocker: 0
- Operational Blocker: 0
- #165以外のOpen Issue: 0
- SE User Test: READY
