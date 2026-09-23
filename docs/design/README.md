# Visual Design

## 目的

画面・Interaction・レスポンシブ挙動など、文章だけでは認識差が出る設計をブラウザで確認可能にする。

## 朝マズメ潮ナビから継承する点

- HTML/CSSによるDesign Previewを使える
- Production実装前にスマホで確認する
- PR単位の設計差分を人間が確認する
- 承認されたDesignをImplementationへ引き継ぐ

## このTemplateでの改善

視覚設計を全設計の正本にはしない。

- 要件の正本: `01_REQUIREMENTS.md`
- System構成の正本: `02_SYSTEM_ARCHITECTURE.md`
- App内部構成の正本: `03_APPLICATION_ARCHITECTURE.md`
- 視覚設計の正本: 本Directory内のファイル

同じ要件やArchitecture説明をHTMLへ大量コピーしない。設計IDで参照する。

## 推奨構成

必要になった時点で作成する。

```text
docs/design/
├─ README.md
├─ index.html
├─ styles/
├─ scripts/
├─ screens/
└─ assets/
```

空Directoryは作らない。

## index.htmlに含める候補

- 画面一覧
- 画面遷移
- 画面イメージ
- 主要画面項目
- Interaction/Event
- State
- Responsive behavior
- Error/empty/loading state
- Accessibility note
- Security/privacy note
- Design ID
- TBD
- Design Decision

テーブル設計や外部IFなど、視覚レビューに向かない内容はArchitecture文書へ置く。

## Design Preview

必要なプロジェクトではCloudflare等でDesign専用Previewを構成する。

要件:

- Production Applicationとは別配信
- 検索エンジンへ公開しない
- 可能ならAccess制御
- PR Previewとmain latest Previewを区別
- ハッシュDeployment URLはスナップショット扱い
- スマホ実機確認
- Preview URLをPRへ記録

Design Previewは表示面であり、Repository内ファイルが正本。

## 承認

重要なUI変更では、Design PRの承認head SHAをImplementation Issueへ引き継ぐ。

Assetを伴う場合は `ASSET_WORKFLOW.md` とFeature Issueの `Asset Handoff` を併用する。
