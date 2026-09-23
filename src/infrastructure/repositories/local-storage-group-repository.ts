import type { GroupRepository } from "../../application/ports";
import type { Group, GroupId } from "../../domain";
import { ok, type Result } from "../../shared/errors";
import type { LocalStorageAppDataStore } from "../storage";

export class LocalStorageGroupRepository implements GroupRepository {
  constructor(private readonly store: LocalStorageAppDataStore) {}

  async list(): Promise<Result<readonly Group[]>> {
    const loaded = await this.store.load();
    return loaded.ok ? ok(loaded.value.groups) : loaded;
  }

  async findById(id: GroupId): Promise<Result<Group | null>> {
    const loaded = await this.store.load();

    if (!loaded.ok) {
      return loaded;
    }

    return ok(loaded.value.groups.find((group) => group.id === id) ?? null);
  }

  async save(group: Group): Promise<Result<void>> {
    return this.store.update((current) => {
      const exists = current.groups.some((item) => item.id === group.id);
      const groups = exists
        ? current.groups.map((item) => (item.id === group.id ? group : item))
        : [...current.groups, group];

      return ok({ ...current, groups });
    });
  }
}
