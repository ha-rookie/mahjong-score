import type { PlayerRepository } from "../../application/ports";
import type { GroupId, Player, PlayerId } from "../../domain";
import { AppError, err, ok, type Result } from "../../shared/errors";
import type { LocalStorageAppDataStore } from "../storage";

export class LocalStoragePlayerRepository implements PlayerRepository {
  constructor(private readonly store: LocalStorageAppDataStore) {}

  async listByGroup(groupId: GroupId): Promise<Result<readonly Player[]>> {
    const loaded = await this.store.load();

    if (!loaded.ok) {
      return loaded;
    }

    const memberIds = new Set(
      loaded.value.groupMembers
        .filter((member) => member.groupId === groupId && member.active)
        .map((member) => member.playerId),
    );

    return ok(
      loaded.value.players.filter((player) => memberIds.has(player.id)),
    );
  }

  async findById(id: PlayerId): Promise<Result<Player | null>> {
    const loaded = await this.store.load();

    if (!loaded.ok) {
      return loaded;
    }

    return ok(loaded.value.players.find((player) => player.id === id) ?? null);
  }

  async createForGroup(player: Player, groupId: GroupId): Promise<Result<void>> {
    return this.store.update((current) => {
      if (!current.groups.some((group) => group.id === groupId)) {
        return err(
          new AppError({
            code: "group_not_found",
            message: `Group not found: ${groupId}`,
            userMessage: "グループが見つかりません。",
          }),
        );
      }

      if (current.players.some((item) => item.id === player.id)) {
        return err(
          new AppError({
            code: "player_id_conflict",
            message: `Player ID already exists: ${player.id}`,
            userMessage: "メンバーを登録できませんでした。",
          }),
        );
      }

      return ok({
        ...current,
        players: [...current.players, player],
        groupMembers: [
          ...current.groupMembers,
          { groupId, playerId: player.id, active: true },
        ],
      });
    });
  }

  async save(player: Player): Promise<Result<void>> {
    return this.store.update((current) => {
      const exists = current.players.some((item) => item.id === player.id);
      const players = exists
        ? current.players.map((item) => (item.id === player.id ? player : item))
        : [...current.players, player];

      return ok({ ...current, players });
    });
  }
}
