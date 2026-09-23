import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import type { Group, Player } from "./domain";
import type { ActiveSessionSummary } from "./application/use-cases";
import { createBrowserServices } from "./infrastructure/composition";
import { Button, Section, TextField } from "./components/ui";

type View = "home" | "session-setup";

const getLocalDateValue = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
};

const getModeLabel = (count: number): string =>
  count === 4 ? "4人回し三麻" : "3人三麻";

function App() {
  const services = useMemo(() => createBrowserServices(), []);
  const [view, setView] = useState<View>("home");
  const [group, setGroup] = useState<Group | null>(null);
  const [players, setPlayers] = useState<readonly Player[]>([]);
  const [activeSession, setActiveSession] =
    useState<ActiveSessionSummary | null>(null);
  const [groupName, setGroupName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<readonly string[]>(
    [],
  );
  const [sessionDate, setSessionDate] = useState(getLocalDateValue);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const refresh = useCallback(
    async (preferredGroupId?: string) => {
      setIsLoading(true);
      setErrorMessage(null);

      const groupsResult = await services.listGroups.execute();

      if (!groupsResult.ok) {
        setErrorMessage(
          groupsResult.error.userMessage ?? "グループを読み込めませんでした。",
        );
        setIsLoading(false);
        return;
      }

      const currentGroup =
        groupsResult.value.find((item) => item.id === preferredGroupId) ??
        groupsResult.value[0] ??
        null;

      setGroup(currentGroup);

      if (currentGroup === null) {
        setPlayers([]);
        setActiveSession(null);
        setIsLoading(false);
        return;
      }

      const [playersResult, activeResult] = await Promise.all([
        services.listPlayersByGroup.execute(currentGroup.id),
        services.getActiveSession.execute(currentGroup.id),
      ]);

      if (!playersResult.ok) {
        setErrorMessage(
          playersResult.error.userMessage ?? "メンバーを読み込めませんでした。",
        );
        setIsLoading(false);
        return;
      }

      if (!activeResult.ok) {
        setErrorMessage(
          activeResult.error.userMessage ?? "Sessionを読み込めませんでした。",
        );
        setIsLoading(false);
        return;
      }

      setPlayers(playersResult.value);
      setActiveSession(activeResult.value);
      setIsLoading(false);
    },
    [services],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreateGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const result = await services.createGroup.execute({ name: groupName });

    if (!result.ok) {
      setErrorMessage(
        result.error.userMessage ?? "グループを作成できませんでした。",
      );
      setIsBusy(false);
      return;
    }

    setGroupName("");
    setStatusMessage("グループを作成しました。");
    await refresh(result.value.id);
    setIsBusy(false);
  };

  const handleAddPlayer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (group === null) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const result = await services.addPlayerToGroup.execute({
      groupId: group.id,
      displayName: playerName,
    });

    if (!result.ok) {
      setErrorMessage(
        result.error.userMessage ?? "メンバーを追加できませんでした。",
      );
      setIsBusy(false);
      return;
    }

    setPlayerName("");
    setStatusMessage(result.value.displayName + "さんを追加しました。");
    await refresh(group.id);
    setIsBusy(false);
  };

  const openSessionSetup = () => {
    const defaultSelection =
      players.length >= 3 && players.length <= 4
        ? players.map((player) => player.id)
        : [];

    setSelectedPlayerIds(defaultSelection);
    setSessionDate(getLocalDateValue());
    setErrorMessage(null);
    setStatusMessage(null);
    setView("session-setup");
  };

  const toggleParticipant = (playerId: string) => {
    setSelectedPlayerIds((current) => {
      if (current.includes(playerId)) {
        return current.filter((id) => id !== playerId);
      }

      if (current.length >= 4) {
        return current;
      }

      return [...current, playerId];
    });
  };

  const handleStartSession = async () => {
    if (group === null) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const result = await services.startSession.execute({
      groupId: group.id,
      sessionDate,
      participantPlayerIds: selectedPlayerIds,
    });

    if (!result.ok) {
      setErrorMessage(
        result.error.userMessage ?? "Sessionを開始できませんでした。",
      );
      setIsBusy(false);
      return;
    }

    await refresh(group.id);
    setStatusMessage("Sessionを開始しました。");
    setView("home");
    setIsBusy(false);
  };

  const activePlayerNames =
    activeSession?.participantPlayerIds.map(
      (playerId) =>
        players.find((player) => player.id === playerId)?.displayName ??
        "不明なメンバー",
    ) ?? [];

  const canStartSession =
    selectedPlayerIds.length === 3 || selectedPlayerIds.length === 4;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">
              <span className="brand-tile" />
              <span className="brand-score-line brand-score-line--one" />
              <span className="brand-score-line brand-score-line--two" />
              <span className="brand-score-line brand-score-line--three" />
            </div>
            <div>
              <p className="eyebrow">MAHJONG SCORE</p>
              <p className="brand-name">三麻スコア</p>
            </div>
          </div>
          {view === "session-setup" ? (
            <Button variant="quiet" onClick={() => setView("home")}>
              戻る
            </Button>
          ) : null}
        </div>
      </header>

      <main className="page">
        {errorMessage ? (
          <div className="notice notice--error" role="alert">
            {errorMessage}
          </div>
        ) : null}

        {statusMessage ? (
          <div className="notice" role="status">
            {statusMessage}
          </div>
        ) : null}

        {isLoading ? (
          <div className="loading" role="status">
            記録を読み込んでいます…
          </div>
        ) : view === "session-setup" && group !== null ? (
          <section className="session-setup" aria-labelledby="session-title">
            <p className="screen-eyebrow">SESSION SETUP</p>
            <h1 id="session-title">今日の参加者</h1>
            <p className="screen-lead">
              3人または4人を選んで、そのままSessionを始めます。
            </p>

            <TextField
              id="session-date"
              label="日付"
              type="date"
              value={sessionDate}
              onChange={(event) => setSessionDate(event.target.value)}
            />

            <fieldset className="member-choices">
              <legend>参加するメンバー</legend>
              <div className="member-choice-list">
                {players.map((player) => {
                  const selected = selectedPlayerIds.includes(player.id);
                  const selectionLocked =
                    !selected && selectedPlayerIds.length >= 4;

                  return (
                    <label
                      className={[
                        "member-choice",
                        selected ? "member-choice--selected" : "",
                        selectionLocked ? "member-choice--disabled" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={player.id}
                    >
                      <input
                        checked={selected}
                        disabled={selectionLocked}
                        onChange={() => toggleParticipant(player.id)}
                        type="checkbox"
                      />
                      <span className="member-choice__name">
                        {player.displayName}
                      </span>
                      <span className="member-choice__state">
                        {selected ? "参加" : "不参加"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="selection-summary" aria-live="polite">
              <span>{selectedPlayerIds.length}人選択</span>
              <strong>
                {canStartSession
                  ? getModeLabel(selectedPlayerIds.length)
                  : "3人または4人を選択"}
              </strong>
            </div>

            <Button
              block
              disabled={!canStartSession || isBusy}
              onClick={() => void handleStartSession()}
            >
              {isBusy ? "開始しています…" : "このメンバーで開始"}
            </Button>
          </section>
        ) : group === null ? (
          <section className="welcome" aria-labelledby="welcome-title">
            <p className="screen-eyebrow">FIRST SETUP</p>
            <h1 id="welcome-title">最初のグループを作る</h1>
            <p className="screen-lead">
              まずは、いつもの麻雀メンバーをまとめるグループを作ります。
            </p>

            <form className="form-stack" onSubmit={handleCreateGroup}>
              <TextField
                autoComplete="off"
                id="group-name"
                label="グループ名"
                maxLength={40}
                placeholder="例：いつもの三麻"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
              />
              <Button block disabled={isBusy} type="submit">
                {isBusy ? "作成しています…" : "グループを作成"}
              </Button>
            </form>
          </section>
        ) : (
          <>
            <section className="home-hero" aria-labelledby="home-title">
              <p className="screen-eyebrow">HOME</p>
              <h1 id="home-title">仲間との麻雀を、静かに記録する。</h1>
              <p className="home-hero__meta">
                {group.name} · {players.length}人登録
              </p>

              {activeSession ? (
                <div className="active-session">
                  <div>
                    <p className="active-session__label">対局中</p>
                    <p className="active-session__date">
                      {activeSession.session.sessionDate}
                    </p>
                  </div>
                  <div>
                    <p className="active-session__mode">
                      {getModeLabel(activePlayerNames.length)}
                    </p>
                    <p className="active-session__players">
                      {activePlayerNames.join(" / ")}
                    </p>
                  </div>
                  <p className="active-session__note">
                    半荘結果の入力は次のFeatureで接続します。
                  </p>
                </div>
              ) : players.length >= 3 ? (
                <Button block onClick={openSessionSetup}>
                  今日の麻雀を始める
                </Button>
              ) : (
                <p className="empty-hint">
                  Sessionを始めるには、メンバーを3人以上登録してください。
                </p>
              )}
            </section>

            <Section
              eyebrow="GROUP"
              title="メンバー"
              action={
                <span className="member-count" aria-label={players.length + "人"}>
                  {players.length}
                </span>
              }
            >
              {players.length > 0 ? (
                <ul className="member-list">
                  {players.map((player) => (
                    <li key={player.id}>
                      <span className="member-avatar" aria-hidden="true">
                        {player.displayName.slice(0, 1)}
                      </span>
                      <span>{player.displayName}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-hint">
                  まだメンバーがいません。最初の1人を追加してください。
                </p>
              )}

              <form className="member-form" onSubmit={handleAddPlayer}>
                <TextField
                  autoComplete="off"
                  id="player-name"
                  label="メンバーを追加"
                  maxLength={30}
                  placeholder="表示名"
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                />
                <Button disabled={isBusy} type="submit" variant="secondary">
                  追加
                </Button>
              </form>
            </Section>
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>三麻スコア · Phase 1</p>
      </footer>
    </div>
  );
}

export default App;
