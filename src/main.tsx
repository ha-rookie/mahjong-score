import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "./infrastructure/pwa/register-service-worker";
import { IosStandaloneUnsupported, isIosStandaloneWebApp } from "./components/ios-standalone-unsupported";
registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isIosStandaloneWebApp() ? <IosStandaloneUnsupported /> : <App />}
  </StrictMode>,
);
