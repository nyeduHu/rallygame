// vitest.config.ts
import path from "node:path";
import { defineConfig } from "vitest/config";

const GENERATION_SUITE_TIMEOUT_MS = 60_000;

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "server/**/*.test.ts"],
    testTimeout: GENERATION_SUITE_TIMEOUT_MS,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
