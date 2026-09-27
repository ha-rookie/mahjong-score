type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export const isIosStandaloneWebApp = () => {
  const appleMobile =
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as NavigatorWithStandalone).standalone === true;
  return appleMobile && standalone;
};

export const IosStandaloneUnsupported = () => (
  <main className="unsupported-client" aria-labelledby="unsupported-client-title">
    <section className="unsupported-client__card">
      <div className="unsupported-client__mark" aria-hidden="true">🀄</div>
      <p className="unsupported-client__eyebrow">三麻スコア</p>
      <h1 id="unsupported-client-title">iPhoneではSafariでご利用ください</h1>
      <p>
        LINEログインを安定して利用するため、iPhone・iPadの
        「Webアプリとして開く」には対応していません。
      </p>
      <div className="unsupported-client__steps">
        <strong>利用方法</strong>
        <ol>
          <li>この画面を閉じる</li>
          <li>Safariで三麻スコアを開く</li>
          <li>SafariからLINEでログインする</li>
        </ol>
      </div>
      <p className="unsupported-client__note">
        ホーム画面へ追加する場合は「Webアプリとして開く」をOFFにしてください。
      </p>
    </section>
  </main>
);
