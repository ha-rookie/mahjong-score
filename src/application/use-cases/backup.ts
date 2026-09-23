import type { AppDataStore, Clock } from "../ports";
import { AppError, err, ok, type Result } from "../../shared/errors";

const BACKUP_FILE_VERSION = 1;

interface BackupFileV1 {
  readonly fileVersion: 1;
  readonly exportedAt: string;
  readonly appVersion: string;
  readonly data: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseBackupFile = (raw: string): Result<BackupFileV1> => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return err(
      new AppError({
        code: "backup_json_invalid",
        message: "Backup file is not valid JSON.",
        userMessage: "バックアップファイルを読み込めませんでした。",
        cause,
      }),
    );
  }

  if (
    !isRecord(parsed) ||
    Object.keys(parsed).sort().join(",") !==
      ["appVersion", "data", "exportedAt", "fileVersion"].sort().join(",") ||
    parsed.fileVersion !== BACKUP_FILE_VERSION ||
    typeof parsed.exportedAt !== "string" ||
    typeof parsed.appVersion !== "string"
  ) {
    return err(
      new AppError({
        code: "backup_file_invalid",
        message: "Backup file envelope is invalid.",
        userMessage: "バックアップファイルの形式を確認してください。",
      }),
    );
  }

  return ok(parsed as unknown as BackupFileV1);
};

export class ExportBackupUseCase {
  constructor(
    private readonly store: AppDataStore,
    private readonly clock: Clock,
    private readonly appVersion: string,
  ) {}

  async execute(): Promise<Result<string>> {
    const loaded = await this.store.load();

    if (!loaded.ok) {
      return loaded;
    }

    const backup: BackupFileV1 = {
      fileVersion: BACKUP_FILE_VERSION,
      exportedAt: this.clock.now(),
      appVersion: this.appVersion,
      data: loaded.value,
    };

    return ok(JSON.stringify(backup, null, 2));
  }
}

export class ImportBackupUseCase {
  constructor(private readonly store: AppDataStore) {}

  async execute(raw: string): Promise<Result<void>> {
    const parsed = parseBackupFile(raw);

    if (!parsed.ok) {
      return parsed;
    }

    return this.store.replace(parsed.value.data);
  }
}
