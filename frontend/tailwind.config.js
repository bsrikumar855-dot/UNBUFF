import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // UNBLUFF "proofing desk" palette (Phase 11): warm paper, ink, and one accent, the examiner's red pen.
        // Contrast on paper (#F4F1EA): ink 16.4:1, ink-secondary 10.7:1, ink-muted 5.7:1, ink-subtle 4.8:1, redline 5.7:1.
        paper: "#F4F1EA",
        surface: {
          DEFAULT: "#FBF9F4", // raised surface (panels, cards)
          50: "#F4F1EA", // page background
          100: "#ECE8DE", // recessed (hover rows, wells)
          200: "#E2DDCF",
        },
        ink: {
          primary: "#15130F",
          secondary: "#3A362E",
          muted: "#645E52",
          subtle: "#6E675A",
        },
        line: {
          DEFAULT: "#DDD7C9", // hairline rule
          strong: "#8A8373", // control borders: 3.3:1 on paper, 3.6:1 on the raised surface, 3.1:1 on recessed (WCAG 1.4.11)
        },
        redline: {
          DEFAULT: "#B3291A", // the examiner's red pen: marks, links, active state, focus
          dark: "#8F1F13",
          soft: "#F6E4DF",
        },
        // shadcn/ui semantic tokens, mapped onto the palette (primary = the main action = ink).
        background: "#F4F1EA",
        foreground: "#15130F",
        card: { DEFAULT: "#FBF9F4", foreground: "#15130F" },
        popover: { DEFAULT: "#FBF9F4", foreground: "#15130F" },
        primary: { DEFAULT: "#15130F", foreground: "#F4F1EA" },
        secondary: { DEFAULT: "#ECE8DE", foreground: "#15130F" },
        muted: { DEFAULT: "#ECE8DE", foreground: "#645E52" },
        accent: { DEFAULT: "#ECE8DE", foreground: "#15130F" },
        destructive: { DEFAULT: "#B3291A", foreground: "#FFFFFF" },
        border: "#DDD7C9",
        input: "#8A8373",
        ring: "#B3291A",
        verified: "#1F6B4A",
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
          '"Geist Variable"',
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        serif: ['"Lora Variable"', "ui-serif", "Georgia", "Cambria", "serif"],
        mono: [
          '"Geist Mono Variable"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        // Editorial scale. Display and title sizes are fluid; body and UI sizes are fixed (min 14px for UI, 16px for reading).
        "display-xl": [
          "clamp(2.75rem, 1.6rem + 5.2vw, 6rem)",
          { lineHeight: "0.98", letterSpacing: "-0.035em" },
        ],
        display: [
          "clamp(2.25rem, 1.5rem + 3.2vw, 4rem)",
          { lineHeight: "1.02", letterSpacing: "-0.03em" },
        ],
        title: [
          "clamp(1.75rem, 1.4rem + 1.4vw, 2.5rem)",
          { lineHeight: "1.1", letterSpacing: "-0.025em" },
        ],
        heading: ["1.375rem", { lineHeight: "1.25", letterSpacing: "-0.015em" }],
        eyebrow: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.09em" }],
      },
      borderRadius: {
        // Hard-edged, editorial: controls are barely rounded, containers a touch more.
        sm: "2px",
        md: "4px",
        lg: "6px",
        xl: "10px",
      },
      boxShadow: {
        // Elevation is reserved for things that float above the page.
        float: "0 1px 0 rgb(21 19 15 / 0.04), 0 12px 32px -12px rgb(21 19 15 / 0.28)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.2, 0.7, 0.2, 1)",
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
        rise: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          "0%": { transform: "translateX(-12px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(16px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "overlay-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "pop-in": {
          "0%": { opacity: "0", transform: "translateY(4px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "mark-draw": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
      },
      animation: {
        // Used via the `motion-safe:` variant so they are no-ops under prefers-reduced-motion without extra JS.
        "fade-up": "fade-up 400ms cubic-bezier(0.2,0.7,0.2,1) both",
        rise: "rise 320ms cubic-bezier(0.2,0.7,0.2,1) both",
        // Route changes: fill "backwards" so no transform remains afterwards (it would trap position:fixed descendants).
        "route-in": "rise 240ms cubic-bezier(0.2,0.7,0.2,1) backwards",
        "slide-in": "slide-in 220ms cubic-bezier(0.2,0.7,0.2,1) both",
        "slide-in-right": "slide-in-right 220ms cubic-bezier(0.2,0.7,0.2,1) both",
        "overlay-in": "overlay-in 160ms ease-out both",
        "pop-in": "pop-in 160ms cubic-bezier(0.2,0.7,0.2,1) both",
        "mark-draw": "mark-draw 520ms cubic-bezier(0.2,0.7,0.2,1) 120ms both",
        "scroll-cue": "scroll-cue 1.8s cubic-bezier(0.6,0,0.2,1) infinite",
      },
    },
  },
  plugins: [animate],
};
