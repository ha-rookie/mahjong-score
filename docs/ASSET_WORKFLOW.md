# Asset Workflow

## 標準フロー

画像要件 → 生成/選定 → 人間確認 → Design Preview → スマホ確認 → 承認head SHA / hash → 正本確定 → 本番配置または生成 → CI → App Preview / Production

## 仕様として残すもの

用途、表示サイズ、元サイズ、縦横比、透過、背景、向き、余白、形式、圧縮、alt・aria、ファイル名、生成プロンプト、禁止要素。

## Assetの3分類

画像Assetは、保存方法ではなく**何を正本にするか**で分類する。

| 分類 | 正本 | 主な対象 | 更新方法 |
| --- | --- | --- | --- |
| 原本保存型 | 承認済みJPEG / PNG / WebP等 | 写真、イラスト、AI生成OGP、人間レビュー済みキービジュアル | 原本を差し替えて再承認 |
| ビルド時生成型 | SVG、生成スクリプト、デザイン定義 | favicon、Apple Touch Icon、PWA icon、maskable icon、サイズ違い派生物 | 元デザイン/生成ロジックを変更して再生成 |
| 同一Blob再利用型 | 1つのGit Blob | Design PreviewとProduction等で同一画像を使う場合 | 同一Blob SHAまたはhashで内容同一性を確認 |

### 原本保存型

完全一致が要件のAssetは、承認済み画像そのものを正本にする。

- アップロードが難しいという理由だけで「似た画像」を再生成しない
- AI生成画像でも、人間が採用した時点で原本を固定する
- 変更時はDesign Issueへ戻し、再承認する
- hashまたは承認head SHAをAsset Handoffへ残す

### ビルド時生成型

元デザインから同じ結果を決定的に再生成できるAssetは、生成元を正本にする。

- SVG / master image / design token /生成スクリプトを正本候補とする
- 派生PNG / ICOを1枚ずつ手編集しない
- CI / Preview / Deploy時に必要サイズを生成できるようにする
- 生成物だけ変更され、正本と不整合になる状態を避ける

代表例:

- favicon
- Apple Touch Icon
- 192x192 PWA icon
- 512x512 PWA icon
- 512x512 maskable icon

### 同一Blob再利用型

内容が完全に同じ画像を複数パスで使う場合、Gitでは同じBlob SHAを参照できる。

- パスが違っても内容同一性をhash / Blob SHAで確認できる
- Design用とProduction用で同じ原本を使う場合に有効
- 片方だけ差し替わった場合は別内容として扱う

## Asset変更前のPre-check

既存Assetの差し替え前に、現在のProduction仕様と参照関係を確認する。

- dimensions
- format
- filename / path
- aspect ratio
- references
- related tests / CI
- Production current spec

単純な画像差し替えと、技術仕様変更を分ける。既存dimensions、path、format、参照方式は、変更理由とHuman承認がない限り原則維持する。

testを通すこと自体を目的に仕様を広げない。OGP差し替えからHTMLのwidth / height、cache parameter、URL仕様、参照方式等へ変更が波及する場合は、**Scope拡張**として停止し、Issue / Change Contractを更新してから進める。

## Assetのライフサイクル

```text
Source Asset
├─ 承認済みJPEG / PNG / WebP
└─ SVG / master image / 生成スクリプト / デザイン定義
      ↓
Build Artifact
├─ リサイズPNG
├─ ICO
├─ Apple Touch Icon
└─ maskable icon
      ↓
Deploy Artifact
└─ Cloudflare Pages等から配信される静的ファイル
```

原本・生成物・配信物を混同しない。

- 原本保存型 → Source Assetを更新する
- ビルド時生成型 → 生成元を更新する
- 派生成果物だけを手修正しない
- PreviewとProductionで別の画像生成経路を持たない

## OGP

OGPは共有時に表示されるため、通常のUI Assetとは別に契約を確認する。

最低限確認する項目:

- 採用画像が人間承認済み
- OGP用途に適した横長比率。1200x630は代表例で、同等比率の高解像度画像も可
- `og:image` のURLがProductionから取得できる
- metadataのwidth / heightを設定する場合、実画像寸法と一致する
- title / description / image / typeが意図どおり
- LINE等、実際に使う共有先でカード表示を確認できる場合は実機確認する
- cache更新が必要な場合、画像URLを安易に変えず原因を切り分ける

人間承認済みOGPは原本保存型を基本とし、アップロード都合だけで別画像へ再生成しない。

## favicon / App Icon / PWA Icon

同一モチーフから複数サイズへ展開できる場合はビルド時生成型を優先する。

推奨候補:

- favicon
- Apple Touch Icon 180x180
- PWA icon 192x192
- PWA icon 512x512
- maskable icon 512x512

各アプリの正式アイコンと、LitLink等の外部一覧用アイコンは別Assetとして扱える。外部掲載先固有のデザインルールをTemplateへ固定しない。

## 保存

- `assets/prompts/`: 再生成用プロンプト
- `assets/`: 原本または生成元を置く候補。プロジェクト構成に合わせて変更可
- `docs/design/assets/`: レビュー中
- `public/assets/`: 承認済み本番Asset
- `public/icons/`: 配信用アイコンの候補

正本の場所はProject OverviewまたはAsset設計に明記する。

## ChatGPTとHumanでGitHubへバイナリ画像を渡す場合

Human/AI間の操作手順は `docs/HUMAN_AI_COLLABORATION.md` を正本とする。

画像等のバイナリは **Human Uploadを標準経路** とする。Humanへ依頼する作業は原則file uploadだけとし、branch / folder / path / filenameの準備とupload後確認はAIが担当する。

```text
承認済み原本
↓
AIがIssue専用Branch / Upload先Folderを準備
↓
AIがBranch・Folder・期待ファイル名・コピー用GitHub生URLを提示
↓
HumanがGitHubへUpload
↓
AIがGitHub上の実ファイルを確認
↓
hash / Blob SHA / 寸法 / 形式を確認
↓
CI / Preview / Production
```

### 原則

- ChatGPTからGitHubへバイナリを直接登録できる前提を置かない
- API/Connectorに輸送手段が見えても、直接Uploadを標準経路として再試行しない
- GitHub URLの提示形式は `GR-001` に従う
- Human Uploadは `GR-002` に従う
- HumanがUpload完了を伝えた後は、再Uploadを依頼する前にGitHub上を確認する
- 承認済み原本をUpload都合で再生成・色変更・トリミングしない
- GitHub上の最終ファイルについて、必要に応じてBlob SHA、hash、サイズ、寸法、形式、Previewを確認する
- Human Uploadが技術的に不可能な場合だけ、別輸送経路をHumanと相談して決める

## 実装Issueへの引き継ぎ

Design承認後、実装Issueの `Asset Handoff` に固定情報を残す。

最低限、以下を引き継ぐ。

- Asset分類（原本保存 / ビルド時生成 / 同一Blob再利用）
- 正本
- 元Design Issue/PR
- 承認済みAsset一覧
- Asset配置場所
- file hash または承認head SHA
- 承認Preview
- 生成Assetの場合は生成スクリプト/元デザイン

Assetを使わないIssueは `該当なし` とする。

承認済みAssetは、実装側が再生成、色変更、トリミング、差し替えをしない。変更が必要ならDesign Issueへ戻し、再承認後に新しいhashまたはhead SHAを実装Issueへ引き継ぐ。

## 承認後

実装側は承認済みAssetまたは承認済み生成元を再利用する。独断で再生成、色変更、トリミング、差し替えをしない。変更が必要ならDesign Issueへ戻す。

## テスト

共通:

- ファイル欠落
- 形式 / MIME type
- サイズ
- 幅・高さ
- 透過
- 参照パス
- cache
- スマホ
- 小サイズ
- 背景とのコントラスト
- PWA対象範囲
- 正本と生成物の整合

用途固有:

- OGP: 比率、実寸、metadata、Production配信、共有カード
- favicon: ブラウザタブでの判別
- Apple Touch Icon: 180x180とホーム画面表示
- PWA icon: 192 / 512、manifest参照、maskable余白
