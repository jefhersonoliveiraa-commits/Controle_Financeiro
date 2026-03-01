import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: "hsl(var(--bg) / <alpha-value>)",
        surface: "hsl(var(--surface) / <alpha-value>)",
        "surface-soft": "hsl(var(--surface-soft) / <alpha-value>)",
        "surface-elevated": "hsl(var(--surface-elevated) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        text: "hsl(var(--text) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        brand: "hsl(var(--brand) / <alpha-value>)",
        "brand-contrast": "hsl(var(--brand-contrast) / <alpha-value>)",
        success: "hsl(var(--success) / <alpha-value>)",
        danger: "hsl(var(--danger) / <alpha-value>)",
        warning: "hsl(var(--warning) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)"
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem"
      },
      boxShadow: {
        panel: "0 20px 45px -20px rgba(15, 23, 42, 0.35)",
        soft: "0 10px 25px -18px rgba(6, 22, 46, 0.5)"
      }
    }
  },
  plugins: []
};

export default config;
