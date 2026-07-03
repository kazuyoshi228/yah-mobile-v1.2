import { defineConfig } from "vitest/config";

// Firestore Rules テスト専用。エミュレータ起動下で実行する（pnpm run test:rules）。
// 通常の `pnpm test`（vitest.config.ts）はこの tests/ を対象に含めない。
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
