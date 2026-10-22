import { defineConfig, loadEnv, type Plugin, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { cspMetaTag } from "./src/lib/csp";

interface VitestConfig extends UserConfig {
  test: {
    globals: boolean;
    environment: string;
    setupFiles: string[];
    include: string[];
    testTimeout: number;
    hookTimeout: number;
  };
}

/** Builds only: pins the page's allowed connections to the configured API and Firebase (see src/lib/csp.ts). */
function connectSrcPolicy(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    name: "unbluff-connect-src-policy",
    apply: "build",
    transformIndexHtml: (html) => html.replace("<head>", `<head>\n    ${cspMetaTag(env, { production: mode === "production" })}`),
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), connectSrcPolicy(mode)],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    // These tests render whole pages with lazy chunks. A shared two-core CI runner is several times slower than a laptop.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
}) as VitestConfig);
