# SE User Test Readiness

## 1. Purpose

会社のSEメンバーへ三麻スコアを見せる前に、単なる動作デモではなく、設計・品質・運用の意図を説明できるRelease Candidate状態であることを確認する。

このGateは新しいPhaseではない。元の4 Phase roadmapにおける **Phase 3 Release Candidate Gate** とする。

## 2. Test Positioning

User Testの目的は「粗探しを防ぐこと」ではない。

- 実際のUserが迷わず主要taskを完了できるか
- SEが気にする認証・認可・DB・排他・Error・Recoveryへ説明責任を持てるか
- Known Deferredと欠陥を混同せず説明できるか
- 指摘を受けても設計意図または改善Issueへ接続できるか

を確認する。

## 3. Release Candidate Gate

### Core Flow

- LINE Login
- Group選択
- Session開始
- 3人三麻Score入力
- 4人回し三麻Score入力
- 負Score / ±操作
- 半荘訂正
- Chip精算
- Session Memo
- Session終了
- History / 月間Calendar
- Performance
- 管理者Session削除

### Authorization

- Memberから管理者専用操作を利用できない
- Worker APIがGroup / role境界を強制する
- Invitation / User-Player linkingが正常に完了する
- logout / re-loginでSession stateが不整合にならない

### Multi-device / Concurrency

- 2端末で同じActive Sessionを開く
- stale updateを409で拒否する
- Active Session refreshで最新状態を取得する
- refresh後もscroll positionを維持する
- 未保存入力がある場合は破棄確認する

### Error UX

- API errorで画面全体が壊れない
- Userへ内部実装詳細を露出しない
- toast通知でmain layoutがjumpしない
- reload / browser backで致命的なdata不整合を起こさない

### Operations Evidence

- main CI green
- Production deploy green
- Production Security Headers確認済み
- Audit log / request correlation設計
- D1 Time Travel recovery runbook
- Preview recovery rehearsal evidence
- Public Repository secret / personal-data final scan済み

## 4. Defect Severity

| Severity | Definition | Gate |
| --- | --- | --- |
| S1 | Data integrity / authorization / service availabilityに重大な問題 | User Test開始不可 |
| S2 | Core flow失敗 / 誤集計 / concurrency / role不備 | User Test開始不可 |
| S3 | 操作迷い / responsive崩れ / 軽微な不整合 | 原則修正後に実施 |
| S4 | 文言 / cosmetic | Known issueとして許容可 |

User Test開始条件はS1/S2 = 0。

## 5. Tester Task Script

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

## 6. Observation Record

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

## 7. Three-minute SE Explanation

見せる前に以下を3分程度で説明できる状態にする。

### Why D1
Phase 1はlocalStorageで機能PoCを優先し、複数User / multi-deviceが必要になった時点でD1をsource of truthへ切り替えた。

### Why User and Player are separate
Playerは麻雀成績の主体、UserはAuthenticationの主体。ログインしていないPlayerも成績対象として存在でき、Authentication Provider変更がScore dataへ波及しない。

### Authorization
System Admin / Group Admin / Memberを分離し、Frontendの表示制御ではなくWorker API側で権限を強制する。

### Concurrency
複数端末利用を前提にSession / Gameへversionを持ち、stale updateを409で拒否する。

### Audit / Security / Recovery
業務System PoCとして、正常系だけでなくAudit、Security Headers、Secret管理、D1 Time Travel recoveryまで実装・rehearsalする。

### Known Deferred
未完成ではなく意図的にPhase外へ出したものとして説明する。

- PWA: #160
- 長期性能試験: #137
- Google等の追加Authentication: Phase 4
- GameTag UI / participant memo等の再検討項目

## 8. What to Show an SE

順番は以下を推奨する。

1. Production appでcore flow
2. LINE Login / roleの違い
3. multi-device refresh / concurrency
4. GitHub Actions green
5. Requirements Traceability
6. Security Design
7. D1 Recovery Runbook
8. Known Deferred

「全部作った」ではなく、「どこまでを今のrelease boundaryとしたか」を説明する。

## 9. User Test Exit Criteria

- S1 / S2 = 0
- Core smartphone flow success
- representative authorization case success
- representative concurrency case success
- main CI green
- Known Deferredを説明可能
- User Test URL / invitation準備済み
- Tester feedbackをIssueへ分類済み

## 10. Evidence

Tracking Issue: #165

Phase 2 Completion Audit: #145

Cross-Phase Backlog:
- #137 Long-term performance
- #160 PWA
