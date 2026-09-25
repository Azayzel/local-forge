import react from "@vitejs/plugin-react";
import * as electronModule from "vite-plugin-electron/simple";
import type { ElectronSimpleOptions } from "vite-plugin-electron/simple";
import { defineConfig } from "vite";

const electron = electronModule.default as unknown as (
  options: ElectronSimpleOptions,
) => Promise<import("vite").Plugin[]>;

export default defineConfig({
  server: {
    watch: {
      ignored: [
        "**/.venv/**",
        "**/dist/**",
        "**/dist-electron/**",
        "**/release/**",
      ],
    },
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
      },
      preload: {
        input: "electron/preload.ts",
      },
    }),
  ],
  build: {
    sourcemap: true,
  },
});
