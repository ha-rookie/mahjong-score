# Repository Structure

## 1. 文書目的
Repository内の物理配置と責務を定義する。命名詳細は `21_NAMING_STANDARD.md`。

## 2. App Source Structure

```text
src/
├─ components/        # reusable React UI（追加時）
├─ features/          # mahjong feature UI/use-case composition（追加時）
├─ domain/
│  ├─ ids.ts
│  ├─ models.ts
│  └─ validation.ts
├─ application/
│  └─ ports/          # repository abstractions
├─ infrastructure/    # localStorage/API adapters（追加時）
├─ shared/
│  ├─ errors/
│  ├─ logging/
│  └─ validation/
├─ App.tsx
├─ main.tsx
└─ index.css
```

空Directoryは作らない。必要になったIssueで追加する。

## 3. Dependency Direction

```text
Presentation -> Application -> Domain
                       ↓
                     Ports
                       ↑
                Infrastructure

Shared generic contracts may be used across layers.
```

- DomainはReact/DOM/localStorage/Cloudflareへ依存しない
- sharedはMahjong Domainへ依存しない
- UIからlocalStorageを直接操作しない

## 4. Docs / CI / Assets

業務システム設計体系は `docs/README.md`。CIは `.github/workflows/`。Assetは `ASSET_WORKFLOW.md` に従う。

## 5. Generated

`dist/`, `.wrangler/` はcommitしない。

## 6. Forbidden Content

API key/token/password/秘密値、不要なPII、実在Member成績、private client情報、license上commit不可AssetをRepositoryへ入れない。
