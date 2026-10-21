import { defineConfig } from "vite";
export default defineConfig({
  base: process.env.PAGES_BASE_PATH || "/",
  server: { port: 5181, strictPort: true },
  preview: { port: 4181 },
  build: { rollupOptions: { output: { manualChunks: { three: ["three"] } } } },
});
