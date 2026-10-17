import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: { LLM_MODE: "mock", LOG_LEVEL: "silent" },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "text-summary"],
      thresholds: {
        "src/core/**": { lines: 95, functions: 95, branches: 90, statements: 95 },
      },
    },
  },
});
