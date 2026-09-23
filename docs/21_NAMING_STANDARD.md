# Naming Standard

## 1. 目的
設計、画面、機能、API、DB、source、File等の命名を統一する。

## 2. Design IDs

- REQ-xxx
- NFR-xxx
- ARCH-xxx
- APP-xxx
- BASE-xxx
- COM-xxx
- FUNC-xxx
- SCR-xxx
- ITEM-xxx
- EVT-xxx
- DATA-xxx
- MAP-xxx
- IF-xxx
- FILE-xxx
- RPT-xxx
- BAT-xxx
- CODE-xxx
- MSG-xxx
- SEC-xxx
- AUTH-xxx
- LOG-xxx
- TERM-xxx
- TBD-xxx
- ADR-xxxx

## 3. Source

- React Component: PascalCase
- hook: useXxx
- Type/Interface: PascalCase
- function/variable: camelCase
- constant: project conventionを決定するまでTBD
- directory: lowercase / kebab-caseを基本
- test: targetが分かる命名

## 4. API

- pathはresource-orientedを基本候補
- lowercase kebab-case
- action word乱用を避ける
- versioningは導入時に方針確定

## 5. DB

候補:
- table: snake_case
- PK: `<entity>_id`
- FK: referenced entity + `_id`
- code: `*_code`
- name: `*_name`
- timestamp: `*_at`

D1 schema導入時に最終決定する。

## 6. File / Message / Event

- backup file: stable prefix + date/time
- message: MSG-xxx
- analytics event: lower_snake_case候補
- batch/job: BAT-xxx + stable technical name

## 7. Rule

既存IDの意味を別概念へ流用しない。概念変更時は新IDを採番する。
