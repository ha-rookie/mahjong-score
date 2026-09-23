import {
  AddPlayerToGroupUseCase,
  CreateGroupUseCase,
  GetActiveSessionUseCase,
  ListGroupsUseCase,
  ListPlayersByGroupUseCase,
  StartSessionUseCase,
} from "../../application/use-cases";
import {
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
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();

  return {
    createGroup: new CreateGroupUseCase(groups, ids, clock),
    addPlayerToGroup: new AddPlayerToGroupUseCase(players, ids, clock),
    startSession: new StartSessionUseCase(sessions, players, ids, clock),
    listGroups: new ListGroupsUseCase(groups),
    listPlayersByGroup: new ListPlayersByGroupUseCase(players),
    getActiveSession: new GetActiveSessionUseCase(sessions),
  };
};

export type BrowserServices = ReturnType<typeof createBrowserServices>;
