## 対応Issue

Closes #

## 目的

## 変更内容

## 非対象

## Execution Profile / Impact Flags

- Risk Level: Low / Medium / High
- Runtime: Yes / No
- UI: Yes / No
- Mobile / Sensor: Yes / No
- Asset: Yes / No
- Security / Secret / Infra: Yes / No
- Public Repository: Yes / No
- Design / Operation Meaning: Yes / No
- Human Review needed: Yes / No
- 次のHuman Gate:

## 設計

- [ ] 設計書更新済み
- [ ] 更新不要。理由を記載した

## 検証

Impact Flagsに該当する項目だけを必須とする。非該当Gateを形式的に実施しない。

- [ ] lint
- [ ] test
- [ ] build
- [ ] Preview Deploy
- [ ] スマホ実機
- [ ] 主要回帰
- [ ] Merge後のProduction deploy / smoke確認（該当時）

## 影響

- Security:
- SEO:
- Data:
- Cloudflare:
- Operations:
- Asset:

## Issue Contract / Scope Evidence

- [ ] IssueのGoal / In Scope / Out of Scopeと一致している
- [ ] Planned Filesと実変更fileを比較した
- 実変更file:
- 予定外変更: あり / なし
- Scope拡張承認: 該当なし / 承認済み / 未承認
- Risk Level: Low / Medium / High
- Impact FlagsがIssueと一致: Yes / No
- CI Trigger:
- 実施済み検証:
- 未検証:
- 完了ステータス: Implemented / CI Validated / Blocked / Production Verified
- [ ] Planned Files外の変更がある場合、理由とHuman承認を記録した
- [ ] ついで修正を混ぜていない

## Collaboration Guardrails

- [ ] `docs/HUMAN_AI_COLLABORATION.md` の該当STOP Gateを確認した
- [ ] GitHub URLをHumanへ渡す場合、コードブロック内の生URLで提示した
- [ ] Binary Assetがある場合、Human Upload標準フローを使用した
- [ ] 新規画像生成がある場合、生成前にHumanの明示承認を確認した
- [ ] 外部制約がある場合、影響範囲と未実行の検証を明記した
- [ ] 未実行のCI / Preview / Deploy等を成功・確認済みとして扱っていない

## External Capability / Quota（該当時のみ）

- 制限中の機能:
- 影響する検証:
- 代替して実施した確認:
- 制限解除後の再検証:

## Review Gate

- [ ] 最新mainを取り込み済み
- [ ] CI成功
- [ ] Preview URL記載
- [ ] 人間承認済み
- [ ] 承認head SHA記載
- [ ] 承認前にmainへマージしていない

## Replacement PR（該当時のみ）

通常PRは「該当なし」と記載する。

- Replacement PR: 該当 / 該当なし
- 元PR:
- 引き継ぎ理由:
- 引き継ぎhead SHA:
- CI run:
- Preview run:
- 引き継ぐ承認内容:
- [ ] 元PRと同一head SHAを確認した
- [ ] head SHAが異なる場合は再レビューした

## Production Verified

Merge後にProductionがある場合のみ記載する。

- Production deploy: 成功 / 失敗 / 該当なし
- Production smoke:
- [ ] Analytics smoke成功（該当時）
- [ ] Security headers smoke成功（該当時）
- [ ] Production上の主要回帰確認
- [ ] 必要なProduction確認完了後にIssueをCloseする

## 回復

Rollbackまたは変更の戻し方を記載する。Low Riskで単純なGit revertで十分な場合は、その旨だけでよい。
