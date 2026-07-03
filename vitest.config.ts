import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // node環境で回すサーバー/共有ロジックのテストのみ。
    // クライアント（jsdom必須）の *.test.tsx は vitest.client.config.ts で実行する。
    include: ["functions/src/**/*.test.ts", "functions/src/**/*.spec.ts", "shared/**/*.test.ts"],
  },
});
