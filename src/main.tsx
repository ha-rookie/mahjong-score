import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthSessionRecovery } from "./components/auth-session-recovery";
import { InitialBootOverlay } from "./components/initial-boot-overlay";
import { installBrowserAuthSessionGuard } from "./infrastructure/api/browser-auth-session";
import "./index.css";
import "./mobile-polish.css";
import "./session-danger-zone.css";
import "./session-end-flow.css";
import "./session-memo-save-state.css";
import "./session-result-metrics.css";
import "./session-result-share.css";
import "./performance-metrics.css";
installBrowserAuthSessionGuard();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <InitialBootOverlay />
    <App />
    <AuthSessionRecovery />
  </StrictMode>,
);
