import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./mobile-polish.css";
import "./session-danger-zone.css";
import "./session-end-flow.css";
import "./session-memo-save-state.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
