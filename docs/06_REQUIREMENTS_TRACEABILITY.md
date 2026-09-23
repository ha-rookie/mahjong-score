# Requirements Traceability

## 1. 目的

要件が設計・Issue・実装・テストへ落ちているかを追跡し、設計を深掘りした結果として初期要件が暗黙に消えることを防ぐ。

## 2. 状態

- ACTIVE: 現在有効
- REPLACED: 目的を保ち別仕様へ置き換え
- DEFERRED: 後続Phaseへ延期
- REMOVED: 明示的に削除
- TBD: 方針または詳細未確定

ACTIVE / NEW相当の要件をDEFERRED/REMOVEDへ変える場合はIssue/PRに理由を残す。

## 3. Traceability Matrix

| Requirement | Summary | Design IDs | ADR | Issue/PR | Implementation | Test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-001 | CHANGE-ME | APP-001, UI-001 | ADR-0001 | #CHANGE-ME | CHANGE-ME | CHANGE-ME | ACTIVE |
| NFR-001 | CHANGE-ME | ARCH-001 | ADR-0002 | #CHANGE-ME | CHANGE-ME | CHANGE-ME | ACTIVE |

## 4. 変更ルール

1. 新要件を追加したらRequirement IDを採番
2. 対応する設計IDまたはADRを関連付ける
3. 実装Issue/PRを関連付ける
4. Testまたは確認方法を関連付ける
5. 要件変更時は状態と理由を更新する

## 5. Coverage Review

Release前に確認する。

- ACTIVEなRequirementに設計があるか
- ACTIVEなRequirementに実装または明示的な未実装理由があるか
- Test/確認方法があるか
- REPLACED/DEFERRED/REMOVEDに理由が残っているか
- 実装だけ存在し要件に紐づかない機能がないか
