import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0e1a",
        panel: "#121725",
        border: "#1f2937",
        accent: "#a78bfa",
        ok: "#34d399",
        warn: "#fb923c",
        danger: "#f87171",
        info: "#60a5fa",
      },
      animation: {
        "pulse-danger": "pulse-danger 0.5s ease-in-out 2",
        "slide-up": "slide-up 0.4s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
      },
      keyframes: {
        "pulse-danger": {
          "0%, 100%": { backgroundColor: "rgba(248, 113, 113, 0.2)" },
          "50%": { backgroundColor: "rgba(248, 113, 113, 0.8)" },
        },
        "slide-up": {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
} satisfies Config;
