# Public Web Quality

## 目的

公開Webアプリの「公開品質」を、SEOだけでなく、利用者への説明、Privacy、検索公開判断、Search Console、OGP、PWA、LLMOまで含めて整理する。

すべてを一律必須にしない。アプリの公開範囲・利用目的・収集データ・外部サービスに応じてHuman decisionを残す。

## 1. 公開範囲を最初に決める

Production公開時に、まず次のどちらかを明示する。

### A. 検索公開する

Google等の検索エンジンから発見されることを前提にする。

- Productionはindex許可
- canonicalを設定
- robots.txt / sitemap.xmlを整備
- Search Console登録
- 公開URLのURL検査・ライブテスト
- sitemap送信
- index状態・検索パフォーマンスを後日観測

### B. URLを知る人へ限定共有する

一般公開URLは持つが、検索流入は現時点の目的にしない。

- Productionを `noindex,nofollow` とする
- Search Console登録は検索公開へ移行する時まで延期できる
- PWAやOGPは必要に応じて採用できる
- noindexでもSecurity / Privacy / About等の公開品質は省略しない

公開範囲は実装都合で暗黙に決めず、Issue / Project Overviewへ記録する。

## 2. Preview

Previewは原則としてindexさせない。

確認候補:

- `robots` meta
- `X-Robots-Tag`
- canonicalがProductionを誤って指さないか
- sitemapへPreview URLを含めない
- AnalyticsでProduction統計を汚さない

Design Previewも同様に検索対象へしない。

## 3. Public Trust

公開ページには、利用者が「これは何か」「何をしているか」「何をしていないか」を確認できる導線を用意する。

### About

必要に応じて記載する:

- アプリの目的
- 想定利用場面
- 提供する情報
- 提供しない判断・保証
- データの出典
- 外部サービス利用
- 問い合わせ/フィードバック導線

### Disclaimer

誤認や安全上のリスクがある場合に追加する。

例:

- 医療・法律・金融等の専門判断を代替しない
- 位置・交通・天候等の情報は最終確認が必要
- ゲーム/評価系では技能認定や品質測定ではない
- 利用時の安全注意

### Privacy

収集・送信・保存するデータがある場合は明記する。

最低限判断する:

- 個人情報
- 位置情報
- センサーデータ
- Analytics
- 外部APIへ送る情報
- 保存期間
- ローカルストレージ
- Cookie
- ログ

「収集しない」ことも方針として明記できる。

### Footer

最低限の導線候補:

- About
- Privacy
- Disclaimer
- Source / Data
- Contact / Feedback

ページ数が少ないアプリではAbout / Privacy / Disclaimerを1ページへ統合してよい。

## 4. 公開情報に含めないもの

公開ページ・ProtoPedia等の外部紹介・OGP metadataへ、明示的な必要性がない限り以下を含めない。

- 本名
- 勤務先
- 個人メールアドレス
- Private GitHub Repository URL
- Repository Secrets
- API Token
- 認証付き設計書URL
- 内部Issueの機密情報
- 顧客/案件を識別できる情報

公開Project名やCloudflare URLにも、個人を示す文字列を無断で使わない。

## 5. Technical SEO

検索公開する場合の基本候補:

- `<title>`
- meta description
- canonical
- viewport
- lang
- OGP
- favicon
- robots.txt
- sitemap.xml
- structured data / JSON-LD
- meaningful heading structure
- internal links
- status code
- mobile usability

多言語対応では画面翻訳だけでなく、canonical / hreflang / locale / URL設計を別途判断する。

## 6. OGP

OGP Assetの管理は `ASSET_WORKFLOW.md` を正本とする。

metadata候補:

- `og:title`
- `og:description`
- `og:image`
- `og:type`
- `og:url`

実共有先でカード表示を確認できる場合、LINE等でProduction URLを共有して実機確認する。

## 7. robots.txt / sitemap.xml

### robots.txt

Crawler制御とindex制御を混同しない。

- crawl許可していてもnoindexなら検索結果へ出さない運用ができる
- AI crawler / search botの扱いは目的に応じて判断する
- robots.txtだけで機密情報を守らない

### sitemap.xml

検索公開するProduction URLだけを対象にする。

- Previewを含めない
- canonicalと整合させる
- 新規公開後、Search Consoleから送信する
- URL追加/削除時に更新する

## 8. Google Search Console

Google検索での発見・クロール・index状態を確認する正本として使う。

Cloudflare Web Analytics等のアクセス解析とは役割が異なる。

- Web Analytics: サイトへ来た後の行動
- Search Console: Google検索での発見・クロール・index・表示・検索クエリ

Googleリファラーが0でも「未index」とは断定しない。URL検査で確認する。

### URLプレフィックス

`pages.dev` 配下等、親ドメインのDNSを自分で管理しない場合はURLプレフィックスプロパティを基本候補とする。

独自ドメインでDNSを管理している場合はDomain propertyも比較する。

### HTMLファイル所有権確認

URLプレフィックスではHTMLファイル方式を候補にできる。

標準手順:

1. Search ConsoleでURLプレフィックスPropertyを追加
2. Googleが発行した `googleXXXXXXXX.html` を取得
3. アプリの公開ルートへ配置
4. Production URLで確認ファイルを直接開く
5. Search Consoleで所有権確認
6. 成功後も確認ファイルを原則削除しない
7. GitHubで通常の静的Assetとして管理する

Cloudflare Pagesの公開ルートが `public/` の場合は、`public/googleXXXXXXXX.html` が候補。

## 9. URL検査・index request

検索公開する新規アプリでは:

1. Search ConsoleのURL検査でトップURLを確認
2. 未登録の場合、公開URLライブテスト
3. 「index可能」であることを確認
4. index request
5. sitemap.xml送信
6. 翌日以降にindex状態を確認

index requestは即時掲載を保証しない。

Homeがindex済みでもAbout等の下位ページが未クロールの場合があるため、ページ単位で状態を見る。

## 10. JSON-LD / Structured Data

アプリ内容に合うschemaがある場合だけ採用する。

- 実ページ内容と一致させる
- 存在しないレビュー・評価・運営組織を作らない
- structured dataのために公開情報を誇張しない

## 11. LLMO / AI Discovery

LLMOは単独の魔法的施策として扱わない。

基盤候補:

- title / description
- semantic HTML
- About
- source links
- structured data
- robots / crawler policy
- sitemap
- `llms.txt` 等の新しい慣行

`llms.txt` やAI crawler個別許可はHuman decisionとし、標準必須にしない。

AI検索で発見されない場合も、即座に実装不良と断定せず、index状況・crawler policy・サービス側の収録タイミングを分けて確認する。

## 12. PWA

PWAは検索公開・Analytics導入とは独立した判断。

URL共有者にホーム画面追加・再利用してほしい場合は、noindex運用中でもPWAを採用できる。

採用時:

- manifest
- icons
- service worker
- installability
- standalone起動
- update/cache挙動

を確認する。

## 13. Analytics

導入しない判断も有効。

判断材料:

- 不特定多数への公開か
- 利用改善にデータが必要か
- Privacy記載が必要か
- 個人識別が必要か
- Previewを除外できるか
- 運用コストに見合うか

AnalyticsはCore機能へ依存させない。

## 14. 公開前チェック

- [ ] 検索公開 / 限定共有を決定
- [ ] Production index / noindex方針を確認
- [ ] Preview noindex
- [ ] title / description / canonical
- [ ] OGP / favicon
- [ ] robots.txt / sitemap.xml
- [ ] About
- [ ] Disclaimer要否
- [ ] Privacy要否
- [ ] Footer
- [ ] 外部一次情報 / Source導線
- [ ] 個人情報・Private URL・Secretsなし
- [ ] JSON-LD要否
- [ ] PWA採否
- [ ] Analytics採否
- [ ] LLMO / AI crawler方針
- [ ] 検索公開する場合はSearch Console準備

## 15. 公開後チェック

検索公開する場合:

- [ ] Search Console所有権確認
- [ ] URL検査
- [ ] 公開URLライブテスト
- [ ] index request
- [ ] sitemap送信
- [ ] 後日index状態
- [ ] 検索パフォーマンス観測

限定共有の場合:

- [ ] noindex維持
- [ ] OGP実共有
- [ ] PWA採用時の実機起動
- [ ] 公開範囲を変更する時は別Issueでindex方針を再判断
