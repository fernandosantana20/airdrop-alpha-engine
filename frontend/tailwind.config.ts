import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--bg-canvas) / <alpha-value>)",
        surface: "rgb(var(--bg-surface) / <alpha-value>)",
        elevated: "rgb(var(--bg-elevated) / <alpha-value>)",
        border: "rgb(var(--border-subtle) / <alpha-value>)",
        "border-strong": "rgb(var(--border-strong) / <alpha-value>)",
        fg: "rgb(var(--text-primary) / <alpha-value>)",
        "fg-secondary": "rgb(var(--text-secondary) / <alpha-value>)",
        "fg-muted": "rgb(var(--text-muted) / <alpha-value>)",
        track: "rgb(var(--track-bg) / <alpha-value>)",
        btn: "rgb(var(--accent-btn-bg) / <alpha-value>)",
        "btn-fg": "rgb(var(--accent-btn-fg) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};

export default config;
