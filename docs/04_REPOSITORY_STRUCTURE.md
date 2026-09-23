# Repository Structure

## 1. 文書目的
Repository内の物理配置と責務を定義する。命名詳細は `21_NAMING_STANDARD.md`。

## 2. App Source Structure

```text
src/
├─ components/                 # reusable React UI（追加時）
├─ features/                   # mahjong feature UI composition（追加時）
├─ domain/
│  ├─ ids.ts
│  ├─ models.ts
│  └─ validation.ts
├─ application/
│  ├─ ports/                  # repository / clock / ID / app-data contracts
│  └─ use-cases/              # application orchestration
├─ infrastructure/
│  ├─ repositories/           # localStorage repository adapters
│  ├─ runtime/                # SystemClock / CryptoIdGenerator
│  └─ storage/                # Web Storage / schema / AppDataStore
├─ shared/
│  ├─ errors/
│  ├─ logging/
│  ├─ storage/                # generic KeyValueStore
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
- Infrastructure固有のWeb Storage型をApplication/Domainへ漏らさない

## 4. Phase 1 Storage

- storage key: `mahjong-score:app-data:v1`
- root schema: `AppDataSchema`
- schema version: `1`
- Browser Web Storageは `KeyValueStore` wrapper越しに利用

## 5. Generated

`dist/`, `.wrangler/` はcommitしない。

## 6. Forbidden Content

API key/token/password/秘密値、不要なPII、実在Member成績、private client情報、license上commit不可AssetをRepositoryへ入れない。
