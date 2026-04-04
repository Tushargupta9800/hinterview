import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f3fbfc",
        ink: "#161c24",
        accent: "#da5233",
        pine: "#299a8d",
        gold: "#ffbf00",
        mist: "#f1f7f6",
        brand: {
          ink: "#161c24",
          inkSoft: "#212b36",
          teal: "#299a8d",
          tealSoft: "#59b9b0",
          surface: "#f1f7f6",
          panel: "#f3fbfc",
          line: "#dbe7ec",
          coral: "#da5233",
          amber: "#ffbf00"
        }
      },
      fontFamily: {
        sans: ["Avenir Next", "Segoe UI", "sans-serif"]
      },
      boxShadow: {
        card: "0 20px 60px rgba(22, 28, 36, 0.10)"
      }
    }
  },
  plugins: []
} satisfies Config;
