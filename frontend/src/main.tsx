import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
// Self-hosted variable fonts: no third-party font requests at runtime.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/lora";
import "@fontsource-variable/lora/wght-italic.css";
import "./styles/index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Failed to find the root element in index.html");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
