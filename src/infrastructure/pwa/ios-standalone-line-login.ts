const LINE_LOGIN_PATH = "/api/auth/line/start";
const LOGIN_BUTTON_SELECTOR = "button.login-gate__button";
const LOGIN_WINDOW_NAME = "mahjong-line-oauth";
const LOGIN_COMPLETE_MESSAGE = "mahjong:line-login-complete";
const LOGIN_CHANNEL_NAME = "mahjong-line-login";
const POPUP_CHECK_INTERVAL_MS = 250;
const POPUP_CHECK_TIMEOUT_MS = 2 * 60 * 1000;

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

type LoginCompletePayload = {
  type: typeof LOGIN_COMPLETE_MESSAGE;
};

let installed = false;
let activePopup: Window | null = null;
let popupCheckTimer: number | null = null;
let popupTimeoutTimer: number | null = null;
let reloading = false;

export const isAppleMobilePlatform = (
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
) =>
  /iPad|iPhone|iPod/i.test(userAgent) ||
  (platform === "MacIntel" && maxTouchPoints > 1);

export const isStandaloneDisplayMode = (
  displayModeStandalone: boolean,
  navigatorStandalone?: boolean,
) => displayModeStandalone || navigatorStandalone === true;

const isIosStandaloneWebApp = () => {
  const ios = isAppleMobilePlatform(
    navigator.userAgent,
    navigator.platform,
    navigator.maxTouchPoints,
  );
  const standalone = isStandaloneDisplayMode(
    window.matchMedia("(display-mode: standalone)").matches,
    (navigator as NavigatorWithStandalone).standalone,
  );
  return ios && standalone;
};

const clearPopupTimers = () => {
  if (popupCheckTimer !== null) {
    window.clearInterval(popupCheckTimer);
    popupCheckTimer = null;
  }
  if (popupTimeoutTimer !== null) {
    window.clearTimeout(popupTimeoutTimer);
    popupTimeoutTimer = null;
  }
};

const reloadAfterLogin = () => {
  if (reloading) return;
  reloading = true;
  clearPopupTimers();
  activePopup = null;
  window.location.reload();
};

const watchPopupClose = (popup: Window) => {
  clearPopupTimers();
  popupCheckTimer = window.setInterval(() => {
    if (popup.closed) reloadAfterLogin();
  }, POPUP_CHECK_INTERVAL_MS);
  popupTimeoutTimer = window.setTimeout(() => {
    clearPopupTimers();
    activePopup = null;
  }, POPUP_CHECK_TIMEOUT_MS);
};

const openLineLoginInsideWebApp = () => {
  if (activePopup && !activePopup.closed) {
    activePopup.focus();
    return;
  }

  const popup = window.open(LINE_LOGIN_PATH, LOGIN_WINDOW_NAME);
  if (!popup) {
    // Keep the fallback on window.open as well. Apple documents window.open as
    // the mechanism that keeps out-of-scope OAuth navigation in the Web App.
    window.open(LINE_LOGIN_PATH, "_self");
    return;
  }

  activePopup = popup;
  watchPopupClose(popup);
};

const isLoginCompletePayload = (value: unknown): value is LoginCompletePayload =>
  typeof value === "object" &&
  value !== null &&
  (value as { type?: unknown }).type === LOGIN_COMPLETE_MESSAGE;

export const notifyLineLoginCompletion = () => {
  const url = new URL(window.location.href);
  if (url.searchParams.get("login") !== "success") return false;

  const payload: LoginCompletePayload = { type: LOGIN_COMPLETE_MESSAGE };

  try {
    if (window.opener && window.opener !== window) {
      window.opener.postMessage(payload, window.location.origin);
    }
  } catch {
    // The OAuth provider may sever opener linkage; BroadcastChannel below is
    // the same-origin fallback once the callback has returned to the Web App.
  }

  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(LOGIN_CHANNEL_NAME);
      channel.postMessage(payload);
      channel.close();
    } catch {
      // Closing the script-opened OAuth window is still sufficient for the
      // parent watcher to reload and re-read /api/auth/me once.
    }
  }

  try {
    // This succeeds for a script-opened OAuth window. In a normal same-tab
    // browser login it is ignored, so the existing Safari flow remains intact.
    window.close();
  } catch {
    // No action required. The authenticated page can continue rendering.
  }

  return true;
};

export const installIosStandaloneLineLoginBridge = () => {
  if (installed || !isIosStandaloneWebApp()) return;
  installed = true;

  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest(LOGIN_BUTTON_SELECTOR);
    if (!(button instanceof HTMLButtonElement)) return;

    // Capture before React's onClick. The existing normal-browser handler uses
    // location.assign(), which can move iOS standalone OAuth into Safari.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openLineLoginInsideWebApp();
  };

  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.origin !== window.location.origin) return;
    if (isLoginCompletePayload(event.data)) reloadAfterLogin();
  };

  document.addEventListener("click", onClick, true);
  window.addEventListener("message", onMessage);

  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(LOGIN_CHANNEL_NAME);
      channel.addEventListener("message", (event: MessageEvent<unknown>) => {
        if (isLoginCompletePayload(event.data)) reloadAfterLogin();
      });
    } catch {
      // opener + popup.closed remain available as fallbacks.
    }
  }
};
