import {
  AddGameResultUseCase,
  AddPlayerToGroupUseCase,
  CreateGroupUseCase,
  GetActiveSessionUseCase,
  GetSessionResultsUseCase,
  ListGamesBySessionUseCase,
  ListGroupsUseCase,
  ListPlayersByGroupUseCase,
  StartSessionUseCase,
  UpdateGameUseCase,
  DeleteGameUseCase,
  UpdateSessionDetailsUseCase,
  FinalizeSessionUseCase,
} from "../../application/use-cases";
import {
  LocalStorageGameRepository,
  LocalStorageGroupRepository,
  LocalStoragePlayerRepository,
  LocalStorageSessionRepository,
} from "../repositories";
import { CryptoIdGenerator, SystemClock } from "../runtime";
import {
  LocalStorageAppDataStore,
  WebStorageKeyValueStore,
} from "../storage";

export const createBrowserServices = () => {
  const keyValueStore = new WebStorageKeyValueStore(window.localStorage);
  const store = new LocalStorageAppDataStore(keyValueStore);
  const groups = new LocalStorageGroupRepository(store);
  const players = new LocalStoragePlayerRepository(store);
  const sessions = new LocalStorageSessionRepository(store);
  const games = new LocalStorageGameRepository(store);
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();

  return {
    createGroup: new CreateGroupUseCase(groups, ids, clock),
    addPlayerToGroup: new AddPlayerToGroupUseCase(players, ids, clock),
    startSession: new StartSessionUseCase(sessions, players, ids, clock),
    addGameResult: new AddGameResultUseCase(games, sessions, ids, clock),
    updateGame: new UpdateGameUseCase(games, sessions),
    deleteGame: new DeleteGameUseCase(games),
    updateSessionDetails: new UpdateSessionDetailsUseCase(sessions),
    finalizeSession: new FinalizeSessionUseCase(sessions, clock),
    listGroups: new ListGroupsUseCase(groups),
    listPlayersByGroup: new ListPlayersByGroupUseCase(players),
    getActiveSession: new GetActiveSessionUseCase(sessions),
    getSessionResults: new GetSessionResultsUseCase(sessions, games),
    listGamesBySession: new ListGamesBySessionUseCase(games),
  };
};

export type BrowserServices = ReturnType<typeof createBrowserServices>;
