import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { initMonitoring } from "./monitoring";
import "./style.css";

initMonitoring();

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
