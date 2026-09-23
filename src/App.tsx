const bootstrapItems = [
  "React + TypeScript + Vite",
  "Cloudflare Workers + Static Assets",
  "Phase 1 は localStorage",
];

function App() {
  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="app-title">
        <div className="brand-mark" aria-hidden="true">
          <span className="brand-tile" />
          <span className="brand-score-line brand-score-line--one" />
          <span className="brand-score-line brand-score-line--two" />
          <span className="brand-score-line brand-score-line--three" />
        </div>

        <p className="eyebrow">MAHJONG SCORE</p>
        <h1 id="app-title">三麻スコア</h1>
        <p className="lead">仲間との麻雀を、静かに記録する。</p>
        <p className="body-copy">
          半荘、チップ、月間・年間・通算成績を、卓上で迷わず残せる
          スコア管理アプリを準備しています。
        </p>

        <div className="bootstrap-panel">
          <p className="bootstrap-title">Phase 1 bootstrap</p>
          <ul>
            {bootstrapItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <p className="status">mahjong-score-app · bootstrap ready</p>
      </section>
    </main>
  );
}

export default App;
