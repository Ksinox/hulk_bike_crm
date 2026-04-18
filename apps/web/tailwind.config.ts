import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        display: ["Manrope", "Inter", "sans-serif"],
      },
      colors: {
        bg: "hsl(var(--bg))",
        "bg-grad-1": "hsl(var(--bg-grad-1))",
        "bg-grad-2": "hsl(var(--bg-grad-2))",
        surface: "hsl(var(--surface))",
        "surface-soft": "hsl(var(--surface-soft))",
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        ink: "hsl(var(--ink))",
        "ink-2": "hsl(var(--ink-2))",
        muted: "hsl(var(--muted))",
        "muted-2": "hsl(var(--muted-2))",
        blue: {
          DEFAULT: "hsl(var(--blue))",
          50: "hsl(var(--blue-50))",
          100: "hsl(var(--blue-100))",
          600: "hsl(var(--blue-600))",
          700: "hsl(var(--blue-700))",
        },
        green: {
          DEFAULT: "hsl(var(--green))",
          soft: "hsl(var(--green-soft))",
          ink: "hsl(var(--green-ink))",
        },
        red: {
          DEFAULT: "hsl(var(--red))",
          soft: "hsl(var(--red-soft))",
          ink: "hsl(var(--red-ink))",
        },
        orange: {
          DEFAULT: "hsl(var(--orange))",
          soft: "hsl(var(--orange-soft))",
          ink: "hsl(var(--orange-ink))",
        },
        purple: {
          DEFAULT: "hsl(var(--purple))",
          soft: "hsl(var(--purple-soft))",
          ink: "hsl(var(--purple-ink))",
        },
      },
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
        "2xl": "var(--r-2xl)",
      },
      boxShadow: {
        "card-sm": "0 1px 2px rgba(16, 24, 40, 0.04)",
        card:
          "0 4px 14px rgba(16, 24, 40, 0.05), 0 1px 3px rgba(16, 24, 40, 0.04)",
        "card-lg":
          "0 12px 32px rgba(16, 24, 40, 0.08), 0 2px 6px rgba(16, 24, 40, 0.04)",
      },
      keyframes: {
        "wave-hand": {
          "0%, 60%, 100%": { transform: "rotate(0deg)" },
          "10%, 30%": { transform: "rotate(14deg)" },
          "20%": { transform: "rotate(-8deg)" },
          "40%": { transform: "rotate(-4deg)" },
          "50%": { transform: "rotate(10deg)" },
        },
        "fly-away": {
          "0%": { transform: "translateX(0) scale(1)", opacity: "1" },
          "100%": { transform: "translateX(60px) scale(0.9)", opacity: "0" },
        },
      },
      animation: {
        "wave-hand": "wave-hand 2.5s ease-in-out infinite",
        "fly-away": "fly-away 0.5s ease-out forwards",
      },
    },
  },
  plugins: [animate],
};

export default config;
