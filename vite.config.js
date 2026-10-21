import { defineConfig } from "vite";
export default defineConfig({
  server: { port: 5181, strictPort: true },
  preview: { port: 4181 },
  build: { rollupOptions: { output: { manualChunks: { three: ["three"] } } } },
});
