import React from "react";
import ReactDOM from "react-dom/client";

import "leaflet/dist/leaflet.css"; // bundled, not loaded from a CDN

import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
