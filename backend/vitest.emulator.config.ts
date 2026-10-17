import { defineConfig } from "vitest/config";

/** Integration tests that need the Firebase Auth + Firestore emulators. Run with `npm run test:emulator`. */
export default defineConfig({
  test: {
    include: ["tests/emulator/**/*.test.ts"],
    environment: "node",
    env: { LLM_MODE: "mock", LOG_LEVEL: "silent" },
    testTimeout: 20_000,
    fileParallelism: false,
  },
});
