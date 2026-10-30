/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js}"],
  theme: {
    extend: {
      colors: {
        app: "rgb(var(--bg-rgb) / <alpha-value>)",
        surface: "rgb(var(--surface-rgb) / <alpha-value>)",
        surface2: "rgb(var(--surface-2-rgb) / <alpha-value>)",
        line: "rgb(var(--line-rgb) / <alpha-value>)",
        line2: "rgb(var(--line-strong-rgb) / <alpha-value>)",
        fg: "rgb(var(--fg-rgb) / <alpha-value>)",
        muted: "rgb(var(--muted-rgb) / <alpha-value>)",
        faint: "rgb(var(--faint-rgb) / <alpha-value>)",
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        accsoft: "var(--accent-soft)",
        bamboo: "rgb(var(--bamboo-rgb) / <alpha-value>)",
        indigo: "rgb(var(--indigo-rgb) / <alpha-value>)",
        warning: "rgb(var(--warning-rgb) / <alpha-value>)",
        danger: "rgb(var(--danger-rgb) / <alpha-value>)",
        ink: {
          950: "#0e1116",
          900: "#12161c",
          850: "#161c23",
          800: "#1b222a",
          700: "#242d38",
          600: "#313d4b",
        },
        paper: {
          50: "#fbf9f3",
          100: "#f5f1e7",
          200: "#e9e2d2",
          300: "#d8cfba",
        },
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Source Han Serif SC"', '"Songti SC"', "STSong", "SimSun", "Georgia", "serif"],
        sans: ['"Inter"', '"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', "system-ui", "sans-serif"],
        ipa: ['"Charis SIL"', '"Doulos SIL"', '"Gentium Plus"', '"Times New Roman"', "serif"],
        mono: ['"JetBrains Mono"', '"Cascadia Code"', "Consolas", "monospace"],
      },
      maxWidth: { prose: "72ch" },
      boxShadow: {
        lift: "0 1px 2px rgba(0,0,0,.06), 0 8px 24px -12px rgba(0,0,0,.35)",
      },
      keyframes: {
        rise: { "0%": { opacity: 0, transform: "translateY(8px)" }, "100%": { opacity: 1, transform: "none" } },
        fade: { "0%": { opacity: 0 }, "100%": { opacity: 1 } },
        pop: { "0%": { transform: "scale(.96)", opacity: 0 }, "100%": { transform: "none", opacity: 1 } },
      },
      animation: { rise: "rise .35s ease-out both", fade: "fade .25s ease-out both", pop: "pop .18s ease-out both" },
    },
  },
  plugins: [],
};
