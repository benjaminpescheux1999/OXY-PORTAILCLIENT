import React from "react";
import ReactDOM from "react-dom/client";
import LogRocket from "logrocket";
import { App } from "./App";
import "./style.css";

const logRocketId = import.meta.env.VITE_LOGROCKET_APP_ID;
if (logRocketId) {
  LogRocket.init(logRocketId);
}

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
