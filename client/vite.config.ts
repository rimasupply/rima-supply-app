import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// RIMA Supply standalone client. `vite build` emits to client/dist, which the
// Express server serves at /. In dev, /api proxies to the Express server.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
