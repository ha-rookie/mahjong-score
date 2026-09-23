import type { AppDataSchema } from "../../domain";
import type { Result } from "../../shared/errors";

export interface AppDataStore {
  load(): Promise<Result<AppDataSchema>>;
  replace(data: unknown): Promise<Result<void>>;
}
