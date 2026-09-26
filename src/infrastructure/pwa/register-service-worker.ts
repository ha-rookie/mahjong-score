export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // PWA support is progressive enhancement; app runtime must remain usable
      // when Service Worker registration is unavailable.
    });
  });
}
