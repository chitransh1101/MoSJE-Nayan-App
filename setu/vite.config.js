import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port 5174 so Setu and Sentinel (5173) can run side by side.
// /api is proxied to the shared backend during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // A backend that hangs is treated as down after 8 s, so Setu falls back to
    // demo data instead of waiting.
    proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true, timeout: 8000, proxyTimeout: 8000 } },
  },
});
