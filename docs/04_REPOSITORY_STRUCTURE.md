# Repository Structure

## 1. 文書目的
Repository内の物理配置、責務、生成物を定義する。命名規則詳細は `21_NAMING_STANDARD.md`。

## 2. App固有構成

```text
/
├─ .github/
│  ├─ ISSUE_TEMPLATE/
│  ├─ workflows/
│  │  ├─ deploy-production.yml
│  │  └─ fork-monitor.yml
│  └─ PULL_REQUEST_TEMPLATE.md
├─ docs/
│  ├─ design/
│  │  ├─ README.md
│  │  └─ index.html
│  ├─ adr/
│  ├─ 00_PROJECT_OVERVIEW.md
│  ├─ 01_REQUIREMENTS.md
│  ├─ 02_SYSTEM_ARCHITECTURE.md
│  ├─ 03_APPLICATION_ARCHITECTURE.md
│  ├─ 04_REPOSITORY_STRUCTURE.md
│  ├─ 05_DESIGN_MANAGEMENT.md
│  ├─ 06_REQUIREMENTS_TRACEABILITY.md
│  ├─ 07_FOUNDATION_DESIGN.md
│  ├─ 08_COMMON_DESIGN.md
│  ├─ 09_FUNCTION_DESIGN.md
│  ├─ 10_SCREEN_DESIGN.md
│  ├─ 11_DATA_DESIGN.md
│  ├─ 12_INTERFACE_IO_DESIGN.md
│  ├─ 13_BATCH_REPORT_NOTIFICATION_WORKFLOW.md
│  ├─ 14_CODE_MESSAGE_TERMINOLOGY.md
│  ├─ 15_SECURITY_DESIGN.md
│  ├─ 16_NFR_DESIGN.md
│  ├─ 17_PUBLIC_WEB_DISCOVERY_DESIGN.md
│  ├─ 18_ANALYTICS_OBSERVABILITY.md
│  ├─ 19_OPERATIONS_RELEASE_DESIGN.md
│  ├─ 20_TEST_DESIGN.md
│  └─ 21_NAMING_STANDARD.md
├─ src/
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ index.css
│  └─ vite-env.d.ts
├─ index.html
├─ package.json
├─ vite.config.ts
├─ wrangler.jsonc
└─ README.md
```

Feature実装時に `components/`, `shared/`, `features/`, `domain/`, `application/`, `infrastructure/` を必要なものから追加する。空Directoryは作らない。

## 3. Directory Responsibilities

| Path | Responsibility | Source/Generated | Production |
| --- | --- | --- | --- |
| `.github/` | CI / Issue / PR | Source | No |
| `docs/` | Design source of truth | Source | No |
| `docs/design/` | Visual review surface | Source | No |
| `src/` | React app | Source | Build後Yes |
| `dist/` | Build output | Generated | Yes |
| `public/` | approved static asset | Source | Yes |

## 4. Generated

`dist/` と `.wrangler/` はcommitしない。

## 5. Dependency / Placement

- UI → components / features
- business/domain logic → domain
- use case → application
- localStorage/API → infrastructure
- auth/logging/error等の横断機能 → shared
- UIからlocalStorage/D1を直接操作しない

Phase 1ではWorker API entrypointを作らない。Phase 2で追加する。

## 6. Forbidden Content

Repositoryへcommitしない。
- API key / token / private key / password
- Production secret
- unnecessary PII
- 実在メンバーのscore data
- private client information
- license上commit不可のasset

## 7. Assets

- `assets/`: approved master / source候補
- `public/assets/`: production static asset
- `public/icons/`: favicon / app icon

Binary Assetは `HUMAN_AI_COLLABORATION.md` のGR-002に従う。
