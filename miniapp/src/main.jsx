import React from "react";
import ReactDOM from "react-dom/client";
import { Sentry } from "./lib/sentry";
import App from "./app/App";
import Providers from "./app/providers";
import { MINIAPP_BUILD_ID } from "./lib/buildInfo";
import { getTelegramLaunchDebug } from "./lib/telegram";
import "./index.css";

window.__NOVANET_MINIAPP_BUILD__ = MINIAPP_BUILD_ID;
console.info("[NovaNet MiniApp] build", MINIAPP_BUILD_ID);
console.info("[NovaNet MiniApp] launch", getTelegramLaunchDebug());

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<div style={{ padding: 16 }}>Something went wrong. Please reopen the app.</div>}>
      <Providers>
        <App />
      </Providers>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
