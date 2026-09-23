import type { Clock, GroupRepository, IdGenerator } from "../ports";
import type { Group } from "../../domain";
import { AppError, err, type Result } from "../../shared/errors";

export interface CreateGroupInput {
  readonly name: string;
}

export class CreateGroupUseCase {
  constructor(
    private readonly groups: GroupRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateGroupInput): Promise<Result<Group>> {
    const name = input.name.trim();

    if (name.length === 0) {
      return err(
        new AppError({
          code: "group_name_required",
          message: "Group name is required.",
          userMessage: "グループ名を入力してください。",
        }),
      );
    }

    const now = this.clock.now();
    const group: Group = {
      id: this.ids.generate(),
      name,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.groups.save(group);
    return saved.ok ? { ok: true, value: group } : saved;
  }
}
