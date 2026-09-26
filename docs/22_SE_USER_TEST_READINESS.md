# SE User Test Readiness

## 1. Purpose

会社のSEメンバーへ三麻スコアを見せる前に、単なる動作デモではなく、設計・品質・運用の意図を説明できるRelease Candidate状態であることを確認する。

このGateは新しいPhaseではない。元の4 Phase roadmapにおける **Phase 3 Release Candidate Gate** とする。

## 2. Current Gate Status — BLOCKED

2026-09-27時点では、**SE User Testは開始しない**。

理由はコード上の既知S1/S2欠陥ではなく、Productionでremote D1へアクセスできず、LINE Loginを含むD1依存flowを実行できないOperational Blockerがあるため。

- ProductionでLINE Login不可
- #201のsmartphone manual smokeを完了できない
- #137のProduction felt-performance checkを完了できない
- current `main`には#203以降のRC改善に加え、#217（複数Group管理）、#218（複数Group performance fixture）、#219（複数Group authorization regression）がMerge済みだが、#205以降Production deployはmanual-onlyであり未反映
- remote D1復旧までは、benchmark / fixture / migration / deployを追加実行しない

Defect Severity上、service availabilityに重大な問題がある状態ではUser Test開始不可とする。ただし本項目は、アプリ実装の既知S1欠陥とは区別して **Operational Blocker** として管理する。

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
- Chip精算
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

## 10. Resume Checklist after D1 Recovery

remote D1へアクセス可能になった後も、いきなりUser Testへ進まない。

1. D1 access recoveryを最小限の確認で確定する
2. large fixture / benchmarkは実行しない
3. Human approval後、current `main`をmanual `workflow_dispatch`でProductionへ反映する
4. LINE LoginのProduction smokeを確認する
5. #201: 0半荘 → 取り消し → Home → 履歴へ残らない
6. #201: 1半荘保存後 → Session終了 → Results → 終了確定
7. #137: History / 通算 / 年間 / 月間 / Session Resultsの体感応答を確認する
8. #160: Android / iOSでホーム画面追加・standalone起動・通常online flowを確認する
9. 複数Groupを切り替え、履歴 / 成績 / PlayerがGroup間で混在しないことを確認する
10. S1/S2 = 0、Operational Blocker = 0を確認する
11. User Test URL / invitationを準備する
12. #165のUser Test handoffへ進む

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

Phase 2 Completion Audit: #145

RC / Performance:
- #137 Long-term performance — DB benchmark PASS, smartphone felt-performance待ち
- #201 0半荘Session cancel — implementation / CI / merge済み、smartphone smoke待ち
- #195 History delete stale recovery — completed by PR #206
- #203 D1 read optimization — merged to main
- #209 / #210 PWA installable shell / build regression validation — merged to main、実機acceptance待ち
- #217 Group management — 複数Group一覧 / 切り替え / 追加 / 名前変更を実装
- #218 Multi-group performance fixture — local D1で3 Group / 350 Sessions / 3,840 Games / 11,520 Game Resultsを検証
- #219 Multi-group authorization regression — 所属Group表示 / role分離 / 未所属Group拒否 / System Admin renameを固定

Cross-Phase Backlog:
- #160 PWA
- Phase 4 additional authentication
