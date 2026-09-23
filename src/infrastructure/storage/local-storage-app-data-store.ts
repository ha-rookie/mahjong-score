import type { AppDataStore } from "../../application/ports";
import type { AppDataSchema } from "../../domain";
import { AppError, err, type Result } from "../../shared/errors";
import type { KeyValueStore } from "../../shared/storage";
import { createEmptyAppData, validateAppDataSchema } from "./app-data-schema";

export const APP_DATA_STORAGE_KEY = "mahjong-score:app-data:v1";

export class LocalStorageAppDataStore implements AppDataStore {
  constructor(private readonly storage: KeyValueStore) {}

  async load(): Promise<Result<AppDataSchema>> {
    try {
      const raw = this.storage.getItem(APP_DATA_STORAGE_KEY);

      if (raw === null) {
        return { ok: true, value: createEmptyAppData() };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
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

      return validateAppDataSchema(parsed);
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
    const validated = validateAppDataSchema(data);

    if (!validated.ok) {
      return validated;
    }

    try {
      this.storage.setItem(
        APP_DATA_STORAGE_KEY,
        JSON.stringify(validated.value),
      );
      return { ok: true, value: undefined };
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
