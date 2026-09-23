# Visual Design / Design Portal

## 1. 目的
Screen、Interaction、Responsive、Component等、文章だけでは認識差が出る設計をBrowserでreview可能にする。

## 2. Source of Truth

- Requirement: `../01_REQUIREMENTS.md`
- System: `../02_SYSTEM_ARCHITECTURE.md`
- Application: `../03_APPLICATION_ARCHITECTURE.md`
- Screen spec: `../10_SCREEN_DESIGN.md`
- Security/NFR等: `../15_SECURITY_DESIGN.md` 以降
- Visual review source: this directory

`index.html` はDesign Portal / review surfaceであり、全設計の唯一の正本ではない。

## 3. Review Model

```text
Wireframe
 -> information hierarchy
HTML / React Mock
 -> visual / state / responsive
Component Showcase
 -> reusable UI/shared behavior
Production
 -> real data / security / performance
```

## 4. Portal

`index.html` は以下の入口を提供する。
- Design catalog
- Screen/Wireframe
- React component showcase
- status / TBD

現時点ではDesign catalogを実装。Screen mock / ShowcaseはFeature Issueで追加する。

## 5. Preview

公開する場合:
- Production Appとは別配信
- noindex/nofollow/noarchive
- 可能ならAccess control
- PR Preview / main latestを区別
- smartphone review
- Production Data/Secretへ接続しない

## 6. Approval

重要なUI変更ではHumanがDesign Previewを確認し、承認head SHAをImplementation Issueへ引き継ぐ。
