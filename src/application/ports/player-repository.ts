import type { GroupId, Player, PlayerId } from "../../domain";
import type { Result } from "../../shared/errors";

export interface PlayerRepository {
  listByGroup(groupId: GroupId): Promise<Result<readonly Player[]>>;
  findById(id: PlayerId): Promise<Result<Player | null>>;
  createForGroup(player: Player, groupId: GroupId): Promise<Result<void>>;
  save(player: Player): Promise<Result<void>>;
}
