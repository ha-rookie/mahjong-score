# Interface / File I/O設計

## 1. 目的
内部/外部API、外部Service、Import/Export Fileを一元的に設計する。

## 2. File Catalog

| FILE ID | 名称 | Format | Direction | Encoding | Phase | Status |
| --- | --- | --- | --- | --- | --- | --- |
| FILE-001 | Backup JSON | JSON | Export/Import | UTF-8 | 1 | Active |

## 3. Backup Envelope v1

```json
{
  "fileVersion": 1,
  "exportedAt": "ISO-8601 timestamp",
  "appVersion": "application version",
  "data": { "schemaVersion": 1 }
}
```

Export時はAppDataStoreの現在Dataを読み、metadata付きJSONへ変換する。

## 4. Import Validation

順序:
1. JSON parse
2. Backup envelope exact key validation
3. fileVersion確認
4. AppDataSchema exact root key validation
5. schemaVersion確認
6. collection/item shape validation
7. 全検証成功後のみreplace

失敗時は既存localStorageを変更しない。

## 5. Security / Robustness

- Backup内容をtrusted inputとみなさない
- unknown root propertyを拒否
- unsupported schemaを自動解釈しない
- SecretをBackupへ含めない
- 実在DataをRepositoryへcommitしない

## 6. API / External IF

Phase 2でWorker API / D1 / Authenticationを導入する。SQLはparameterized query / bindを必須とする。

Authentication providerは未確定。第一候補Google Identity / OpenID Connectを含めてHuman decisionで確定する。認証用途だけの場合はprofile識別に必要な最小scopeとし、Drive / Calendar等のGoogle API scopeを要求しない。
