import type { Group, GroupId } from "../../domain";
import type { Result } from "../../shared/errors";

export interface GroupRepository {
  list(): Promise<Result<readonly Group[]>>;
  findById(id: GroupId): Promise<Result<Group | null>>;
  save(group: Group, expectedUpdatedAt?: string): Promise<Result<void>>;
}
