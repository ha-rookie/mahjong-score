import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "./infrastructure/pwa/register-service-worker";
import {
  installIosStandaloneLineLoginBridge,
  notifyLineLoginCompletion,
} from "./infrastructure/pwa/ios-standalone-line-login";

registerServiceWorker();
notifyLineLoginCompletion();
installIosStandaloneLineLoginBridge();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
