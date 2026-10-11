import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    entries: ["index.html", "client/**/*.ts", "client/**/*.tsx"],
  },
  server: {
    // Reference downloads and audit snapshots contain their own tsconfig/index
    // files. Watching them forces unrelated live-game reloads during research.
    watch: {
      ignored: [
        "**/.cache/**",
        "**/docs/**",
        "**/assets/blender/**",
        // Reference/asset exports are explicitly reloaded after review. They
        // must not repeatedly interrupt an unrelated active multiplayer visit.
        "**/public/models/**",
        "**/assets/reference/**",
        "**/assets/derivative/**",
      ],
    },
    proxy: {
      "/api": "http://127.0.0.1:2567",
      "/realtime": {
        target: "http://127.0.0.1:2567",
        ws: true,
        rewrite: (path) => path.replace(/^\/realtime/, ""),
      },
    },
  },
  build: { chunkSizeWarningLimit: 1100 },
});
