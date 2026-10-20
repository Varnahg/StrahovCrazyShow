import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const clientBuildId = execFileSync(process.execPath, [fileURLToPath(new URL("./scripts/build-identity.mjs", import.meta.url))], {
  encoding: "utf8", windowsHide: true,
}).trim();
export default defineConfig({
  define: { "import.meta.env.VITE_CLIENT_BUILD_ID": JSON.stringify(clientBuildId) },
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
      // Keep the browser's local origin visible to the diagnostic collector.
      "/api": { target: "http://127.0.0.1:2567", changeOrigin: false },
      "/realtime": {
        target: "http://127.0.0.1:2567",
        ws: true,
        rewrite: (path) => path.replace(/^\/realtime/, ""),
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{
            name: "babylon",
            test: /node_modules[\\/]@babylonjs[\\/]/,
            priority: 20,
            entriesAware: false,
            includeDependenciesRecursively: true,
          }],
        },
      },
    },
  },
});
