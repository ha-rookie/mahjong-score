import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import type { Game, Group, Player } from "./domain";
import type { ActiveSessionSummary } from "./application/use-cases";
import { createBrowserServices } from "./infrastructure/composition";
import { Button, Section, TextField } from "./components/ui";

type View = "home" | "session-setup" | "game-result";

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
  const [games, setGames] = useState<readonly Game[]>([]);
  const [groupName, setGroupName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<readonly string[]>([]);
  const [sessionDate, setSessionDate] = useState(getLocalDateValue);
  const [rankedPlayerIds, setRankedPlayerIds] = useState<readonly string[]>([]);
  const [scoreInputs, setScoreInputs] = useState<readonly string[]>([]);
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
        setErrorMessage(groupsResult.error.userMessage ?? "グループを読み込めませんでした。");
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
        setGames([]);
        setIsLoading(false);
        return;
      }

      const [playersResult, activeResult] = await Promise.all([
        services.listPlayersByGroup.execute(currentGroup.id),
        services.getActiveSession.execute(currentGroup.id),
      ]);

      if (!playersResult.ok) {
        setErrorMessage(playersResult.error.userMessage ?? "メンバーを読み込めませんでした。");
        setIsLoading(false);
        return;
      }
      if (!activeResult.ok) {
        setErrorMessage(activeResult.error.userMessage ?? "Sessionを読み込めませんでした。");
        setIsLoading(false);
        return;
      }

      setPlayers(playersResult.value);
      setActiveSession(activeResult.value);

      if (activeResult.value === null) {
        setGames([]);
      } else {
        const gamesResult = await services.listGamesBySession.execute(
          activeResult.value.session.id,
        );
        if (!gamesResult.ok) {
          setErrorMessage(gamesResult.error.userMessage ?? "半荘履歴を読み込めませんでした。");
          setIsLoading(false);
          return;
        }
        setGames(gamesResult.value);
      }
      setIsLoading(false);
    },
    [services],
  );

  useEffect(() => { void refresh(); }, [refresh]);

  const playerNameById = (playerId: string): string =>
    players.find((player) => player.id === playerId)?.displayName ?? "不明なメンバー";

  const handleCreateGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsBusy(true); setErrorMessage(null); setStatusMessage(null);
    const result = await services.createGroup.execute({ name: groupName });
    if (!result.ok) {
      setErrorMessage(result.error.userMessage ?? "グループを作成できませんでした。");
      setIsBusy(false); return;
    }
    setGroupName(""); setStatusMessage("グループを作成しました。");
    await refresh(result.value.id); setIsBusy(false);
  };

  const handleAddPlayer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (group === null) return;
    setIsBusy(true); setErrorMessage(null); setStatusMessage(null);
    const result = await services.addPlayerToGroup.execute({
      groupId: group.id, displayName: playerName,
    });
    if (!result.ok) {
      setErrorMessage(result.error.userMessage ?? "メンバーを追加できませんでした。");
      setIsBusy(false); return;
    }
    setPlayerName(""); setStatusMessage(result.value.displayName + "さんを追加しました。");
    await refresh(group.id); setIsBusy(false);
  };

  const openSessionSetup = () => {
    const defaultSelection =
      players.length >= 3 && players.length <= 4 ? players.map((player) => player.id) : [];
    setSelectedPlayerIds(defaultSelection);
    setSessionDate(getLocalDateValue());
    setErrorMessage(null); setStatusMessage(null); setView("session-setup");
  };

  const toggleParticipant = (playerId: string) => {
    setSelectedPlayerIds((current) => {
      if (current.includes(playerId)) return current.filter((id) => id !== playerId);
      if (current.length >= 4) return current;
      return [...current, playerId];
    });
  };

  const handleStartSession = async () => {
    if (group === null) return;
    setIsBusy(true); setErrorMessage(null); setStatusMessage(null);
    const result = await services.startSession.execute({
      groupId: group.id, sessionDate, participantPlayerIds: selectedPlayerIds,
    });
    if (!result.ok) {
      setErrorMessage(result.error.userMessage ?? "Sessionを開始できませんでした。");
      setIsBusy(false); return;
    }
    await refresh(group.id);
    setStatusMessage("Sessionを開始しました。"); setView("home"); setIsBusy(false);
  };

  const openGameResult = () => {
    if (activeSession === null) return;
    setRankedPlayerIds([...activeSession.participantPlayerIds]);
    setScoreInputs(Array(activeSession.participantPlayerIds.length - 1).fill(""));
    setErrorMessage(null); setStatusMessage(null); setView("game-result");
  };

  const moveRankedPlayer = (index: number, direction: -1 | 1) => {
    setRankedPlayerIds((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return next;
    });
  };

  const parsedScores = scoreInputs.map((value) =>
    /^-?\d+$/.test(value.trim()) ? Number(value) : Number.NaN,
  );
  const canSaveGame =
    rankedPlayerIds.length >= 3 &&
    scoreInputs.length === rankedPlayerIds.length - 1 &&
    parsedScores.every(Number.isInteger);
  const previewFirstScore = canSaveGame
    ? -parsedScores.reduce((sum, value) => sum + value, 0)
    : null;

  const handleSaveGame = async () => {
    if (activeSession === null || group === null || !canSaveGame) return;
    setIsBusy(true); setErrorMessage(null); setStatusMessage(null);
    const result = await services.addGameResult.execute({
      sessionId: activeSession.session.id,
      rankedPlayerIds,
      lowerRankScorePoints: parsedScores,
    });
    if (!result.ok) {
      setErrorMessage(result.error.userMessage ?? "半荘結果を保存できませんでした。");
      setIsBusy(false); return;
    }
    await refresh(group.id);
    setStatusMessage("半荘結果を保存しました。");
    setView("home"); setIsBusy(false);
  };

  const activePlayerNames =
    activeSession?.participantPlayerIds.map(playerNameById) ?? [];
  const canStartSession =
    selectedPlayerIds.length === 3 || selectedPlayerIds.length === 4;

  const sessionTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const game of games) {
      for (const result of game.results) {
        totals.set(result.playerId, (totals.get(result.playerId) ?? 0) + result.scorePoint);
      }
    }
    return totals;
  }, [games]);

  const backToHome = () => {
    setErrorMessage(null); setStatusMessage(null); setView("home");
  };

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
            <div><p className="eyebrow">MAHJONG SCORE</p><p className="brand-name">三麻スコア</p></div>
          </div>
          {view !== "home" ? <Button variant="quiet" onClick={backToHome}>戻る</Button> : null}
        </div>
      </header>

      <main className="page">
        {errorMessage ? <div className="notice notice--error" role="alert">{errorMessage}</div> : null}
        {statusMessage ? <div className="notice" role="status">{statusMessage}</div> : null}
        {isLoading ? (
          <div className="loading" role="status">記録を読み込んでいます…</div>
        ) : view === "game-result" && activeSession !== null ? (
          <section className="game-entry" aria-labelledby="game-entry-title">
            <p className="screen-eyebrow">GAME RESULT</p>
            <h1 id="game-entry-title">半荘結果を追加</h1>
            <p className="screen-lead">
              上から順位順です。並べ替えて、2位以下のポイントを入力してください。
            </p>
            <ol className="rank-list">
              {rankedPlayerIds.map((playerId, index) => (
                <li className="rank-row" key={playerId}>
                  <span className="rank-badge">{index + 1}位</span>
                  <strong className="rank-name">{playerNameById(playerId)}</strong>
                  <div className="rank-move" aria-label={playerNameById(playerId) + "の順位変更"}>
                    <button type="button" disabled={index === 0} onClick={() => moveRankedPlayer(index, -1)} aria-label="一つ上へ">↑</button>
                    <button type="button" disabled={index === rankedPlayerIds.length - 1} onClick={() => moveRankedPlayer(index, 1)} aria-label="一つ下へ">↓</button>
                  </div>
                  {index === 0 ? (
                    <output className="score-preview" aria-label="1位の自動計算ポイント">
                      {previewFirstScore === null ? "自動" : (previewFirstScore > 0 ? "+" : "") + previewFirstScore}
                    </output>
                  ) : (
                    <label className="score-input">
                      <span className="sr-only">{index + 1}位のポイント</span>
                      <input
                        inputMode="numeric"
                        pattern="-?[0-9]*"
                        placeholder="0"
                        value={scoreInputs[index - 1] ?? ""}
                        onChange={(event) => setScoreInputs((current) =>
                          current.map((value, scoreIndex) =>
                            scoreIndex === index - 1 ? event.target.value : value,
                          )
                        )}
                      />
                      <span>pt</span>
                    </label>
                  )}
                </li>
              ))}
            </ol>
            <p className="game-entry__hint">1pt = 1,000点。小数は使いません。1位は合計0になるよう自動計算します。</p>
            <Button block disabled={!canSaveGame || isBusy} onClick={() => void handleSaveGame()}>
              {isBusy ? "保存しています…" : "この半荘を保存"}
            </Button>
          </section>
        ) : view === "session-setup" && group !== null ? (
          <section className="session-setup" aria-labelledby="session-title">
            <p className="screen-eyebrow">SESSION SETUP</p>
            <h1 id="session-title">今日の参加者</h1>
            <p className="screen-lead">3人または4人を選んで、そのままSessionを始めます。</p>
            <TextField id="session-date" label="日付" type="date" value={sessionDate}
              onChange={(event) => setSessionDate(event.target.value)} />
            <fieldset className="member-choices">
              <legend>参加するメンバー</legend>
              <div className="member-choice-list">
                {players.map((player) => {
                  const selected = selectedPlayerIds.includes(player.id);
                  const selectionLocked = !selected && selectedPlayerIds.length >= 4;
                  return (
                    <label className={["member-choice", selected ? "member-choice--selected" : "", selectionLocked ? "member-choice--disabled" : ""].filter(Boolean).join(" ")} key={player.id}>
                      <input checked={selected} disabled={selectionLocked} onChange={() => toggleParticipant(player.id)} type="checkbox" />
                      <span className="member-choice__name">{player.displayName}</span>
                      <span className="member-choice__state">{selected ? "参加" : "不参加"}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="selection-summary" aria-live="polite">
              <span>{selectedPlayerIds.length}人選択</span>
              <strong>{canStartSession ? getModeLabel(selectedPlayerIds.length) : "3人または4人を選択"}</strong>
            </div>
            <Button block disabled={!canStartSession || isBusy} onClick={() => void handleStartSession()}>
              {isBusy ? "開始しています…" : "このメンバーで開始"}
            </Button>
          </section>
        ) : group === null ? (
          <section className="welcome" aria-labelledby="welcome-title">
            <p className="screen-eyebrow">FIRST SETUP</p>
            <h1 id="welcome-title">最初のグループを作る</h1>
            <p className="screen-lead">まずは、いつもの麻雀メンバーをまとめるグループを作ります。</p>
            <form className="form-stack" onSubmit={handleCreateGroup}>
              <TextField autoComplete="off" id="group-name" label="グループ名" maxLength={40}
                placeholder="例：いつもの三麻" value={groupName} onChange={(event) => setGroupName(event.target.value)} />
              <Button block disabled={isBusy} type="submit">{isBusy ? "作成しています…" : "グループを作成"}</Button>
            </form>
          </section>
        ) : (
          <>
            <section className="home-hero" aria-labelledby="home-title">
              <p className="screen-eyebrow">HOME</p>
              <h1 id="home-title">仲間との麻雀を、静かに記録する。</h1>
              <p className="home-hero__meta">{group.name} · {players.length}人登録</p>
              {activeSession ? (
                <div className="active-session">
                  <div><p className="active-session__label">対局中</p><p className="active-session__date">{activeSession.session.sessionDate}</p></div>
                  <div><p className="active-session__mode">{getModeLabel(activePlayerNames.length)}</p><p className="active-session__players">{activePlayerNames.join(" / ")}</p></div>
                  <Button block onClick={openGameResult}>＋ 半荘結果を追加</Button>
                </div>
              ) : players.length >= 3 ? (
                <Button block onClick={openSessionSetup}>今日の麻雀を始める</Button>
              ) : (
                <p className="empty-hint">Sessionを始めるには、メンバーを3人以上登録してください。</p>
              )}
            </section>

            {activeSession ? (
              <Section eyebrow="SESSION" title={"今日の成績 · " + games.length + "半荘"}>
                <div className="session-totals">
                  {activeSession.participantPlayerIds.map((playerId) => {
                    const total = sessionTotals.get(playerId) ?? 0;
                    return (
                      <div className="session-total" key={playerId}>
                        <span>{playerNameById(playerId)}</span>
                        <strong>{total > 0 ? "+" : ""}{total} pt</strong>
                      </div>
                    );
                  })}
                </div>
                {games.length > 0 ? (
                  <ol className="game-history">
                    {[...games].reverse().map((game) => (
                      <li key={game.id}>
                        <span className="game-history__number">#{game.sequence}</span>
                        <span className="game-history__results">
                          {game.results.map((result, index) =>
                            (index + 1) + "位 " + playerNameById(result.playerId) + " " +
                            (result.scorePoint > 0 ? "+" : "") + result.scorePoint
                          ).join(" / ")}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : <p className="empty-hint">まだ半荘結果はありません。</p>}
              </Section>
            ) : null}

            <Section eyebrow="GROUP" title="メンバー" action={<span className="member-count" aria-label={players.length + "人"}>{players.length}</span>}>
              {players.length > 0 ? (
                <ul className="member-list">{players.map((player) => (
                  <li key={player.id}><span className="member-avatar" aria-hidden="true">{player.displayName.slice(0, 1)}</span><span>{player.displayName}</span></li>
                ))}</ul>
              ) : <p className="empty-hint">まだメンバーがいません。最初の1人を追加してください。</p>}
              <form className="member-form" onSubmit={handleAddPlayer}>
                <TextField autoComplete="off" id="player-name" label="メンバーを追加" maxLength={30}
                  placeholder="表示名" value={playerName} onChange={(event) => setPlayerName(event.target.value)} />
                <Button disabled={isBusy} type="submit" variant="secondary">追加</Button>
              </form>
            </Section>
          </>
        )}
      </main>
      <footer className="app-footer"><p>三麻スコア · Phase 1</p></footer>
    </div>
  );
}
export default App;
