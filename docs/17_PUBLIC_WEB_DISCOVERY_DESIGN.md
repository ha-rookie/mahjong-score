# Public Web / SEO / LLMO / Search Console設計

## 1. 目的
公開Webとしての発見性、説明責任、検索公開、AI DiscoveryをProject固有設計として管理する。

共通判断基準は `PUBLIC_WEB_QUALITY.md`。

## 2. Search Visibility

| Item | Current |
| --- | --- |
| Production URL | https://mahjong-score.ha-rookie.workers.dev |
| Search index | TBD |
| Preview index | noindexを原則とする |
| Custom domain | TBD |
| Search Console | Search公開決定後 |
| sitemap.xml | Search公開時に実装 |
| robots.txt | Search公開方針と同時に実装 |

Public Repositoryであることと、Production Webを検索公開することは別判断。

## 3. Technical SEO

検索公開する場合:
- title
- meta description
- canonical
- lang / viewport
- OGP
- favicon / app icon
- robots.txt
- sitemap.xml
- heading structure
- internal links
- JSON-LD採否
- mobile usability
- status code

## 4. Public Trust

必要に応じ:
- About
- Privacy
- Disclaimer
- Source / Data
- Contact / Feedback

Phase 1でBrowser localStorageへ保存する内容と、serverへ送信しない内容を説明できる状態にする。

## 5. Google Search Console

検索公開時に:
- URL prefix / Domain propertyを選択
- ownership verification
- URL inspection
- live test
- index request
- sitemap submission
- index/crawl確認
- query / impression / click観測

検索公開しないPhaseではDeferredを明記する。

## 6. LLMO / AI Discovery

LLMOを魔法的施策として扱わず、意味が機械にも人にも伝わる公開情報設計とする。

- semantic HTML
- About / FAQ
- source links
- 「何をする / しない」の明示
- structured data
- sitemap / canonical
- crawler policy
- `llms.txt` 採否
- AI検索での実測

LLMOのために通常UserのUXを悪化させない。

## 7. Evidence

Release時に:
- index/noindex
- canonical
- robots/sitemap
- OGP
- About/Privacy
- Search Console verification
- LLMO公開説明と実装の一致

を該当時に確認する。
