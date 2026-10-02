/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#1b1f2a", 2: "#262b38", 3: "#343a4a", muted: "#6a6f7d" },
        paper: { DEFAULT: "#F3F0E7", raised: "#FBFAF6", line: "#E3DED1", dim: "#ECE8DC" },
        signal: {
          good: "#2E7D4F", "good-soft": "#E3F0E6",
          watch: "#B7791F", "watch-soft": "#F7EBD3",
          flag: "#B42318", "flag-soft": "#F8E1DE",
        },
      },
      fontFamily: { display: ["Georgia", "serif"] },
      fontSize: { "2xs": ["0.6875rem", "1rem"] },
      boxShadow: { float: "0 20px 40px -20px rgba(0,0,0,.35)" },
      keyframes: {
        "fade-up": { from: { opacity: 0, transform: "translateY(4px)" }, to: { opacity: 1 } },
        shimmer: { to: { transform: "translateX(100%)" } },
      },
      animation: { "fade-up": "fade-up .3s ease-out", shimmer: "shimmer 1.4s infinite" },
    },
  },
  plugins: [],
};
