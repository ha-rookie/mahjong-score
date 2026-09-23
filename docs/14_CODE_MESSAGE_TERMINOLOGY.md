# Code / Message / Terminology設計

## 1. 業務Code

source codeのcoding ruleではなく、業務区分値を管理する。

| CODE ID | Group | Value | Display | Meaning | Phase | Status |
| --- | --- | --- | --- | --- | --- | --- |
| CODE-001 | SESSION_STATUS | ACTIVE | 進行中 | Session進行中 | 1 | Candidate |
| CODE-002 | SESSION_STATUS | FINALIZED | 確定 | Session確定済み | 1 | Candidate |
| CODE-003 | GAME_TAG | YAKUMAN | 役満 | Game event | 1 | Candidate |
| CODE-004 | GAME_TAG | DOUBLE_YAKUMAN | ダブル役満 | Game event | 1 | Candidate |

確定前のCodeはCandidateとして扱う。

## 2. Message Catalog

| MSG ID | Severity | User Message | Display | Log Detail | Retry |
| --- | --- | --- | --- | --- | --- |
| MSG-001 | Error | TBD | Form/Page/Toast | TBD | TBD |

原則:
- User向けmessageと運用Log detailを分離
- stack trace / SQL / SecretをUserへ表示しない
- validation / warning / error / successを区別する
- i18n採用時もMessage IDをstableにする

## 3. Label Catalog

同一概念の表記揺れを防ぐ。

- 「参加者」と「メンバー」の用途を区別
- UIでは内部語 `ParticipantSegment` を表示せず「現在の参加者」「参加者を変更」を使う

## 4. 用語集

| TERM ID | 用語 | 定義 | UI表示 | Notes |
| --- | --- | --- | --- | --- |
| TERM-001 | Session | 1回の麻雀会。日付とは別概念 | Session表記は必要に応じ日本語化 | 同日複数可 |
| TERM-002 | ParticipantSegment | Session中の参加者構成が一定な区間 | 原則非表示 | internal term |
| TERM-003 | Game | 1半荘の結果単位 | 対局 / 半荘 | 文脈で統一 |
| TERM-004 | Player | 麻雀成績の主体 | メンバー/参加者 | Userとは分離 |
| TERM-005 | User | 認証・操作主体 | 将来 | Playerと別Entity |

用語変更時はScreen/Message/Codeとの影響を確認する。
