import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/health": { target: API_TARGET, changeOrigin: true },
      "/model_info": { target: API_TARGET, changeOrigin: true },
      "/predict": { target: API_TARGET, changeOrigin: true },
      "/docs": { target: API_TARGET, changeOrigin: true },
      "/openapi.json": { target: API_TARGET, changeOrigin: true },
      "/redoc": { target: API_TARGET, changeOrigin: true },
    },
  };
});
