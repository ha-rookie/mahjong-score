import type { AppDataStore } from "../../application/ports";
import type { AppDataSchema } from "../../domain";
import { AppError, err, ok, type Result } from "../../shared/errors";
import type { KeyValueStore } from "../../shared/storage";
import {
  createEmptyAppData,
  normalizeAppDataSchema,
} from "./app-data-schema";

export const APP_DATA_STORAGE_KEY = "mahjong-score:app-data:v2";
export const LEGACY_APP_DATA_STORAGE_KEY = "mahjong-score:app-data:v1";

export class LocalStorageAppDataStore implements AppDataStore {
  constructor(private readonly storage: KeyValueStore) {}

  private parse(raw: string): Result<unknown> {
    try {
      return ok(JSON.parse(raw) as unknown);
    } catch (cause) {
      return err(
        new AppError({
          code: "storage_json_invalid",
          message: "Stored app data is not valid JSON.",
          userMessage: "保存データを読み込めませんでした。",
          cause,
        }),
      );
    }
  }

  private persistCurrent(data: AppDataSchema): Result<void> {
    try {
      this.storage.setItem(APP_DATA_STORAGE_KEY, JSON.stringify(data));
      return ok(undefined);
    } catch (cause) {
      return err(
        new AppError({
          code: "storage_write_failed",
          message: "Failed to write app data to key-value storage.",
          userMessage: "データを保存できませんでした。",
          retryable: true,
          cause,
        }),
      );
    }
  }

  async load(): Promise<Result<AppDataSchema>> {
    try {
      const currentRaw = this.storage.getItem(APP_DATA_STORAGE_KEY);

      if (currentRaw !== null) {
        const parsed = this.parse(currentRaw);
        if (!parsed.ok) return parsed;

        const normalized = normalizeAppDataSchema(parsed.value);
        if (!normalized.ok) return normalized;

        return normalized;
      }

      const legacyRaw = this.storage.getItem(LEGACY_APP_DATA_STORAGE_KEY);

      if (legacyRaw === null) {
        return ok(createEmptyAppData());
      }

      const parsedLegacy = this.parse(legacyRaw);
      if (!parsedLegacy.ok) return parsedLegacy;

      const migrated = normalizeAppDataSchema(parsedLegacy.value);
      if (!migrated.ok) return migrated;

      const persisted = this.persistCurrent(migrated.value);
      if (!persisted.ok) return persisted;

      return migrated;
    } catch (cause) {
      return err(
        new AppError({
          code: "storage_read_failed",
          message: "Failed to read app data from key-value storage.",
          userMessage: "保存データを読み込めませんでした。",
          retryable: true,
          cause,
        }),
      );
    }
  }

  async replace(data: unknown): Promise<Result<void>> {
    const normalized = normalizeAppDataSchema(data);

    if (!normalized.ok) {
      return normalized;
    }

    return this.persistCurrent(normalized.value);
  }

  async update(
    updater: (current: AppDataSchema) => Result<AppDataSchema>,
  ): Promise<Result<void>> {
    const loaded = await this.load();

    if (!loaded.ok) {
      return loaded;
    }

    const updated = updater(loaded.value);

    if (!updated.ok) {
      return updated;
    }

    return this.replace(updated.value);
  }
}
