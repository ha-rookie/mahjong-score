# Architecture Decision Records

## 目的

重要な設計判断について「何を選んだか」だけでなく「なぜ選んだか」「何を選ばなかったか」を残す。

## ADRにする判断

例:

- Cloudflare Pages / Workers / 他Hosting
- Database採用/非採用
- Runtime API / static pre-generation
- Authentication方式
- Analytics方式
- SPA / MPA
- PWA
- External service選定
- Data source選定
- Security上の重要なTrade-off

小さなCSS調整、単純なrename、Issue内で完結する実装詳細は通常ADRにしない。

## File Naming

`ADR-0001-short-title.md`

番号は原則連番。

## Status

- Proposed
- Accepted
- Deprecated
- Superseded by ADR-xxxx

Accepted ADRは理由を上書きして歴史を消さない。判断変更時は新ADRを作り、旧ADRをSupersededにする。

## Template

`ADR-0000-template.md` をコピーして使用する。
