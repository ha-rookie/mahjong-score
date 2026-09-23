# Code / Message / Terminology設計

## 1. 業務Code

source codeのcoding ruleではなく、業務区分値を管理する。

| CODE ID | Group | Value | Display | Meaning | Phase | Status |
| --- | --- | --- | --- | --- | --- | --- |
| CODE-001 | SESSION_STATUS | ACTIVE | 進行中 | Session進行中 | 1 | Candidate |
| CODE-002 | SESSION_STATUS | FINALIZED | 確定 | Session確定済み | 1 | Candidate |
| CODE-003 | GAME_TAG | YAKUMAN | 役満 | Game event | 1 | Candidate |
| CODE-004 | GAME_TAG | DOUBLE_YAKUMAN | ダブル役満 | Game event | 1 | Candidate |

## 2. Label Catalog

- 「参加者」と「メンバー」の用途を区別
- UIでは内部語 `ParticipantSegment` を表示せず「現在の参加者」「参加者を変更」を使う
- 「4人回し三麻」は四人麻雀を意味しない

## 3. 用語集

| TERM ID | 用語 | 定義 | UI表示 | Notes |
| --- | --- | --- | --- | --- |
| TERM-001 | Session | 1回の麻雀会。日付とは別概念 | Session表記は必要に応じ日本語化 | 同日複数可 |
| TERM-002 | ParticipantSegment | Session中の半荘参加者構成が一定な区間 | 原則非表示 | 3人または4人 |
| TERM-003 | Game | 1半荘の結果単位 | 対局 / 半荘 | 局単位ではない |
| TERM-004 | Player | 麻雀成績の主体 | メンバー/参加者 | Userとは分離 |
| TERM-005 | User | 認証・操作主体 | 将来 | Playerと別Entity |
| TERM-006 | 4人回し三麻 | 4人で参加し、各局は3人着席+1人待機で交代しながら行う三麻 | 4人回し三麻 | 半荘結果は4人分 |
| TERM-007 | 局 | 半荘内の個別局 | 原則UI管理外 | Phase 1ではrotation記録なし |

用語変更時はScreen/Message/Codeとの影響を確認する。
