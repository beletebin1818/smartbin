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
        brand: {
          DEFAULT: "#2F7EFF",  // bright blue — primary accent
          light: "#4DA3FF",    // light blue — hover / active
          dark: "#7EA8FF",     // soft blue — secondary accents
        },
        navy: {
          900: "#0B0F26",      // dark navy — primary background
          800: "#171D3D",      // dark blue — cards / sidebar
          700: "#29345E",      // blue border
        },
        smartblue: {
          DEFAULT: "#2F7EFF",  // bright blue — primary buttons
          hover: "#4DA3FF",    // light blue — hover states
          soft: "#7EA8FF",     // soft blue — secondary accents
        },
        gold: "#FFC83D",       // golden yellow — notifications / warnings
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
