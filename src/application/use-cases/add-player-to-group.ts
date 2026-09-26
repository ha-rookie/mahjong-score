import type { Clock, IdGenerator, PlayerRepository } from "../ports";
import { PLAYER_NAME_MAX_LENGTH, type GroupId, type Player } from "../../domain";
import { AppError, err, type Result } from "../../shared/errors";

export interface AddPlayerToGroupInput {
  readonly groupId: GroupId;
  readonly displayName: string;
}

export class AddPlayerToGroupUseCase {
  constructor(
    private readonly players: PlayerRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: AddPlayerToGroupInput): Promise<Result<Player>> {
    const displayName = input.displayName.trim();

    if (displayName.length === 0) {
      return err(
        new AppError({
          code: "player_name_required",
          message: "Player display name is required.",
          userMessage: "メンバー名を入力してください。",
        }),
      );
    }

    if (displayName.length > PLAYER_NAME_MAX_LENGTH) {
      return err(new AppError({
        code: "player_name_too_long",
        message: "Player display name is too long.",
        userMessage: `メンバー名は${PLAYER_NAME_MAX_LENGTH}文字以内で入力してください。`,
      }));
    }

    const now = this.clock.now();
    const player: Player = {
      id: this.ids.generate(),
      displayName,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.players.createForGroup(player, input.groupId);
    return saved.ok ? { ok: true, value: player } : saved;
  }
}
