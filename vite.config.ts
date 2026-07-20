import { defineConfig } from "vite";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  build: {
    target: "es2022",
    sourcemap: false,
    cssCodeSplit: true,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 250,
  },
  worker: { format: "es" },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
});
