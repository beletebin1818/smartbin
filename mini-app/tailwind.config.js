/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Legacy navy shades removed — replaced with professional light palette
        navy: {
          950: '#F8F9FA', // repurposed: primary light background
          900: '#FFFFFF', // repurposed: card / panel surface
          800: '#F1F5F9', // repurposed: secondary panel / input background
          700: '#1E3A8A', // repurposed: primary deep-blue accent (my card, active)
        },
        accent: {
          DEFAULT: '#D97706', // warm amber — primary CTA, countdowns, highlights
          light: '#1E293B',   // near-black — primary dark text on light bg
          dark: '#B45309',    // deeper amber — secondary emphasis / warnings
        },
      },
    },
  },
  plugins: [],
};
