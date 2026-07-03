import { defineConfig } from "vitest/config";
import path from "path";

const root = path.resolve(import.meta.dirname);

// クライアント（React 画面）専用のテスト設定。jsdom 環境で実行する。
// 通常の `pnpm test`（vitest.config.ts, node環境）とは分離している。
export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": path.resolve(root, "client", "src"),
      "@shared": path.resolve(root, "shared"),
      "@assets": path.resolve(root, "attached_assets"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./client/src/test-setup.ts"],
    include: ["client/src/**/*.test.{ts,tsx}"],
  },
});
