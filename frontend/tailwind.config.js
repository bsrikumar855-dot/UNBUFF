/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // UNBLUFF base palette — Milestone 0 design system
        surface: {
          DEFAULT: "#FFFFFF",
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
        },
        ink: {
          primary: "#0F172A",
          secondary: "#334155",
          muted: "#64748B",
          subtle: "#94A3B8",
        },
        line: {
          DEFAULT: "#E2E8F0",
          strong: "#CBD5E1",
        },
        primary: {
          DEFAULT: "#4F46E5",
          dark: "#3730A3",
          soft: "#EEF2FF",
        },
        // Verdict accent colors — UNBLUFF Design Bible §6 (contract-locked).
        // `fg` is icon/left-border accent only (3:1 non-text contrast is
        // enough there); label text uses ink tokens, never `fg` directly —
        // see src/styles/tokens.ts for the documented reasoning.
        verdict: {
          defended: {
            fg: "#059669",
            bg: "#DCFCE7",
          },
          shaky: {
            fg: "#D97706",
            bg: "#FEF3C7",
          },
          bluff: {
            fg: "#DC2626",
            bg: "#FEE2E2",
          },
          honest_gap: {
            fg: "#4F46E5",
            bg: "#EEF2FF",
          },
          error: {
            fg: "#64748B",
            bg: "#F1F5F9",
          },
          pending: {
            fg: "#94A3B8",
            bg: "#F1F5F9",
          },
        },
        // Skill state accent colors — Design Bible §7 (contract-locked)
        skill: {
          ready: {
            fg: "#059669",
            bg: "#DCFCE7",
          },
          needs_work: {
            fg: "#D97706",
            bg: "#FEF3C7",
          },
          unverified: {
            fg: "#94A3B8",
            bg: "#F1F5F9",
          },
          blind_spot: {
            fg: "#0F172A",
            bg: "#F1F5F9",
          },
          deprioritized: {
            fg: "#CBD5E1",
            bg: "#F1F5F9",
          },
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "18px",
      },
      screens: {
        // Additive: keeps Tailwind's default sm/md/lg/xl/2xl, adds the
        // large-desktop breakpoint called out in the Milestone 0 brief.
        wide: "1440px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        // Used via the `motion-safe:` variant so it's a no-op under
        // prefers-reduced-motion without any extra JS.
        "fade-up": "fade-up 400ms ease-out both",
      },
    },
  },
  plugins: [],
};
