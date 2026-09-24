import {
  AddGameResultUseCase,
  AddPlayerToGroupUseCase,
  CreateGroupUseCase,
  GetActiveSessionUseCase,
  GetSessionResultsUseCase,
  GetPlayerPerformanceAggregatesUseCase,
  ListFinalizedSessionsUseCase,
  ListGamesBySessionUseCase,
  ListGroupsUseCase,
  ListPlayersByGroupUseCase,
  StartSessionUseCase,
  UpdateGameUseCase,
  DeleteGameUseCase,
  DeleteSessionUseCase,
  UpdateSessionDetailsUseCase,
  FinalizeSessionUseCase,
  ExportBackupUseCase,
  ImportBackupUseCase,
} from "../../application/use-cases";
import {
  ApiGameRepository,
  ApiGroupRepository,
  ApiPlayerRepository,
  ApiSessionRepository,
  LocalStorageGameRepository,
  LocalStorageGroupRepository,
  LocalStoragePlayerRepository,
  LocalStorageSessionRepository,
} from "../repositories";
import { WorkerApiClient } from "../api";
import { CryptoIdGenerator, SystemClock } from "../runtime";
import {
  APP_DATA_STORAGE_KEY,
  LocalStorageAppDataStore,
  WebStorageKeyValueStore,
} from "../storage";

export const PERSISTENCE_MODE_KEY = "mahjong-score:persistence-mode";
export type PersistenceMode = "local" | "d1";

export const getBrowserPersistenceMode = ():PersistenceMode => {
  const explicit=window.localStorage.getItem(PERSISTENCE_MODE_KEY);
  if(explicit==="d1")return "d1";
  return "local";
};

export const createBrowserServices = () => {
  const keyValueStore = new WebStorageKeyValueStore(window.localStorage);
  const store = new LocalStorageAppDataStore(keyValueStore);
  const mode=getBrowserPersistenceMode();
  const api=new WorkerApiClient();
  const groups = mode==="d1" ? new ApiGroupRepository(api) : new LocalStorageGroupRepository(store);
  const players = mode==="d1" ? new ApiPlayerRepository(api) : new LocalStoragePlayerRepository(store);
  const sessions = mode==="d1" ? new ApiSessionRepository(api) : new LocalStorageSessionRepository(store);
  const games = mode==="d1" ? new ApiGameRepository(api) : new LocalStorageGameRepository(store);
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();

  return {
    persistenceMode:mode,
    createGroup: new CreateGroupUseCase(groups, ids, clock),
    addPlayerToGroup: new AddPlayerToGroupUseCase(players, ids, clock),
    startSession: new StartSessionUseCase(sessions, players, ids, clock),
    addGameResult: new AddGameResultUseCase(games, sessions, ids, clock),
    updateGame: new UpdateGameUseCase(games, sessions),
    deleteGame: new DeleteGameUseCase(games),
    deleteSession: new DeleteSessionUseCase(sessions, games),
    updateSessionDetails: new UpdateSessionDetailsUseCase(sessions),
    finalizeSession: new FinalizeSessionUseCase(sessions, clock),
    listGroups: new ListGroupsUseCase(groups),
    listPlayersByGroup: new ListPlayersByGroupUseCase(players),
    getActiveSession: new GetActiveSessionUseCase(sessions),
    getSessionResults: new GetSessionResultsUseCase(sessions, games),
    getPlayerPerformanceAggregates: new GetPlayerPerformanceAggregatesUseCase(sessions, games),
    listFinalizedSessions: new ListFinalizedSessionsUseCase(sessions),
    listGamesBySession: new ListGamesBySessionUseCase(games),
    exportBackup: new ExportBackupUseCase(store, clock, "0.1.0"),
    importBackup: new ImportBackupUseCase(store),
  };
};

export type BrowserServices = ReturnType<typeof createBrowserServices>;
